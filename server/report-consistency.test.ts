import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
// @ts-expect-error - helper script without type declarations
import { getIsolatedE2EDatabaseUrl } from "../scripts/e2e-database.mjs";
// @ts-expect-error - helper script without type declarations
import { bootstrapLocalE2eSchema } from "../scripts/bootstrap-local-e2e-schema.mjs";
import { closeDatabaseConnection } from "./_core/dbConnection";

const savedDatabaseUrl = process.env.DATABASE_URL;

function resolveBaseUrl(): string | null {
  try {
    return getIsolatedE2EDatabaseUrl().toString();
  } catch {
    return null;
  }
}

const baseUrl = resolveBaseUrl();

async function localDbReachable(): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const connection = await createConnection(baseUrl);
    await connection.ping();
    await connection.destroy();
    return true;
  } catch {
    return false;
  }
}

// Top-level probe: the suite runs only with a reachable disposable MariaDB.
// CI's `test` job provisions one (ISOLATED_E2E_DATABASE_URL); local runs
// without a database self-skip cleanly.
const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_reports_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("report consistency (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;

  beforeAll(async () => {
    const admin = await createConnection(baseUrl as string);
    await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await admin.destroy();
    await bootstrapLocalE2eSchema(scratchUrl);
    process.env.DATABASE_URL = scratchUrl;

    const {
      upsertUser,
      getUserIdByOpenId,
      seedDefaultAccountTypes,
      createProject,
      seedDefaultChartOfAccounts,
    } = await import("./db");
    await upsertUser({ openId: "dbunit:reports" });
    userId = (await getUserIdByOpenId("dbunit:reports"))!;
    await seedDefaultAccountTypes();
    const project = await createProject(userId, "Report Consistency");
    projectId = project.id!;
    await seedDefaultChartOfAccounts(userId, projectId);
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it("a reversed voucher and its offsetting reversal net to zero in the income statement", async () => {
    const { createVoucherWithEntries, getChartOfAccounts } = await import(
      "./db"
    );
    const { generateIncomeStatement, generateTrialBalance } = await import(
      "./accounting-core"
    );

    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;

    // Original income voucher (posted).
    const original = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-04-01T10:00:00.000Z"),
      narration: "report tie-out sale",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 1000 }],
      credits: [{ accountId: revenue.id, amount: 1000 }],
    });

    const before = await generateIncomeStatement(userId, projectId);
    expect(before.totalRevenue).toBe(1000);
    expect(before.netIncome).toBe(1000);

    // Stage the post-reversal state. The reversal write path and its
    // guards are covered by voucher-maker-checker.test.ts; single-owner
    // finance projects make self-reversal unreachable through the
    // exported functions, so the exact state reverseVoucherInTx
    // produces is staged here: the original voucher flips to
    // "reversed" and an offsetting posted voucher (debits/credits
    // swapped) carries the reversal.
    const { getDb, databaseRequired } = await import("./db");
    const { financeVouchers } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = databaseRequired(await getDb());
    await db
      .update(financeVouchers)
      .set({ status: "reversed" })
      .where(eq(financeVouchers.id, original.voucherId));

    await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-04-02T10:00:00.000Z"),
      narration: "Reversal of sale voucher",
      status: "posted",
      _internalPostedBy: userId,
      voucherType: "reversal",
      debits: [{ accountId: revenue.id, amount: 1000 }],
      credits: [{ accountId: cash.id, amount: 1000 }],
    });

    const after = await generateIncomeStatement(userId, projectId);
    expect(after.totalRevenue).toBe(0);
    expect(after.totalExpenses).toBe(0);
    expect(after.netIncome).toBe(0);

    // The reversed original still counts (accountBalances includes
    // "reversed"), and the offsetting reversal cancels it.
    const tb = await generateTrialBalance(userId, projectId);
    expect(tb.isBalanced).toBe(true);
    const cashLine = tb.lines.find(l => l.accountCode === "1110")!;
    expect(cashLine.debit).toBe(0);
    expect(cashLine.credit).toBe(0);
    const revenueLine = tb.lines.find(l => l.accountCode === "4100")!;
    expect(revenueLine.debit).toBe(0);
    expect(revenueLine.credit).toBe(0);
  });

  it("trial balance, income statement and balance sheet tie out on one dataset", async () => {
    const { createVoucherWithEntries, getChartOfAccounts } = await import(
      "./db"
    );
    const {
      generateTrialBalance,
      generateIncomeStatement,
      generateBalanceSheet,
    } = await import("./accounting-core");

    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const capital = chart.find(a => a.code === "3100")!;
    const revenue = chart.find(a => a.code === "4100")!;
    const expense = chart.find(a => a.code === "5110")!;

    // Opening capital: cash debit / capital credit.
    await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-01-10T10:00:00.000Z"),
      narration: "opening capital",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 5000 }],
      credits: [{ accountId: capital.id, amount: 5000 }],
    });
    // A sale: cash debit / revenue credit.
    await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-01-11T10:00:00.000Z"),
      narration: "tie-out sale",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 1000 }],
      credits: [{ accountId: revenue.id, amount: 1000 }],
    });
    // An expense: expense debit / cash credit.
    await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-01-12T10:00:00.000Z"),
      narration: "tie-out expense",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: expense.id, amount: 300 }],
      credits: [{ accountId: cash.id, amount: 300 }],
    });

    const tb = await generateTrialBalance(userId, projectId);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(6000);
    expect(tb.totalCredit).toBe(6000);

    const is = await generateIncomeStatement(userId, projectId);
    expect(is.totalRevenue).toBe(1000);
    expect(is.totalExpenses).toBe(300);
    expect(is.netIncome).toBe(700);

    const bs = await generateBalanceSheet(userId, projectId);
    expect(bs.totalAssets).toBe(5700);
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.totalEquity).toBe(5700);
    expect(bs.isBalanced).toBe(true);
    // Retained earnings (700) fold into the 3200 line.
    const retained = bs.equity.find(l => l.accountCode === "3200");
    expect(retained?.amount).toBe(700);

    // Tie-out: the income statement's net income equals the balance
    // sheet's equity movement over the opening capital.
    expect(is.netIncome).toBe(bs.totalEquity - 5000);
    // And the trial balance's P&L net movement matches the net income.
    const plNet =
      (tb.lines.find(l => l.accountCode === "4100")?.credit ?? 0) -
      (tb.lines.find(l => l.accountCode === "5110")?.debit ?? 0);
    expect(plNet).toBe(is.netIncome);
  });
});
