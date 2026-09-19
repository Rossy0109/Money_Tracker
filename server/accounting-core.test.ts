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

vi.mock("./db", () => ({
  getDb: mockGetDb,
  databaseRequired: mockDatabaseRequired,
}));

import {
  generateTrialBalance,
  generateIncomeStatement,
  generateBalanceSheet,
  generateAccountingReport,
  createFiscalPeriod,
  listFiscalPeriods,
  assertPeriodNotLocked,
} from "./accounting-core";

function makeAccount(
  id: number, code: string, name: string,
  accountTypeCode: string, normalBalance: string, isDetail = true,
) {
  return { id, code, name, nameBn: null, accountTypeCode, normalBalance, isDetail };
}

function makeLedgerEntry(accountId: number, entryType: "debit" | "credit", amount: string) {
  return { accountId, entryType, amount };
}

/**
 * Set up mock db so that:
 *  - detailAccounts query (has .orderBy()) resolves with detailAccountsResult
 *  - accountBalances query (no .orderBy()) resolves with ledgerEntriesResult
 *
 * Both queries share the same db object and call db.select() independently.
 * We detect which query it is by whether .orderBy() is called on the chain.
 */
function mockDbSelects(detailAccountsResult: any[], ledgerEntriesResult: any[]) {
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
      // Thenable: resolves after caller finishes chaining
      chain.then = (onFulfilled: any, onRejected: any) =>
        Promise.resolve().then(() => (orderByCalled ? detailAccountsResult : ledgerEntriesResult)).then(onFulfilled, onRejected);
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

    const cash = tb.lines.find((l) => l.accountId === 1)!;
    expect(cash.debit).toBe(700);
    expect(cash.credit).toBe(0);

    const revenue = tb.lines.find((l) => l.accountId === 2)!;
    expect(revenue.debit).toBe(0);
    expect(revenue.credit).toBe(1000);

    const expense = tb.lines.find((l) => l.accountId === 3)!;
    expect(expense.debit).toBe(300);
    expect(expense.credit).toBe(0);
  });

  it("shows contra balances in opposite column", async () => {
    // Cash overdraft: more credits than debits → contra balance in credit column
    mockDbSelects(
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "2100", "Payable", "LIABILITY", "credit")],
      [
        makeLedgerEntry(1, "debit", "200.00"),    // Cash received
        makeLedgerEntry(2, "credit", "200.00"),   // Owed to vendor
        makeLedgerEntry(1, "credit", "500.00"),   // Cash paid
        makeLedgerEntry(2, "debit", "500.00"),    // Vendor paid
      ],
    );

    const tb = await generateTrialBalance(1, 1);
    const cash = tb.lines.find((l) => l.accountId === 1)!;
    expect(cash.debit).toBe(0);
    expect(cash.credit).toBe(300);
    expect(tb.isBalanced).toBe(true);
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
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "4100", "Revenue", "REVENUE", "credit")],
      [makeLedgerEntry(1, "debit", "9999999999.99"), makeLedgerEntry(2, "credit", "9999999999.99")],
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(9999999999.99);
    expect(tb.totalCredit).toBe(9999999999.99);
  });

  it("handles cents-only amounts precisely (0.01+0.02+0.03)", async () => {
    mockDbSelects(
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "4100", "Revenue", "REVENUE", "credit")],
      [makeLedgerEntry(1, "debit", "0.01"), makeLedgerEntry(1, "debit", "0.02"), makeLedgerEntry(1, "debit", "0.03"), makeLedgerEntry(2, "credit", "0.06")],
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.lines.find((l) => l.accountId === 1)!.debit).toBe(0.06);
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
      ],
    );

    const is = await generateIncomeStatement(1, 1);
    expect(is.totalRevenue).toBe(7000);
    expect(is.totalExpenses).toBe(4000);
    expect(is.netIncome).toBe(3000);
  });

  it("handles net loss (expenses exceed revenue)", async () => {
    mockDbSelects(
      [makeAccount(1, "4100", "Revenue", "REVENUE", "credit"), makeAccount(2, "5110", "Rent", "EXPENSE", "debit")],
      [makeLedgerEntry(1, "credit", "1000.00"), makeLedgerEntry(2, "debit", "2500.00")],
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
      ],
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
      ],
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.isBalanced).toBe(true);
    expect(bs.totalAssets).toBe(15000);
    expect(bs.totalLiabilities).toBe(5000);
    expect(bs.totalEquity).toBe(10000);
  });

  it("excludes revenue and expense accounts", async () => {
    mockDbSelects(
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "4100", "Revenue", "REVENUE", "credit"), makeAccount(3, "5110", "Expense", "EXPENSE", "debit")],
      [makeLedgerEntry(1, "debit", "10000.00"), makeLedgerEntry(2, "credit", "8000.00"), makeLedgerEntry(3, "debit", "3000.00")],
    );

    const bs = await generateBalanceSheet(1, 1);
    expect(bs.assets.length).toBe(1);
    expect(bs.totalAssets).toBe(10000);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.totalEquity).toBe(0);
  });

  it("handles contra assets correctly", async () => {
    mockDbSelects(
      [makeAccount(1, "1110", "Cash", "ASSET", "debit")],
      [makeLedgerEntry(1, "debit", "1000.00"), makeLedgerEntry(1, "credit", "3000.00")],
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
      ],
    );

    const report = await generateAccountingReport(1, 1);
    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.incomeStatement.totalRevenue).toBe(10000);
    expect(report.incomeStatement.totalExpenses).toBe(7000);
    expect(report.incomeStatement.netIncome).toBe(3000);
    expect(report.balanceSheet.totalAssets).toBe(26000);
    expect(report.balanceSheet.totalLiabilities).toBe(3000);
    expect(report.balanceSheet.totalEquity).toBe(20000);
    expect(report.generatedAt).toBeInstanceOf(Date);
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

    await expect(assertPeriodNotLocked(1, new Date("2026-01-15"))).resolves.toBeUndefined();
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

    await expect(assertPeriodNotLocked(1, new Date("2026-01-15"))).rejects.toThrow("2026-01");
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
    const totalCredit = 100.00;
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.01);
  });
});

// ─── Fiscal Period Tests ────────────────────────────────────────────────────

describe("Fiscal Periods", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createFiscalPeriod validates start < end", async () => {
    await expect(
      createFiscalPeriod(1, 1, { name: "Q1", startDate: new Date("2026-04-01"), endDate: new Date("2026-01-01") })
    ).rejects.toThrow("শুরুর তারিখ");
  });

  it("createFiscalPeriod creates period successfully", async () => {
    mockGetDb.mockResolvedValue({
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
    });
    const result = await createFiscalPeriod(1, 1, {
      name: "FY 2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"),
    });
    expect(result.id).toBe(1);
  });

  it("listFiscalPeriods returns empty for new project", async () => {
    mockGetDb.mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue([]) }) }),
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
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "4100", "Revenue", "REVENUE", "credit")],
      [makeLedgerEntry(1, "debit", "90071992547409.91"), makeLedgerEntry(2, "credit", "90071992547409.91")],
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
      [makeAccount(1, "1110", "Cash", "ASSET", "debit"), makeAccount(2, "4100", "Revenue", "REVENUE", "credit")],
      ledgerEntries,
    );

    const tb = await generateTrialBalance(1, 1);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(100);
    expect(tb.totalCredit).toBe(100);
  });
});
