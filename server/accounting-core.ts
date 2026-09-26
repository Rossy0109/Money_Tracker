/**
 * Accounting Core — Ledger-based financial statement generation.
 *
 * All computations read from finance_ledger_entries joined with
 * finance_chart_of_accounts and finance_account_types.  Monetary values
 * are carried as strings through the query layer and converted to
 * Numbers only at the very end for report output.  Every intermediate
 * sum uses integer-cents arithmetic (multiply by 100, add, divide at end)
 * to avoid IEEE-754 rounding issues.
 *
 * Invariants enforced:
 *   - Trial Balance: totalDebit === totalCredit
 *   - Balance Sheet: assets === liabilities + equity
 *   - Every voucher: sum(debits) === sum(credits)  (checked at insert time)
 */

import { eq, and, gte, inArray, lte, sql } from "drizzle-orm";
import { assertOwnedProject, databaseRequired, getDb } from "./db";
import {
  financeChartOfAccounts,
  financeAccountTypes,
  financeLedgerEntries,
  financeVouchers,
  financeFiscalPeriods,
  financePeriodLocks,
} from "../drizzle/schema";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Multiply a decimal-string by 100 and round to integer cents. */
function toCents(v: string | number): number {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Math.round(n * 100);
}

/** Convert integer cents back to a decimal number. */
function fromCents(c: number): number {
  return c / 100;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrialBalanceLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountNameBn: string | null;
  accountType: string; // ASSET, LIABILITY, …
  normalBalance: "debit" | "credit";
  debit: number; // always ≥ 0
  credit: number; // always ≥ 0
}

export interface TrialBalanceReport {
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface IncomeStatementLine {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountNameBn: string | null;
  amount: number;
}

export interface IncomeStatementReport {
  revenue: IncomeStatementLine[];
  totalRevenue: number;
  expenses: IncomeStatementLine[];
  totalExpenses: number;
  netIncome: number; // revenue − expenses
}

export interface BalanceSheetLine {
  /** `null` for the derived retained-earnings line when the chart has no 3200. */
  accountId: number | null;
  accountCode: string;
  accountName: string;
  accountNameBn: string | null;
  amount: number;
}

export interface BalanceSheetReport {
  assets: BalanceSheetLine[];
  totalAssets: number;
  liabilities: BalanceSheetLine[];
  totalLiabilities: number;
  equity: BalanceSheetLine[];
  totalEquity: number;
  isBalanced: boolean;
}

export interface AccountingReport {
  trialBalance: TrialBalanceReport;
  incomeStatement: IncomeStatementReport;
  balanceSheet: BalanceSheetReport;
  generatedAt: Date;
}

// ─── Core Queries ───────────────────────────────────────────────────────────

/**
 * Compute per-account debit / credit totals from ledger entries,
 * optionally scoped by date range.
 */
async function accountBalances(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<Map<number, { debitCents: number; creditCents: number }>> {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeLedgerEntries.chartOfAccountId, financeChartOfAccounts.id),
    eq(financeChartOfAccounts.projectId, projectId),
    eq(financeVouchers.id, financeLedgerEntries.voucherId),
    eq(financeVouchers.projectId, projectId),
    eq(financeVouchers.userId, userId),
    inArray(financeVouchers.status, ["posted", "reversed"]),
  ];
  if (from) conditions.push(gte(financeVouchers.date, from));
  if (to) conditions.push(lte(financeVouchers.date, to));

  const rows = await db
    .select({
      accountId: financeChartOfAccounts.id,
      entryType: financeLedgerEntries.entryType,
      amount: financeLedgerEntries.amount,
    })
    .from(financeLedgerEntries)
    .innerJoin(
      financeVouchers,
      eq(financeLedgerEntries.voucherId, financeVouchers.id)
    )
    .innerJoin(
      financeChartOfAccounts,
      eq(financeLedgerEntries.chartOfAccountId, financeChartOfAccounts.id)
    )
    .where(and(...conditions));

  const map = new Map<number, { debitCents: number; creditCents: number }>();
  for (const row of rows) {
    const existing = map.get(row.accountId) ?? {
      debitCents: 0,
      creditCents: 0,
    };
    const amt = toCents(row.amount);
    if (row.entryType === "debit") {
      existing.debitCents += amt;
    } else {
      existing.creditCents += amt;
    }
    map.set(row.accountId, existing);
  }
  return map;
}

/**
 * Fetch all detail (leaf) accounts for a project with their account type info.
 *
 * Only `isDetail` accounts can receive voucher entries (see
 * `assertCanonicalAccountTx` in db.ts), so header/group accounts would only ever
 * carry a zero balance and are excluded to keep the statements readable and free
 * of double-counted subtotals.
 */
async function detailAccounts(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: financeChartOfAccounts.id,
      code: financeChartOfAccounts.code,
      name: financeChartOfAccounts.name,
      nameBn: financeChartOfAccounts.nameBn,
      accountTypeCode: financeAccountTypes.code,
      normalBalance: financeAccountTypes.normalBalance,
      isDetail: financeChartOfAccounts.isDetail,
      openingBalance: financeChartOfAccounts.openingBalance,
    })
    .from(financeChartOfAccounts)
    .innerJoin(
      financeAccountTypes,
      eq(financeChartOfAccounts.accountTypeId, financeAccountTypes.id)
    )
    .where(
      and(
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId),
        eq(financeChartOfAccounts.isActive, true),
        eq(financeChartOfAccounts.isDetail, true)
      )
    )
    .orderBy(financeChartOfAccounts.code);
}

// ─── Trial Balance ──────────────────────────────────────────────────────────

/**
 * Generate a Trial Balance from ledger entries for a project.
 *
 * For each detail account the ledger is aggregated:
 *   - normalBalance = "debit"  →  balance = debit − credit  (positive = normal)
 *   - normalBalance = "credit" →  balance = credit − debit  (positive = normal)
 *
 * A positive normal balance is placed in the account's natural column;
 * a negative balance is placed in the opposite column (contra).
 */
export async function generateTrialBalance(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<TrialBalanceReport> {
  await assertOwnedProject(userId, projectId);
  const [accounts, balances] = await Promise.all([
    detailAccounts(userId, projectId),
    accountBalances(userId, projectId, from, to),
  ]);

  const lines: TrialBalanceLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const acc of accounts) {
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    const openingCents = from ? 0 : toCents(acc.openingBalance ?? 0);
    const netNormal =
      acc.normalBalance === "debit"
        ? openingCents + bal.debitCents - bal.creditCents
        : openingCents + bal.creditCents - bal.debitCents;

    let debit = 0;
    let credit = 0;
    if (acc.normalBalance === "debit") {
      if (netNormal >= 0) {
        debit = netNormal;
      } else {
        credit = -netNormal;
      }
    } else {
      if (netNormal >= 0) {
        credit = netNormal;
      } else {
        debit = -netNormal;
      }
    }

    totalDebitCents += debit;
    totalCreditCents += credit;

    lines.push({
      accountId: acc.id,
      accountCode: acc.code,
      accountName: acc.name,
      accountNameBn: acc.nameBn,
      accountType: acc.accountTypeCode,
      normalBalance: acc.normalBalance as "debit" | "credit",
      debit: fromCents(debit),
      credit: fromCents(credit),
    });
  }

  const totalDebit = fromCents(totalDebitCents);
  const totalCredit = fromCents(totalCreditCents);

  return {
    lines,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebitCents - totalCreditCents) < 1, // < 1 cent tolerance
  };
}

// ─── Income Statement ───────────────────────────────────────────────────────

/**
 * Generate an Income Statement (Profit & Loss) from ledger entries.
 *
 * Revenue accounts (normalBalance = "credit") → positive balance = revenue.
 * Expense accounts (normalBalance = "debit")  → positive balance = expense.
 */
export async function generateIncomeStatement(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<IncomeStatementReport> {
  await assertOwnedProject(userId, projectId);
  const [accounts, balances] = await Promise.all([
    detailAccounts(userId, projectId),
    accountBalances(userId, projectId, from, to),
  ]);

  const revenueLines: IncomeStatementLine[] = [];
  const expenseLines: IncomeStatementLine[] = [];
  let totalRevenueCents = 0;
  let totalExpenseCents = 0;

  for (const acc of accounts) {
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    const openingCents = from ? 0 : toCents(acc.openingBalance ?? 0);

    if (acc.accountTypeCode === "REVENUE") {
      // Revenue: credit − debit = positive means earned
      const net = openingCents + bal.creditCents - bal.debitCents;
      if (net > 0) {
        totalRevenueCents += net;
        revenueLines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountNameBn: acc.nameBn,
          amount: fromCents(net),
        });
      }
    } else if (acc.accountTypeCode === "EXPENSE") {
      // Expense: debit − credit = positive means spent
      const net = openingCents + bal.debitCents - bal.creditCents;
      if (net > 0) {
        totalExpenseCents += net;
        expenseLines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountNameBn: acc.nameBn,
          amount: fromCents(net),
        });
      }
    }
  }

  return {
    revenue: revenueLines,
    totalRevenue: fromCents(totalRevenueCents),
    expenses: expenseLines,
    totalExpenses: fromCents(totalExpenseCents),
    netIncome: fromCents(totalRevenueCents - totalExpenseCents),
  };
}

// ─── Balance Sheet ──────────────────────────────────────────────────────────

/** Chart code the cumulative profit/loss is reported under in equity. */
const RETAINED_EARNINGS_CODE = "3200";

/**
 * Generate a Balance Sheet from ledger entries.
 *
 * Asset accounts     → debit balance
 * Liability accounts → credit balance
 * Equity accounts    → credit balance (capital, retained earnings)
 *
 * Equity also carries *retained earnings*: the cumulative profit or loss since
 * inception (`to` as-of), because revenue and expense accounts are closed into
 * equity rather than left to sit on the balance sheet. Without it a book that
 * has earned or spent anything reports assets ≠ liabilities + equity.
 */
export async function generateBalanceSheet(
  userId: number,
  projectId: number,
  asOf?: Date
): Promise<BalanceSheetReport> {
  await assertOwnedProject(userId, projectId);
  const [accounts, balances] = await Promise.all([
    detailAccounts(userId, projectId),
    accountBalances(userId, projectId, undefined, asOf),
  ]);

  const assetLines: BalanceSheetLine[] = [];
  const liabilityLines: BalanceSheetLine[] = [];
  const equityLines: BalanceSheetLine[] = [];
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let totalEquityCents = 0;
  let revenueCents = 0;
  let expenseCents = 0;
  // Retained earnings ride on the real 3200 account when the chart has one, so
  // the balance sheet shows a single Retained Earnings row.
  let retainedEarningsLine: BalanceSheetLine | null = null;

  for (const acc of accounts) {
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };

    const openingCents = toCents(acc.openingBalance ?? 0);
    if (acc.accountTypeCode === "ASSET") {
      const net = openingCents + bal.debitCents - bal.creditCents;
      if (net !== 0) {
        totalAssetsCents += net;
        assetLines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountNameBn: acc.nameBn,
          amount: fromCents(net),
        });
      }
    } else if (acc.accountTypeCode === "LIABILITY") {
      const net = openingCents + bal.creditCents - bal.debitCents;
      if (net !== 0) {
        totalLiabilitiesCents += net;
        liabilityLines.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountNameBn: acc.nameBn,
          amount: fromCents(net),
        });
      }
    } else if (acc.accountTypeCode === "EQUITY") {
      const net = openingCents + bal.creditCents - bal.debitCents;
      if (net !== 0) {
        totalEquityCents += net;
        const line: BalanceSheetLine = {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          accountNameBn: acc.nameBn,
          amount: fromCents(net),
        };
        equityLines.push(line);
        if (acc.code === RETAINED_EARNINGS_CODE) retainedEarningsLine = line;
      }
    } else if (acc.accountTypeCode === "REVENUE") {
      revenueCents += openingCents + bal.creditCents - bal.debitCents;
    } else if (acc.accountTypeCode === "EXPENSE") {
      expenseCents += openingCents + bal.debitCents - bal.creditCents;
    }
  }

  // Close the profit/loss accounts into equity so the statement ties.
  const retainedCents = revenueCents - expenseCents;
  if (retainedCents !== 0) {
    if (retainedEarningsLine) {
      retainedEarningsLine.amount = fromCents(
        toCents(retainedEarningsLine.amount) + retainedCents
      );
    } else {
      equityLines.push({
        accountId: null,
        accountCode: RETAINED_EARNINGS_CODE,
        accountName: "Retained Earnings",
        accountNameBn: "সঞ্চিত মুনাফা",
        amount: fromCents(retainedCents),
      });
    }
    totalEquityCents += retainedCents;
  }
  // A retained-earnings line that nets to zero is noise.
  for (let index = equityLines.length - 1; index >= 0; index -= 1) {
    if (toCents(equityLines[index].amount) === 0) equityLines.splice(index, 1);
  }

  const totalAssets = fromCents(totalAssetsCents);
  const totalLiabilities = fromCents(totalLiabilitiesCents);
  const totalEquity = fromCents(totalEquityCents);

  return {
    assets: assetLines,
    totalAssets,
    liabilities: liabilityLines,
    totalLiabilities,
    equity: equityLines,
    totalEquity,
    isBalanced:
      Math.abs(totalAssetsCents - (totalLiabilitiesCents + totalEquityCents)) <
      1,
  };
}

// ─── Combined Report ────────────────────────────────────────────────────────

/**
 * Generate all three financial statements in one call.
 */
export async function generateAccountingReport(
  userId: number,
  projectId: number,
  period?: { from?: Date; to?: Date }
): Promise<AccountingReport> {
  const [trialBalance, incomeStatement, balanceSheet] = await Promise.all([
    // Cumulative as-of `to`, never period-scoped: a trial balance that starts at
    // `from` is a subtotal, it drops the opening balances that the balance sheet
    // still carries, and the two statements then disagree for the same inputs.
    generateTrialBalance(userId, projectId, undefined, period?.to),
    generateIncomeStatement(userId, projectId, period?.from, period?.to),
    generateBalanceSheet(userId, projectId, period?.to),
  ]);

  return {
    trialBalance,
    incomeStatement,
    balanceSheet,
    generatedAt: new Date(),
  };
}

// ─── Fiscal Period Management ───────────────────────────────────────────────

export async function createFiscalPeriod(
  userId: number,
  projectId: number,
  input: { name: string; startDate: Date; endDate: Date }
) {
  if (input.startDate >= input.endDate) {
    throw new Error("শুরুর তারিখ শেষের তারিখের আগে হতে হবে");
  }
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeFiscalPeriods).values({
    userId,
    projectId,
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: "open",
  });
  return { id: Number(result[0].insertId) };
}

export async function listFiscalPeriods(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financeFiscalPeriods)
    .where(
      and(
        eq(financeFiscalPeriods.userId, userId),
        eq(financeFiscalPeriods.projectId, projectId)
      )
    )
    .orderBy(financeFiscalPeriods.startDate);
}

export async function closeFiscalPeriod(
  userId: number,
  projectId: number,
  periodId: number
) {
  const db = databaseRequired(await getDb());
  const [period] = await db
    .select()
    .from(financeFiscalPeriods)
    .where(
      and(
        eq(financeFiscalPeriods.id, periodId),
        eq(financeFiscalPeriods.userId, userId),
        eq(financeFiscalPeriods.projectId, projectId)
      )
    )
    .limit(1);

  if (!period) throw new Error("Fiscal period not found");
  if (period.status === "closed") throw new Error("Period already closed");

  // Close all locked months that fall within this period
  const lockedMonths = await db
    .select({ monthKey: financePeriodLocks.monthKey })
    .from(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        gte(financePeriodLocks.lockedAt, period.startDate),
        lte(financePeriodLocks.lockedAt, period.endDate)
      )
    );

  await db
    .update(financeFiscalPeriods)
    .set({
      status: "closed",
      closedAt: new Date(),
      closedBy: userId,
    })
    .where(eq(financeFiscalPeriods.id, periodId));

  return { closed: true, lockedMonthsFound: lockedMonths.length };
}

// ─── Period Lock Enforcement ────────────────────────────────────────────────

/**
 * Assert that a given date does not fall within a locked period.
 * Called before voucher posting to prevent edits to closed months.
 */
export async function assertPeriodNotLocked(
  projectId: number,
  date: Date
): Promise<void> {
  const monthKey = date.toISOString().slice(0, 7); // YYYY-MM
  const db = databaseRequired(await getDb());
  const [lock] = await db
    .select()
    .from(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        eq(financePeriodLocks.monthKey, monthKey)
      )
    )
    .limit(1);

  if (lock) {
    throw new Error(
      `এই মাসের (${monthKey}) হিসাব বন্ধ করা হয়েছে। অনুগ্রহ করে অ্যাডমিনের সাথে যোগাযোগ করুন।`
    );
  }
}

// ─── Account Ledger ──────────────────────────────────────────────────────────

export interface AccountLedgerLine {
  date: Date;
  voucherNo: string;
  journalNo: string | null;
  narration: string | null;
  entryType: "debit" | "credit";
  amount: number;
  runningBalance: number;
}

export interface AccountLedgerReport {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountNameBn: string | null;
  accountType: string;
  normalBalance: "debit" | "credit";
  lines: AccountLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/**
 * Generate an Account Ledger report for a single account.
 * Shows all journal/ledger entries in date order with running balance.
 */
export async function generateAccountLedger(
  userId: number,
  projectId: number,
  accountId: number,
  from?: Date,
  to?: Date
): Promise<AccountLedgerReport> {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [account] = await db
    .select({
      id: financeChartOfAccounts.id,
      code: financeChartOfAccounts.code,
      name: financeChartOfAccounts.name,
      nameBn: financeChartOfAccounts.nameBn,
      accountTypeCode: financeAccountTypes.code,
      normalBalance: financeAccountTypes.normalBalance,
      openingBalance: financeChartOfAccounts.openingBalance,
    })
    .from(financeChartOfAccounts)
    .innerJoin(
      financeAccountTypes,
      eq(financeChartOfAccounts.accountTypeId, financeAccountTypes.id)
    )
    .where(
      and(
        eq(financeChartOfAccounts.id, accountId),
        eq(financeChartOfAccounts.projectId, projectId),
        eq(financeChartOfAccounts.userId, userId)
      )
    )
    .limit(1);

  if (!account) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

  const conditions = [
    eq(financeLedgerEntries.chartOfAccountId, accountId),
    eq(financeVouchers.id, financeLedgerEntries.voucherId),
    eq(financeVouchers.projectId, projectId),
    eq(financeVouchers.userId, userId),
    inArray(financeVouchers.status, ["posted", "reversed"]),
  ];
  if (from) conditions.push(gte(financeVouchers.date, from));
  if (to) conditions.push(lte(financeVouchers.date, to));

  const rows = await db
    .select({
      date: financeVouchers.date,
      voucherNo: financeVouchers.voucherNo,
      narration: financeLedgerEntries.amount, // placeholder, we'll join voucher narration
      entryType: financeLedgerEntries.entryType,
      amount: financeLedgerEntries.amount,
      runningBalance: financeLedgerEntries.runningBalance,
      voucherNarration: financeVouchers.narration,
    })
    .from(financeLedgerEntries)
    .innerJoin(
      financeVouchers,
      eq(financeLedgerEntries.voucherId, financeVouchers.id)
    )
    .where(and(...conditions))
    .orderBy(financeVouchers.date, financeLedgerEntries.id);

  const lines: AccountLedgerLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const row of rows) {
    const amt = toCents(row.amount);
    const rb = toCents(row.runningBalance);
    if (row.entryType === "debit") totalDebitCents += amt;
    else totalCreditCents += amt;

    lines.push({
      date: row.date,
      voucherNo: row.voucherNo,
      journalNo: null,
      narration: row.voucherNarration,
      entryType: row.entryType as "debit" | "credit",
      amount: fromCents(amt),
      runningBalance: fromCents(rb),
    });
  }

  const openingCents = toCents(account.openingBalance ?? 0);
  const netNormal =
    account.normalBalance === "debit"
      ? openingCents + totalDebitCents - totalCreditCents
      : openingCents + totalCreditCents - totalDebitCents;

  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    accountNameBn: account.nameBn,
    accountType: account.accountTypeCode,
    normalBalance: account.normalBalance as "debit" | "credit",
    lines,
    totalDebit: fromCents(totalDebitCents),
    totalCredit: fromCents(totalCreditCents),
    closingBalance: fromCents(netNormal),
  };
}

// ─── Cash Flow Statement (Indirect Method) ──────────────────────────────────

export interface CashFlowSection {
  label: string;
  items: Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    amount: number;
  }>;
  total: number;
}

export interface CashFlowReport {
  operatingActivities: CashFlowSection;
  investingActivities: CashFlowSection;
  financingActivities: CashFlowSection;
  netChangeInCash: number;
  openingCash: number;
  closingCash: number;
  generatedAt: Date;
}

/**
 * Generate a Cash Flow Statement using the indirect method.
 *
 * Operating: starts from net income, adjusts for non-cash items and working capital changes.
 * Investing: capital expenditures, asset purchases/sales.
 * Financing: loans, equity, dividends.
 *
 * Classification is inferred from account codes:
 *   - 1xxx = Asset (debit-normal), 2xxx = Liability (credit-normal), 3xxx = Equity
 *   - 4xxx = Revenue, 5xxx = Expense
 *   - Cash/Bank accounts: 1110, 1120 (Cash in Hand, Cash at Bank)
 */
export async function generateCashFlowStatement(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<CashFlowReport> {
  const [accounts, balances] = await Promise.all([
    detailAccounts(userId, projectId),
    accountBalances(userId, projectId, from, to),
  ]);

  // Find cash accounts (code starts with 11)
  const cashAccounts = accounts.filter(a => a.code.startsWith("11"));
  const cashAccountIds = new Set(cashAccounts.map(a => a.id));

  // Compute net income from revenue/expense
  let totalRevenueCents = 0;
  let totalExpenseCents = 0;
  for (const acc of accounts) {
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    if (acc.accountTypeCode === "REVENUE")
      totalRevenueCents += bal.creditCents - bal.debitCents;
    else if (acc.accountTypeCode === "EXPENSE")
      totalExpenseCents += bal.debitCents - bal.creditCents;
  }
  const netIncomeCents = totalRevenueCents - totalExpenseCents;

  // Operating activities: net income + changes in working capital (non-cash accounts 12xx-19xx, 2xxx)
  const operatingItems: CashFlowSection["items"] = [];
  let operatingTotalCents = netIncomeCents;

  for (const acc of accounts) {
    if (cashAccountIds.has(acc.id)) continue; // Skip cash accounts
    if (!acc.isDetail) continue;
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    const net =
      acc.normalBalance === "debit"
        ? bal.debitCents - bal.creditCents
        : bal.creditCents - bal.debitCents;

    if (
      acc.accountTypeCode === "ASSET" &&
      acc.code.startsWith("1") &&
      !acc.code.startsWith("11")
    ) {
      // Non-cash asset increase = cash outflow (negative)
      if (net !== 0) {
        operatingItems.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          amount: fromCents(-net),
        });
        operatingTotalCents -= net;
      }
    } else if (acc.accountTypeCode === "LIABILITY") {
      // Liability increase = cash inflow (positive)
      if (net !== 0) {
        operatingItems.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          amount: fromCents(net),
        });
        operatingTotalCents += net;
      }
    }
  }

  // Investing activities: capital assets (13xx-19xx)
  const investingItems: CashFlowSection["items"] = [];
  let investingTotalCents = 0;

  for (const acc of accounts) {
    if (
      !acc.isDetail ||
      !acc.accountTypeCode ||
      acc.accountTypeCode !== "ASSET"
    )
      continue;
    if (
      !acc.code.startsWith("13") &&
      !acc.code.startsWith("14") &&
      !acc.code.startsWith("15") &&
      !acc.code.startsWith("16") &&
      !acc.code.startsWith("17") &&
      !acc.code.startsWith("18") &&
      !acc.code.startsWith("19")
    )
      continue;
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    const net = bal.debitCents - bal.creditCents;
    if (net !== 0) {
      investingItems.push({
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        amount: fromCents(-net),
      });
      investingTotalCents -= net;
    }
  }

  // Financing activities: equity (3xxx) and long-term liabilities (23xx+)
  const financingItems: CashFlowSection["items"] = [];
  let financingTotalCents = 0;

  for (const acc of accounts) {
    if (!acc.isDetail) continue;
    const bal = balances.get(acc.id) ?? { debitCents: 0, creditCents: 0 };
    if (acc.accountTypeCode === "EQUITY") {
      const net = bal.creditCents - bal.debitCents;
      if (net !== 0) {
        financingItems.push({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          amount: fromCents(net),
        });
        financingTotalCents += net;
      }
    }
  }

  // Cash balances.
  //
  // Opening cash = cash-account balances immediately before the period start
  // (`from`), i.e. all posted ledger entries on or before the instant just
  // before `from`. For a full-history report (`from` unset) the opening
  // position is zero by definition.
  const openingBalances = from
    ? await accountBalances(
        userId,
        projectId,
        undefined,
        new Date(from.getTime() - 1)
      )
    : null;

  let openingCashCents = 0;
  if (openingBalances) {
    for (const acc of cashAccounts) {
      const bal = openingBalances.get(acc.id) ?? {
        debitCents: 0,
        creditCents: 0,
      };
      openingCashCents +=
        toCents(acc.openingBalance ?? 0) + bal.debitCents - bal.creditCents;
    }
  }

  // Closing cash is derived from the same chain as the statement aggregates:
  // opening + net change, so opening/closing/netChange are always consistent.
  const netChangeCents =
    operatingTotalCents + investingTotalCents + financingTotalCents;
  const closingCashCents = openingCashCents + netChangeCents;

  return {
    operatingActivities: {
      label: "Operating Activities",
      items: operatingItems,
      total: fromCents(operatingTotalCents),
    },
    investingActivities: {
      label: "Investing Activities",
      items: investingItems,
      total: fromCents(investingTotalCents),
    },
    financingActivities: {
      label: "Financing Activities",
      items: financingItems,
      total: fromCents(financingTotalCents),
    },
    netChangeInCash: fromCents(netChangeCents),
    openingCash: fromCents(openingCashCents),
    closingCash: fromCents(closingCashCents),
    generatedAt: new Date(),
  };
}

// ─── Daily Transaction Report ───────────────────────────────────────────────

export interface DailyTransactionLine {
  date: string;
  voucherCount: number;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

export interface DailyTransactionReport {
  lines: DailyTransactionLine[];
  totalDebit: number;
  totalCredit: number;
  periodFrom: Date | null;
  periodTo: Date | null;
}

/**
 * Generate a Daily Transaction Report grouped by date.
 */
export async function generateDailyTransactions(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<DailyTransactionReport> {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeVouchers.projectId, projectId),
    eq(financeVouchers.userId, userId),
    inArray(financeVouchers.status, ["posted", "reversed"]),
  ];
  if (from) conditions.push(gte(financeVouchers.date, from));
  if (to) conditions.push(lte(financeVouchers.date, to));

  const rows = await db
    .select({
      date: sql<string>`DATE(${financeVouchers.date})`,
      voucherCount: sql<number>`COUNT(*)`,
      totalDebit: sql<string>`SUM(${financeVouchers.totalDebit})`,
      totalCredit: sql<string>`SUM(${financeVouchers.totalCredit})`,
    })
    .from(financeVouchers)
    .where(and(...conditions))
    .groupBy(sql`DATE(${financeVouchers.date})`)
    .orderBy(sql`DATE(${financeVouchers.date})`);

  const lines: DailyTransactionLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const row of rows) {
    const dc = toCents(row.totalDebit);
    const cc = toCents(row.totalCredit);
    totalDebitCents += dc;
    totalCreditCents += cc;
    lines.push({
      date: row.date,
      voucherCount: row.voucherCount,
      totalDebit: fromCents(dc),
      totalCredit: fromCents(cc),
      netAmount: fromCents(dc - cc),
    });
  }

  return {
    lines,
    totalDebit: fromCents(totalDebitCents),
    totalCredit: fromCents(totalCreditCents),
    periodFrom: from ?? null,
    periodTo: to ?? null,
  };
}

// ─── Monthly Transaction Report ─────────────────────────────────────────────

export interface MonthlyTransactionLine {
  monthKey: string;
  voucherCount: number;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

export interface MonthlyTransactionReport {
  lines: MonthlyTransactionLine[];
  totalDebit: number;
  totalCredit: number;
  periodFrom: Date | null;
  periodTo: Date | null;
}

/**
 * Generate a Monthly Transaction Report grouped by YYYY-MM.
 */
export async function generateMonthlyTransactions(
  userId: number,
  projectId: number,
  from?: Date,
  to?: Date
): Promise<MonthlyTransactionReport> {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeVouchers.projectId, projectId),
    eq(financeVouchers.userId, userId),
    inArray(financeVouchers.status, ["posted", "reversed"]),
  ];
  if (from) conditions.push(gte(financeVouchers.date, from));
  if (to) conditions.push(lte(financeVouchers.date, to));

  const rows = await db
    .select({
      monthKey: sql<string>`DATE_FORMAT(${financeVouchers.date}, '%Y-%m')`,
      voucherCount: sql<number>`COUNT(*)`,
      totalDebit: sql<string>`SUM(${financeVouchers.totalDebit})`,
      totalCredit: sql<string>`SUM(${financeVouchers.totalCredit})`,
    })
    .from(financeVouchers)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(${financeVouchers.date}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${financeVouchers.date}, '%Y-%m')`);

  const lines: MonthlyTransactionLine[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  for (const row of rows) {
    const dc = toCents(row.totalDebit);
    const cc = toCents(row.totalCredit);
    totalDebitCents += dc;
    totalCreditCents += cc;
    lines.push({
      monthKey: row.monthKey,
      voucherCount: row.voucherCount,
      totalDebit: fromCents(dc),
      totalCredit: fromCents(cc),
      netAmount: fromCents(dc - cc),
    });
  }

  return {
    lines,
    totalDebit: fromCents(totalDebitCents),
    totalCredit: fromCents(totalCreditCents),
    periodFrom: from ?? null,
    periodTo: to ?? null,
  };
}
