/**
 * Financial statements must come from the canonical general ledger
 * (accounting-core), never from the retired pseudo-ledger.
 *
 * Regression coverage for the two disconnected accounting worlds:
 *   - `finance.financialStatements` used to synthesise a trial balance from
 *     overview.accounts/transactions/dues, omitting equity, so a legitimate book
 *     (opening capital, no transactions) reported debit ≠ credit.
 *   - The trial balance is cumulative as-of `to` (never period-scoped) so opening
 *     balances and retained earnings are always on the report and the columns
 *     balance; only the income statement is period-scoped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const accountTypes = [
    { id: 1, code: "ASSET", normalBalance: "debit" },
    { id: 2, code: "LIABILITY", normalBalance: "credit" },
    { id: 3, code: "EQUITY", normalBalance: "credit" },
    { id: 4, code: "REVENUE", normalBalance: "credit" },
    { id: 5, code: "EXPENSE", normalBalance: "debit" },
  ];
  // A project whose only ledger activity is its opening capital: 1,000 BDT of
  // cash funded by 1,000 BDT of owner's capital.
  const chartOfAccounts = [
    {
      id: 11,
      code: "1110",
      name: "Cash in Hand",
      nameBn: "হাতে নগদ",
      accountTypeId: 1,
      isDetail: true,
      isActive: true,
      openingBalance: "0.00",
    },
    {
      id: 12,
      code: "1120",
      name: "Bank Accounts",
      nameBn: "ব্যাংক অ্যাকাউন্ট",
      accountTypeId: 1,
      isDetail: true,
      isActive: true,
      openingBalance: "0.00",
    },
    {
      id: 21,
      code: "3100",
      name: "Owner's Capital",
      nameBn: "মালিকের ক্যাপিটাল",
      accountTypeId: 3,
      isDetail: true,
      isActive: true,
      openingBalance: "0.00",
    },
  ];
  const ledgerEntries = [
    { accountId: 11, entryType: "debit", amount: "1000.00" },
    { accountId: 21, entryType: "credit", amount: "1000.00" },
  ];

  const tableName = (table: unknown) => {
    const candidate = table as {
      _?: { name?: string };
      [key: symbol]: unknown;
    } | null;
    return (
      candidate?._?.name ||
      (candidate?.[Symbol.for("drizzle:Name")] as string) ||
      ""
    );
  };

  /**
   * Pull the bound values out of a Drizzle `where` clause so the fake can honour
   * ownership checks (`and(eq(userId, …), eq(id, …))`) instead of blindly
   * returning every project to every caller.
   */
  const boundValues = (clause: unknown, out: unknown[] = []): unknown[] => {
    if (!clause || typeof clause !== "object") return out;
    const node = clause as {
      value?: unknown;
      queryChunks?: unknown[];
      left?: unknown;
      right?: unknown;
    };
    if (node.value !== undefined && typeof node.value === "number")
      out.push(node.value);
    if (Array.isArray(node.queryChunks))
      for (const chunk of node.queryChunks) boundValues(chunk, out);
    if (node.left) boundValues(node.left, out);
    if (node.right) boundValues(node.right, out);
    return out;
  };

  const affected = async () => [{ affectedRows: 1 }];

  const client: Record<string, unknown> = {
    select: vi.fn(() => {
      let tables: unknown[] = [];
      let whereClause: unknown;
      const chain: Record<string, unknown> = {};
      const rowsFor = () => {
        const names = tables.map(tableName);
        if (names.includes("finance_projects")) {
          // assertOwnedProject builds and(eq(projects.id, projectId), eq(projects.userId, userId)).
          const [projectId, owner] = boundValues(whereClause);
          return owner === 42 && projectId === 88
            ? [{ id: 88, userId: 42, name: "আমার প্রজেক্ট" }]
            : [];
        }
        if (names.includes("finance_ledger_entries")) return ledgerEntries;
        if (names.includes("finance_chart_of_accounts")) {
          return chartOfAccounts.map(account => {
            const type = accountTypes.find(
              candidate => candidate.id === account.accountTypeId
            )!;
            return {
              ...account,
              accountTypeCode: type.code,
              normalBalance: type.normalBalance,
            };
          });
        }
        if (names.includes("finance_account_types")) return accountTypes;
        return [];
      };
      const resolve = () => Promise.resolve(rowsFor());
      chain.from = (table: unknown) => {
        tables = [table];
        return chain;
      };
      chain.innerJoin = (table: unknown) => {
        tables = [...tables, table];
        return chain;
      };
      chain.where = (clause: unknown) => {
        whereClause = clause;
        return chain;
      };
      chain.orderBy = () => chain;
      chain.for = () => chain;
      chain.limit = () => chain;
      chain.then = (
        onFulfilled: (value: unknown[]) => unknown,
        onRejected: (reason: unknown) => unknown
      ) => resolve().then(onFulfilled, onRejected);
      chain.catch = (fn: (reason: unknown) => unknown) =>
        resolve().then(undefined, fn);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: () => ({
        onDuplicateKeyUpdate: async () => [{ insertId: 1 }],
        then: (onFulfilled: (value: Array<{ insertId: number }>) => unknown) =>
          Promise.resolve([{ insertId: 1 }]).then(onFulfilled),
      }),
    })),
    update: vi.fn(() => ({ set: () => ({ where: affected }) })),
    delete: vi.fn(() => ({ where: affected })),
  };
  (client as { transaction: unknown }).transaction = vi.fn(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(client)
  );

  return { client, accountTypes, chartOfAccounts, ledgerEntries };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

const accountingCalls = vi.hoisted(() => ({
  trialBalance: [] as Array<{ from?: Date; to?: Date }>,
  incomeStatement: [] as Array<{ from?: Date; to?: Date }>,
  balanceSheet: [] as Array<{ asOf?: Date }>,
}));

vi.mock("./accounting-core", async importOriginal => {
  const actual = await importOriginal<typeof import("./accounting-core")>();
  return {
    ...actual,
    generateTrialBalance: (
      userId: number,
      projectId: number,
      from?: Date,
      to?: Date
    ) => {
      accountingCalls.trialBalance.push({ from, to });
      return actual.generateTrialBalance(userId, projectId, from, to);
    },
    generateIncomeStatement: (
      userId: number,
      projectId: number,
      from?: Date,
      to?: Date
    ) => {
      accountingCalls.incomeStatement.push({ from, to });
      return actual.generateIncomeStatement(userId, projectId, from, to);
    },
    generateBalanceSheet: (userId: number, projectId: number, asOf?: Date) => {
      accountingCalls.balanceSheet.push({ asOf });
      return actual.generateBalanceSheet(userId, projectId, asOf);
    },
  };
});

import { getFinancialStatements } from "./db";

describe("financial statements are ledger-derived", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://statements-test";
    accountingCalls.trialBalance.length = 0;
    accountingCalls.incomeStatement.length = 0;
    accountingCalls.balanceSheet.length = 0;
  });

  it("returns the accounting-core shape, not the retired pseudo-ledger shape", async () => {
    const report = await getFinancialStatements(42, 88);

    expect(report).toHaveProperty("trialBalance");
    expect(report).toHaveProperty("incomeStatement");
    expect(report).toHaveProperty("balanceSheet");
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(report).not.toHaveProperty("profitAndLoss");
  });

  it("balances the trial balance for a book whose only entry is opening capital", async () => {
    // 1,000 BDT of starting cash funded by owner's capital: Dr Cash / Cr Capital.
    const report = await getFinancialStatements(42, 88);

    expect(report.trialBalance.totalDebit).toBe(1000);
    expect(report.trialBalance.totalCredit).toBe(1000);
    expect(report.trialBalance.isBalanced).toBe(true);
  });

  it("balances the balance sheet for the same book", async () => {
    const report = await getFinancialStatements(42, 88);

    expect(report.balanceSheet.totalAssets).toBe(1000);
    expect(report.balanceSheet.totalLiabilities).toBe(0);
    expect(report.balanceSheet.totalEquity).toBe(1000);
    expect(report.balanceSheet.isBalanced).toBe(true);
  });

  it("lists only detail accounts, with their chart code and type", async () => {
    const report = await getFinancialStatements(42, 88);
    const lines = report.trialBalance.lines;

    expect(lines.map(line => line.accountCode)).toEqual([
      "1110",
      "1120",
      "3100",
    ]);
    expect(lines.map(line => line.accountType)).toEqual([
      "ASSET",
      "ASSET",
      "EQUITY",
    ]);
  });

  it("reports no revenue or expense movement when nothing is posted", async () => {
    const report = await getFinancialStatements(42, 88);

    expect(report.incomeStatement.totalRevenue).toBe(0);
    expect(report.incomeStatement.totalExpenses).toBe(0);
    expect(report.incomeStatement.netIncome).toBe(0);
  });

  it("rejects a project the caller does not own", async () => {
    await expect(getFinancialStatements(99, 88)).rejects.toThrow(
      "Project not found or access denied"
    );
  });
});

describe("period scoping of the three statements", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const to = new Date("2026-01-31T23:59:59.000Z");

  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://statements-test";
    accountingCalls.trialBalance.length = 0;
    accountingCalls.incomeStatement.length = 0;
    accountingCalls.balanceSheet.length = 0;
  });

  it("scopes the income statement to the requested period", async () => {
    await getFinancialStatements(42, 88, { from, to });

    expect(accountingCalls.incomeStatement).toEqual([{ from, to }]);
  });

  it("keeps the trial balance cumulative so opening balances stay on the report", async () => {
    await getFinancialStatements(42, 88, { from, to });

    // `from` must be undefined: a period-scoped trial balance drops opening
    // balances and stops balancing.
    expect(accountingCalls.trialBalance).toEqual([{ from: undefined, to }]);
  });

  it("reports the balance sheet as of the period end", async () => {
    await getFinancialStatements(42, 88, { from, to });

    expect(accountingCalls.balanceSheet).toEqual([{ asOf: to }]);
  });

  it("echoes the resolved period back to the caller", async () => {
    const report = await getFinancialStatements(42, 88, { from, to });
    expect(report.period).toEqual({ from, to });
  });

  it("treats a missing period as all-time", async () => {
    const report = await getFinancialStatements(42, 88);

    expect(report.period).toEqual({ from: null, to: null });
    expect(accountingCalls.trialBalance).toEqual([
      { from: undefined, to: undefined },
    ]);
  });
});

describe("retired pseudo-ledger", () => {
  it("is no longer part of the server", async () => {
    const { existsSync } = await import("node:fs");

    expect(
      existsSync(new URL("./doubleEntryAccounting.ts", import.meta.url))
    ).toBe(false);
  });
});
