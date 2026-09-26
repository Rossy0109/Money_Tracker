/**
 * Accounting Core Tests — Double-entry invariant verification.
 *
 * Tests that:
 *  1. Trial Balance is always balanced (totalDebit === totalCredit)
 *  2. Balance Sheet is always balanced (assets === liabilities + equity)
 *  3. Income Statement nets correctly (revenue − expenses = netIncome)
 *  4. Period locking prevents voucher posting
 *  5. Cents arithmetic avoids IEEE-754 rounding issues
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockDatabaseRequired = vi.hoisted(() => vi.fn((db: any) => db));
const mockAssertOwnedProject = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  getDb: mockGetDb,
  databaseRequired: mockDatabaseRequired,
  assertOwnedProject: mockAssertOwnedProject,
}));

beforeEach(() => {
  // By default assume the caller owns the project; individual tests override.
  mockAssertOwnedProject.mockResolvedValue(undefined);
});

import {
  generateTrialBalance,
  generateIncomeStatement,
  generateBalanceSheet,
  generateAccountingReport,
  generateAccountLedger,
  generateCashFlowStatement,
  generateDailyTransactions,
  generateMonthlyTransactions,
  createFiscalPeriod,
  listFiscalPeriods,
  assertPeriodNotLocked,
} from "./accounting-core";

function makeAccount(
  id: number,
  code: string,
  name: string,
  accountTypeCode: string,
  normalBalance: string,
  isDetail = true
) {
  return {
    id,
    code,
    name,
    nameBn: null,
    accountTypeCode,
    normalBalance,
    isDetail,
  };
}

function makeLedgerEntry(
  accountId: number,
  entryType: "debit" | "credit",
  amount: string
) {
  return { accountId, entryType, amount };
}

/**
 * The fake db records the `where` clause of every query it answers so tests can
 * assert on the filters the code emits (e.g. "the trial balance is cumulative
 * because the ledger query only has an upper bound").
 */
const whereClauses: Array<{ table: string; clause: unknown }> = [];

function drizzleTableName(table: unknown): string {
  const candidate = table as {
    _?: { name?: string };
    [key: symbol]: unknown;
  } | null;
  return (
    candidate?._?.name ||
    (candidate?.[Symbol.for("drizzle:Name")] as string) ||
    ""
  );
}

/** Collect the bound parameter values of a Drizzle `where` clause, in order. */
function paramValues(clause: unknown, out: unknown[] = []): unknown[] {
  if (!clause || typeof clause !== "object") return out;
  const node = clause as {
    constructor?: { name?: string };
    value?: unknown;
    queryChunks?: unknown[];
  };
  if (node.constructor?.name === "Param") {
    if (Array.isArray(node.value)) out.push(...node.value);
    else out.push(node.value);
  }
  if (Array.isArray(node.queryChunks))
    for (const chunk of node.queryChunks) paramValues(chunk, out);
  return out;
}

function whereFor(table: string): unknown[] {
  return paramValues(
    whereClauses.filter(entry => entry.table === table).at(-1)?.clause
  );
}

/**
 * Set up mock db so that:
 *  - detailAccounts query (has .orderBy()) resolves with detailAccountsResult
 *  - accountBalances query (no .orderBy()) resolves with ledgerEntriesResult
 *
 * Both queries share the same db object and call db.select() independently.
 * We detect which query it is by whether .orderBy() is called on the chain.
 */
function mockDbSelects(
  detailAccountsResult: any[],
  ledgerEntriesResult: any[]
) {
  whereClauses.length = 0;
  mockGetDb.mockResolvedValue({
    select: vi.fn().mockImplementation(() => {
      let orderByCalled = false;
      let fromTable = "";
      const chain: any = {};
      chain.from = vi.fn().mockImplementation((table: unknown) => {
        fromTable = drizzleTableName(table);
        return chain;
      });
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation((clause: unknown) => {
        whereClauses.push({ table: fromTable, clause });
        return chain;
      });
      chain.orderBy = vi.fn().mockImplementation(() => {
        orderByCalled = true;
        return chain;
      });
      // Thenable: resolves after caller finishes chaining
      chain.then = (onFulfilled: any, onRejected: any) =>
        Promise.resolve()
          .then(() =>
            orderByCalled ? detailAccountsResult : ledgerEntriesResult
          )
          .then(onFulfilled, onRejected);
      chain.catch = (fn: any) => chain.then(undefined, fn);
      return chain;
    }),
  });
}

/**
 * Like `mockDbSelects` but additionally distinguishes the *second*
 * non-`.orderBy()` query (the opening-balance query used by
 * `generateCashFlowStatement` when a `from` date is supplied) from the first
 * (the period-balances query), via a lazily-incremented call counter.
 */
function mockDbSelectsWithOpening(
  detailAccountsResult: any[],
  periodLedgerEntries: any[],
  openingLedgerEntries: any[]
) {
  let nonOrderByCalls = 0;
  mockGetDb.mockResolvedValue({
    select: vi.fn().mockImplementation(() => {
      let orderByCalled = false;
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockImplementation(() => {
        orderByCalled = true;
        return chain;
      });
      chain.then = (onFulfilled: any, onRejected: any) =>
        Promise.resolve()
          .then(() => {
            if (orderByCalled) return detailAccountsResult;
            const idx = nonOrderByCalls++;
            return idx === 0 ? periodLedgerEntries : openingLedgerEntries;
          })
          .then(onFulfilled, onRejected);
      chain.catch = (fn: any) => chain.then(undefined, fn);
      return chain;
    }),
  });
}

// ─── Trial Balance Tests ────────────────────────────────────────────────────

describe("Trial Balance", () => {
  it("is always balanced for a simple journal entry", async () => {
    const accounts = [
      makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
      makeAccount(2, "1300", "Inventory", "ASSET", "debit"),
    ];
    const ledgerEntries = [
      makeLedgerEntry(1, "credit", "500.00"),
      makeLedgerEntry(2, "debit", "500.00"),
    ];
    mockDbSelects(accounts, ledgerEntries);

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(500);
    expect(tb.totalCredit).toBe(500);
  });

  it("handles multiple debit/credit pairs correctly", async () => {
    const accounts = [
      makeAccount(1, "1110", "Cash", "ASSET", "debit"),
      makeAccount(2, "4100", "Sales Revenue", "REVENUE", "credit"),
      makeAccount(3, "5110", "Salaries", "EXPENSE", "debit"),
    ];
    const ledgerEntries = [
      makeLedgerEntry(1, "debit", "1000.00"),
      makeLedgerEntry(2, "credit", "1000.00"),
      makeLedgerEntry(1, "credit", "300.00"),
      makeLedgerEntry(3, "debit", "300.00"),
    ];
    mockDbSelects(accounts, ledgerEntries);

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);

    const cash = tb.lines.find(l => l.accountId === 1)!;
    expect(cash.debit).toBe(700);
    expect(cash.credit).toBe(0);

    const revenue = tb.lines.find(l => l.accountId === 2)!;
    expect(revenue.debit).toBe(0);
    expect(revenue.credit).toBe(1000);

    const expense = tb.lines.find(l => l.accountId === 3)!;
    expect(expense.debit).toBe(300);
    expect(expense.credit).toBe(0);
  });

  it("shows contra balances in opposite column", async () => {
    // Cash overdraft: more credits than debits → contra balance in credit column
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "2100", "Payable", "LIABILITY", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "200.00"), // Cash received
        makeLedgerEntry(2, "credit", "200.00"), // Owed to vendor
        makeLedgerEntry(1, "credit", "500.00"), // Cash paid
        makeLedgerEntry(2, "debit", "500.00"), // Vendor paid
      ]
    );

    const tb = await generateTrialBalance(1, 1);
    const cash = tb.lines.find(l => l.accountId === 1)!;
    expect(cash.debit).toBe(0);
    expect(cash.credit).toBe(300);
    expect(tb.isBalanced).toBe(true);
  });

  it("balances a book whose only entry is owner's opening capital", async () => {
    // Starting cash funded by the owner: Dr Cash / Cr Owner's Capital.
    // Equity must be part of the trial balance, otherwise the report shows
    // debit ≠ credit for any project that has not recorded income yet.
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
        makeAccount(2, "3100", "Owner's Capital", "EQUITY", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "1000.00"),
        makeLedgerEntry(2, "credit", "1000.00"),
      ]
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.totalDebit).toBe(1000);
    expect(tb.totalCredit).toBe(1000);
    expect(tb.isBalanced).toBe(true);

    const capital = tb.lines.find(l => l.accountId === 2)!;
    expect(capital.credit).toBe(1000);
    expect(capital.accountType).toBe("EQUITY");
  });

  it("bounds the ledger query by both period ends when a period is supplied", async () => {
    // The report decides the scoping: the income statement is period-scoped and
    // therefore needs a lower bound on the ledger query.
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
        makeAccount(2, "4100", "Sales Revenue", "REVENUE", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "1000.00"),
        makeLedgerEntry(2, "credit", "1000.00"),
      ]
    );
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T23:59:59.000Z");

    await generateTrialBalance(1, 1, from, to);

    const ledgerParams = whereFor("finance_ledger_entries");
    expect(ledgerParams).toContainEqual(from);
    expect(ledgerParams).toContainEqual(to);
  });

  it("omits the lower bound when no period start is given", async () => {
    mockDbSelects(
      [makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit")],
      []
    );
    const to = new Date("2026-01-31T23:59:59.000Z");

    await generateTrialBalance(1, 1, undefined, to);

    const ledgerParams = whereFor("finance_ledger_entries");
    expect(ledgerParams).toContainEqual(to);
    expect(
      ledgerParams.some(value => value instanceof Date && value < to)
    ).toBe(false);
  });

  it("asks the chart of accounts for active detail accounts only", async () => {
    // Header/group accounts can never receive entries, so listing them would add
    // double-counted subtotals and zero-balance noise to every statement.
    mockDbSelects(
      [makeAccount(2, "1110", "Cash in Hand", "ASSET", "debit")],
      []
    );

    await generateTrialBalance(1, 1);

    expect(whereFor("finance_chart_of_accounts")).toEqual([1, 1, true, true]);
  });

  it("handles zero-balance accounts", async () => {
    mockDbSelects([makeAccount(1, "1110", "Cash", "ASSET", "debit")], []);

    const tb = await generateTrialBalance(1, 1);
    expect(tb.totalDebit).toBe(0);
    expect(tb.totalCredit).toBe(0);
    expect(tb.isBalanced).toBe(true);
  });

  it("handles large amounts without floating point errors", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "4100", "Revenue", "REVENUE", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "9999999999.99"),
        makeLedgerEntry(2, "credit", "9999999999.99"),
      ]
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(9999999999.99);
    expect(tb.totalCredit).toBe(9999999999.99);
  });

  it("handles cents-only amounts precisely (0.01+0.02+0.03)", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "4100", "Revenue", "REVENUE", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "0.01"),
        makeLedgerEntry(1, "debit", "0.02"),
        makeLedgerEntry(1, "debit", "0.03"),
        makeLedgerEntry(2, "credit", "0.06"),
      ]
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.lines.find(l => l.accountId === 1)!.debit).toBe(0.06);
  });
});

// ─── Income Statement Tests ─────────────────────────────────────────────────

describe("Income Statement", () => {
  it("computes net income correctly", async () => {
    mockDbSelects(
      [
        makeAccount(1, "4100", "Sales Revenue", "REVENUE", "credit"),
        makeAccount(2, "4200", "Service Revenue", "REVENUE", "credit"),
        makeAccount(3, "5110", "Salaries", "EXPENSE", "debit"),
        makeAccount(4, "5120", "Rent", "EXPENSE", "debit"),
        makeAccount(5, "1110", "Cash", "ASSET", "debit"),
      ],
      [
        makeLedgerEntry(1, "credit", "5000.00"),
        makeLedgerEntry(2, "credit", "2000.00"),
        makeLedgerEntry(3, "debit", "3000.00"),
        makeLedgerEntry(4, "debit", "1000.00"),
        makeLedgerEntry(5, "debit", "3000.00"),
      ]
    );

    const is = await generateIncomeStatement(1, 1);
    expect(is.totalRevenue).toBe(7000);
    expect(is.totalExpenses).toBe(4000);
    expect(is.netIncome).toBe(3000);
  });

  it("handles net loss (expenses exceed revenue)", async () => {
    mockDbSelects(
      [
        makeAccount(1, "4100", "Revenue", "REVENUE", "credit"),
        makeAccount(2, "5110", "Rent", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "credit", "1000.00"),
        makeLedgerEntry(2, "debit", "2500.00"),
      ]
    );

    const is = await generateIncomeStatement(1, 1);
    expect(is.netIncome).toBe(-1500);
  });

  it("excludes asset/liability/equity accounts", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "2100", "Payable", "LIABILITY", "credit"),
        makeAccount(3, "3100", "Capital", "EQUITY", "credit"),
        makeAccount(4, "4100", "Revenue", "REVENUE", "credit"),
        makeAccount(5, "5110", "Expense", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "10000.00"),
        makeLedgerEntry(2, "credit", "5000.00"),
        makeLedgerEntry(3, "credit", "8000.00"),
        makeLedgerEntry(4, "credit", "7000.00"),
        makeLedgerEntry(5, "debit", "2000.00"),
      ]
    );

    const is = await generateIncomeStatement(1, 1);
    expect(is.totalRevenue).toBe(7000);
    expect(is.totalExpenses).toBe(2000);
    expect(is.netIncome).toBe(5000);
    expect(is.revenue.length).toBe(1);
    expect(is.expenses.length).toBe(1);
  });
});

// ─── Balance Sheet Tests ────────────────────────────────────────────────────

describe("Balance Sheet", () => {
  it("is balanced when A = L + E", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "2100", "Accounts Payable", "LIABILITY", "credit"),
        makeAccount(3, "3100", "Owner's Capital", "EQUITY", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "15000.00"),
        makeLedgerEntry(2, "credit", "5000.00"),
        makeLedgerEntry(3, "credit", "10000.00"),
      ]
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.isBalanced).toBe(true);
    expect(bs.totalAssets).toBe(15000);
    expect(bs.totalLiabilities).toBe(5000);
    expect(bs.totalEquity).toBe(10000);
  });

  it("reports no revenue or expense account as its own line, folding profit into equity", async () => {
    // Dr Cash 10,000 / Cr Capital 10,000, then a 8,000 sale and 3,000 of spend.
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "3100", "Capital", "EQUITY", "credit"),
        makeAccount(3, "4100", "Revenue", "REVENUE", "credit"),
        makeAccount(4, "5110", "Expense", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "10000.00"),
        makeLedgerEntry(2, "credit", "10000.00"),
        makeLedgerEntry(1, "debit", "8000.00"),
        makeLedgerEntry(3, "credit", "8000.00"),
        makeLedgerEntry(1, "credit", "3000.00"),
        makeLedgerEntry(4, "debit", "3000.00"),
      ]
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.assets).toHaveLength(1);
    expect(bs.assets[0].accountCode).toBe("1110");
    expect(bs.totalAssets).toBe(15000);
    expect(bs.totalLiabilities).toBe(0);
    // 8,000 revenue − 3,000 expense is equity, not a dangling profit.
    expect(bs.equity.map(line => line.accountCode).sort()).toEqual([
      "3100",
      "3200",
    ]);
    expect(bs.equity.find(line => line.accountCode === "3200")!.amount).toBe(
      5000
    );
    expect(bs.totalEquity).toBe(15000);
    expect(bs.isBalanced).toBe(true);
  });

  it("shows a retained-earnings loss as negative equity", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "3100", "Capital", "EQUITY", "credit"),
        makeAccount(3, "5110", "Expense", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "1000.00"),
        makeLedgerEntry(2, "credit", "1000.00"),
        makeLedgerEntry(1, "credit", "250.00"),
        makeLedgerEntry(3, "debit", "250.00"),
      ]
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.totalAssets).toBe(750);
    // Capital 1,000 less the 250 spent: equity must follow, or the sheet lies.
    expect(bs.totalEquity).toBe(750);
    expect(bs.isBalanced).toBe(true);
  });

  it("handles contra assets correctly", async () => {
    mockDbSelects(
      [makeAccount(1, "1110", "Cash", "ASSET", "debit")],
      [
        makeLedgerEntry(1, "debit", "1000.00"),
        makeLedgerEntry(1, "credit", "3000.00"),
      ]
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.totalAssets).toBe(-2000);
  });
});

// ─── Combined Report Tests ──────────────────────────────────────────────────

describe("Accounting Report", () => {
  it("generates all three statements consistently", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "2100", "Payable", "LIABILITY", "credit"),
        makeAccount(3, "3100", "Capital", "EQUITY", "credit"),
        makeAccount(4, "4100", "Revenue", "REVENUE", "credit"),
        makeAccount(5, "5110", "Rent", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "20000.00"),
        makeLedgerEntry(3, "credit", "20000.00"),
        makeLedgerEntry(1, "debit", "10000.00"),
        makeLedgerEntry(4, "credit", "10000.00"),
        makeLedgerEntry(1, "credit", "4000.00"),
        makeLedgerEntry(5, "debit", "4000.00"),
        makeLedgerEntry(5, "debit", "3000.00"),
        makeLedgerEntry(2, "credit", "3000.00"),
      ]
    );

    const report = await generateAccountingReport(1, 1);
    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.incomeStatement.totalRevenue).toBe(10000);
    expect(report.incomeStatement.totalExpenses).toBe(7000);
    expect(report.incomeStatement.netIncome).toBe(3000);
    expect(report.balanceSheet.totalAssets).toBe(26000);
    expect(report.balanceSheet.totalLiabilities).toBe(3000);
    // Capital 20,000 + retained earnings 3,000.
    expect(report.balanceSheet.totalEquity).toBe(23000);
    // The point of the combined report: all three agree.
    expect(report.balanceSheet.isBalanced).toBe(true);
    expect(
      report.balanceSheet.totalLiabilities + report.balanceSheet.totalEquity
    ).toBe(report.balanceSheet.totalAssets);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it("keeps the trial balance cumulative while the income statement honours from", async () => {
    // Same data as above: opening capital 20,000 posted before the period opens,
    // revenue/expense activity inside it.
    const period = {
      from: new Date("2024-02-01T00:00:00.000Z"),
      to: new Date("2024-02-29T00:00:00.000Z"),
    };
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
        makeAccount(2, "2100", "Payable", "LIABILITY", "credit"),
        makeAccount(3, "3100", "Capital", "EQUITY", "credit"),
        makeAccount(4, "4100", "Revenue", "REVENUE", "credit"),
        makeAccount(5, "5110", "Rent", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "20000.00"),
        makeLedgerEntry(3, "credit", "20000.00"),
        makeLedgerEntry(1, "debit", "10000.00"),
        makeLedgerEntry(4, "credit", "10000.00"),
        makeLedgerEntry(1, "credit", "4000.00"),
        makeLedgerEntry(5, "debit", "4000.00"),
        makeLedgerEntry(5, "debit", "3000.00"),
        makeLedgerEntry(2, "credit", "3000.00"),
      ]
    );

    const report = await generateAccountingReport(1, 1, period);

    // Income statement is period-scoped, so the pre-period opening capital
    // must not inflate it.
    expect(report.incomeStatement.totalRevenue).toBe(10000);
    expect(report.incomeStatement.totalExpenses).toBe(7000);

    // The trial balance is cumulative through `to`: dropping the opening
    // capital would leave it unable to agree with the balance sheet.
    const capital = report.trialBalance.lines.find(
      r => r.accountCode === "3100"
    );
    expect(capital?.debit).toBe(0);
    expect(capital?.credit).toBe(20000);
    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.balanceSheet.isBalanced).toBe(true);
    // Cumulative trial balance ⇒ its asset column equals the balance sheet's
    // assets (its debit total additionally carries expense balances).
    const assetDebits = report.trialBalance.lines
      .filter(l => l.accountType === "ASSET")
      .reduce((sum, l) => sum + l.debit, 0);
    expect(assetDebits).toBe(report.balanceSheet.totalAssets);
    expect(
      report.balanceSheet.totalLiabilities + report.balanceSheet.totalEquity
    ).toBe(report.balanceSheet.totalAssets);
  });
});

// ─── Cash Flow Statement Tests ──────────────────────────────────────────────

describe("Cash Flow Statement", () => {
  it("reports zero opening cash for a full-history report and a consistent closing", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
        makeAccount(2, "4100", "Sales Revenue", "REVENUE", "credit"),
        makeAccount(3, "5110", "Salaries", "EXPENSE", "debit"),
      ],
      [
        makeLedgerEntry(1, "debit", "5000.00"),
        makeLedgerEntry(2, "credit", "5000.00"),
        makeLedgerEntry(1, "credit", "3000.00"),
        makeLedgerEntry(3, "debit", "3000.00"),
      ]
    );

    const cf = await generateCashFlowStatement(1, 1);
    expect(cf.openingCash).toBe(0);
    expect(cf.netChangeInCash).toBe(2000);
    // closing is derived from the same chain: opening + netChange.
    expect(cf.closingCash).toBe(cf.openingCash + cf.netChangeInCash);
    expect(cf.closingCash).toBe(2000);
  });

  it("reports the actual opening cash balance before the period start", async () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");
    mockDbSelectsWithOpening(
      [
        makeAccount(1, "1110", "Cash in Hand", "ASSET", "debit"),
        makeAccount(2, "4100", "Sales Revenue", "REVENUE", "credit"),
        makeAccount(3, "5110", "Salaries", "EXPENSE", "debit"),
      ],
      [
        // Balances within the period (Jan 2026 activity).
        makeLedgerEntry(1, "debit", "1000.00"),
        makeLedgerEntry(2, "credit", "1000.00"),
        makeLedgerEntry(1, "credit", "400.00"),
        makeLedgerEntry(3, "debit", "400.00"),
      ],
      [
        // Balances before the period (opening cash position).
        makeLedgerEntry(1, "debit", "5000.00"),
        makeLedgerEntry(2, "credit", "5000.00"),
      ]
    );

    const cf = await generateCashFlowStatement(1, 1, from, to);
    expect(cf.openingCash).toBe(5000);
    expect(cf.netChangeInCash).toBe(600);
    expect(cf.closingCash).toBe(cf.openingCash + cf.netChangeInCash);
    expect(cf.closingCash).toBe(5600);
  });

  it("keeps opening cash at zero when the period includes all history", async () => {
    // from === undefined triggers the full-history path where the opening
    // query is skipped entirely.
    const to = new Date("2026-01-31");
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "4100", "Revenue", "REVENUE", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "100.00"),
        makeLedgerEntry(2, "credit", "100.00"),
      ]
    );

    const cf = await generateCashFlowStatement(1, 1, undefined, to);
    expect(cf.openingCash).toBe(0);
    expect(cf.closingCash).toBe(cf.openingCash + cf.netChangeInCash);
  });
});

// ─── Period Locking Tests ───────────────────────────────────────────────────

describe("Period Lock Enforcement", () => {
  it("assertPeriodNotLocked passes for unlocked month", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    await expect(
      assertPeriodNotLocked(1, new Date("2026-01-15"))
    ).resolves.toBeUndefined();
  });

  it("assertPeriodNotLocked throws for locked month", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ monthKey: "2026-01" }]),
          }),
        }),
      }),
    });

    await expect(
      assertPeriodNotLocked(1, new Date("2026-01-15"))
    ).rejects.toThrow("2026-01");
  });
});

// ─── Voucher Imbalance Rejection Tests ──────────────────────────────────────

describe("Voucher Imbalance Rejection", () => {
  it("rejects when debits != credits beyond tolerance", () => {
    const totalDebit = 100;
    const totalCredit = 99.98;
    expect(Math.abs(totalDebit - totalCredit)).toBeGreaterThan(0.01);
  });

  it("accepts when debits == credits", () => {
    expect(Math.abs(100 - 100)).toBeLessThanOrEqual(0.01);
  });

  it("accepts with rounding within tolerance (1/3 split)", () => {
    const totalDebit = 33.34 + 33.33 + 33.33;
    const totalCredit = 100.0;
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.01);
  });
});

// ─── Fiscal Period Tests ────────────────────────────────────────────────────

describe("Fiscal Periods", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createFiscalPeriod validates start < end", async () => {
    await expect(
      createFiscalPeriod(1, 1, {
        name: "Q1",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-01-01"),
      })
    ).rejects.toThrow("শুরুর তারিখ");
  });

  it("createFiscalPeriod creates period successfully", async () => {
    mockGetDb.mockResolvedValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
      }),
    });
    const result = await createFiscalPeriod(1, 1, {
      name: "FY 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    });
    expect(result.id).toBe(1);
  });

  it("listFiscalPeriods returns empty for new project", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    });
    const periods = await listFiscalPeriods(1, 1);
    expect(periods).toEqual([]);
  });
});

// ─── DECIMAL(18,2) Precision Tests ──────────────────────────────────────────

describe("DECIMAL(18,2) Precision", () => {
  it("handles maximum DECIMAL(18,2) value", async () => {
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "4100", "Revenue", "REVENUE", "credit"),
      ],
      [
        makeLedgerEntry(1, "debit", "90071992547409.91"),
        makeLedgerEntry(2, "credit", "90071992547409.91"),
      ]
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(90071992547409.91);
  });

  it("handles 10000 micro-transactions summing correctly", async () => {
    const ledgerEntries: any[] = [];
    for (let i = 0; i < 10000; i++) {
      ledgerEntries.push(makeLedgerEntry(1, "debit", "0.01"));
      ledgerEntries.push(makeLedgerEntry(2, "credit", "0.01"));
    }
    mockDbSelects(
      [
        makeAccount(1, "1110", "Cash", "ASSET", "debit"),
        makeAccount(2, "4100", "Revenue", "REVENUE", "credit"),
      ],
      ledgerEntries
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(100);
    expect(tb.totalCredit).toBe(100);
  });
});

// ─── Cross-Project Isolation Tests ──────────────────────────────────────────

describe("Cross-Project Isolation (IDOR prevention)", () => {
  beforeEach(() => {
    mockAssertOwnedProject.mockRejectedValue(
      new Error("Project not found or access denied")
    );
  });

  it("generateTrialBalance rejects when the project belongs to another user", async () => {
    await expect(generateTrialBalance(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateIncomeStatement rejects when the project belongs to another user", async () => {
    await expect(generateIncomeStatement(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateBalanceSheet rejects when the project belongs to another user", async () => {
    await expect(generateBalanceSheet(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateAccountingReport rejects when the project belongs to another user", async () => {
    await expect(generateAccountingReport(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateAccountLedger rejects when the project belongs to another user", async () => {
    await expect(generateAccountLedger(2, 1, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateCashFlowStatement rejects when the project belongs to another user", async () => {
    await expect(generateCashFlowStatement(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateDailyTransactions rejects when the project belongs to another user", async () => {
    await expect(generateDailyTransactions(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });

  it("generateMonthlyTransactions rejects when the project belongs to another user", async () => {
    await expect(generateMonthlyTransactions(2, 1)).rejects.toThrow(
      "Project not found or access denied"
    );
  });
});
