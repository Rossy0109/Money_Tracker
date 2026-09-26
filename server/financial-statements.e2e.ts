/**
 * Live-database E2E for the canonical ledger's financial statements.
 *
 * The unit suite proves the report shape against a fake Drizzle client; this
 * suite proves it against real MySQL, which is the only way to catch the
 * things mocks cannot see:
 *   - migration 0019's `finance_accounts.openingBalanceVoucherId` column,
 *   - the opening-balance voucher that a wallet create/update posts,
 *   - double-entry arithmetic that the database actually enforces,
 *   - and the period semantics (cumulative trial balance, period income
 *     statement) surviving the round trip.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { financeAccounts, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { assignRole, clearRBACCache, initializeRBAC } from "./_core/rbac";
import { ROLE_NAMES } from "../shared/rbac";
import { closeDatabaseConnection, getDb } from "./db";

type E2eUser = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "admin" | "user";
  status: "pending" | "active" | "suspended";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

const OPEN_ID = "e2e-statement-owner";
const dayMs = 86_400_000;

let owner: E2eUser;

function caller(user: E2eUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
    adminElevation: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

function assertIsolatedDatabase() {
  const databaseName = process.env.ISOLATED_E2E_DATABASE_NAME ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseHost = new URL(databaseUrl).hostname;
  if (
    process.env.ISOLATED_E2E_DATABASE !== "true" ||
    !/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(databaseName) ||
    !databaseUrl.includes(`/${databaseName}`) ||
    !["127.0.0.1", "localhost"].includes(databaseHost)
  ) {
    throw new Error(
      "এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেসে চালানো যাবে"
    );
  }
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");

  await db.insert(users).values({
    openId: OPEN_ID,
    name: "E2E Statement Owner",
    email: "statement-owner@e2e.test",
    loginMethod: "e2e",
    role: "user",
    status: "active",
  });
  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.openId, OPEN_ID));
  if (!created) throw new Error("E2E পরিচয় তৈরি করা যায়নি");
  owner = created as E2eUser;

  await seedDefaultRBAC();
  await assignRole(owner.id, ROLE_NAMES.MANAGER, owner.id);
  clearRBACCache();
  await initializeRBAC();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

/** Create a project holding one cash wallet funded by an opening balance. */
async function seedBook(openingBalance: number, name: string) {
  const ownerCaller = caller(owner);
  const projectId = (await ownerCaller.projects.create({ name })).id;
  await ownerCaller.finance.addAccount({
    projectId,
    name: `${name} নগদ`,
    type: "cash",
    openingBalance,
  });
  const overview = await ownerCaller.finance.overview({ projectId });
  const account = overview.accounts.find(item => item.name === `${name} নগদ`)!;
  const category = overview.categories.find(item => item.type === "expense")!;
  return {
    ownerCaller,
    projectId,
    accountId: account.id,
    categoryId: category.id,
  };
}

describe("financial statements against a real database", () => {
  it("balances every statement for a wallet funded only by owner's capital", async () => {
    const { ownerCaller, projectId } = await seedBook(1000, "E2E কেবল মূলধন");

    const report = await ownerCaller.finance.financialStatements({ projectId });

    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.trialBalance.totalDebit).toBe(
      report.trialBalance.totalCredit
    );
    // 1,000 BDT of starting cash must appear as an asset funded by equity.
    expect(report.balanceSheet.totalAssets).toBe(1000);
    expect(report.balanceSheet.totalEquity).toBe(1000);
    expect(report.balanceSheet.isBalanced).toBe(true);
    expect(report.incomeStatement.totalRevenue).toBe(0);
    expect(report.incomeStatement.totalExpenses).toBe(0);

    const capital = report.trialBalance.lines.find(
      line => line.accountCode === "3100"
    );
    expect(capital?.credit).toBe(1000);
    const cash = report.trialBalance.lines.find(
      line => line.accountCode === "1110"
    );
    expect(cash?.debit).toBe(1000);
  });

  it("ties the trial balance, income statement, and balance sheet after a transaction", async () => {
    const { ownerCaller, projectId, accountId, categoryId } = await seedBook(
      1000,
      "E2E লেনদেন"
    );
    await ownerCaller.finance.addTransaction({
      projectId,
      categoryId,
      accountId,
      type: "expense",
      amount: 250,
      paymentMethod: "cash",
      note: "E2E খরচ",
      occurredAt: new Date(),
    });

    const report = await ownerCaller.finance.financialStatements({ projectId });

    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.incomeStatement.totalExpenses).toBe(250);
    expect(report.incomeStatement.netIncome).toBe(-250);
    // Cash 1000 − 250 spent; equity unchanged, the loss is not closed yet.
    expect(report.balanceSheet.totalAssets).toBe(750);
    expect(report.balanceSheet.isBalanced).toBe(true);

    const expenseLine = report.trialBalance.lines.find(
      line => line.accountCode === "5110"
    );
    expect(expenseLine?.debit).toBe(250);
    expect(
      report.trialBalance.lines.some(
        line => line.accountType === "EQUITY" && line.credit === 1000
      )
    ).toBe(true);
  });

  it("keeps the trial balance cumulative while the income statement follows the period", async () => {
    const { ownerCaller, projectId, accountId, categoryId } = await seedBook(
      1000,
      "E2E সময়সীমা"
    );
    const now = new Date();
    await ownerCaller.finance.addTransaction({
      projectId,
      categoryId,
      accountId,
      type: "expense",
      amount: 400,
      paymentMethod: "cash",
      note: "E2E সময়সীমার বাইরে",
      occurredAt: new Date(now.getTime() - 40 * dayMs),
    });

    const period = { from: new Date(now.getTime() - 5 * dayMs), to: now };
    const report = await ownerCaller.finance.financialStatements({
      projectId,
      ...period,
    });

    expect(report.period).toEqual(period);
    // The older expense is outside the period…
    expect(report.incomeStatement.totalExpenses).toBe(0);
    expect(report.incomeStatement.netIncome).toBe(0);
    // …but the trial balance and balance sheet are as-of `to`, so they must
    // still include the opening capital and the older expense.
    expect(report.trialBalance.isBalanced).toBe(true);
    const expenseLine = report.trialBalance.lines.find(
      line => line.accountCode === "5110"
    );
    expect(expenseLine?.debit).toBe(400);
    expect(report.balanceSheet.totalAssets).toBe(600);
    expect(report.balanceSheet.isBalanced).toBe(true);
  });

  it("reconciles a freshly created wallet against the ledger", async () => {
    const { ownerCaller, projectId } = await seedBook(750, "E2E সমন্বয়");

    const reconciliation = await ownerCaller.finance.accountingReconciliation({
      projectId,
    });

    expect(reconciliation.walletsMissingOpeningVoucher).toEqual([]);
    expect(reconciliation.isReconciled).toBe(true);
    const wallet = reconciliation.wallets.find(
      item => item.name === "E2E সমন্বয় নগদ"
    );
    expect(wallet?.openingBalanceVoucherId).toBeTypeOf("number");
  });

  it("backfills legacy opening balances once and stays balanced when repeated", async () => {
    const { ownerCaller, projectId, accountId } = await seedBook(
      0,
      "E2E উত্তরাধিকার"
    );
    const db = await getDb();
    if (!db)
      throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");
    // Simulate a wallet whose starting cash predates the canonical-ledger bridge:
    // the amount lives on the wallet row, but no voucher backs it in the ledger.
    await db
      .update(financeAccounts)
      .set({ openingBalance: "500.00" })
      .where(eq(financeAccounts.id, accountId));

    const beforeRepair = await ownerCaller.finance.financialStatements({
      projectId,
    });
    expect(beforeRepair.trialBalance.totalDebit).toBe(0);
    expect(beforeRepair.balanceSheet.totalAssets).toBe(0);
    const unreconciled = await ownerCaller.finance.accountingReconciliation({
      projectId,
    });
    expect(unreconciled.walletsMissingOpeningVoucher).toHaveLength(1);
    expect(unreconciled.isReconciled).toBe(false);

    const first = await ownerCaller.finance.backfillOpeningBalances({
      projectId,
    });
    expect(first.posted).toHaveLength(1);
    expect(first.failed).toEqual([]);

    const repaired = await ownerCaller.finance.financialStatements({
      projectId,
    });
    expect(repaired.trialBalance.isBalanced).toBe(true);
    expect(repaired.balanceSheet.totalAssets).toBe(500);
    expect(repaired.balanceSheet.isBalanced).toBe(true);

    // Idempotent: a second pass must not post the opening balance twice.
    const second = await ownerCaller.finance.backfillOpeningBalances({
      projectId,
    });
    expect(second.posted).toEqual([]);
    expect(second.pending).toBe(0);

    const afterSecond = await ownerCaller.finance.financialStatements({
      projectId,
    });
    expect(afterSecond.trialBalance.totalDebit).toBe(
      afterSecond.trialBalance.totalCredit
    );
    expect(afterSecond.balanceSheet.totalAssets).toBe(500);
    expect(
      (await ownerCaller.finance.accountingReconciliation({ projectId }))
        .isReconciled
    ).toBe(true);
  });

  it("restates the opening balance when a wallet's starting cash changes", async () => {
    const { ownerCaller, projectId, accountId } = await seedBook(
      1000,
      "E2E পুনর্বিবেচনা"
    );

    await ownerCaller.finance.updateAccount({
      id: accountId,
      projectId,
      name: "E2E পুনর্বিবেচনা নগদ",
      type: "cash",
      openingBalance: 2500,
    });

    const report = await ownerCaller.finance.financialStatements({ projectId });
    expect(report.trialBalance.isBalanced).toBe(true);
    // Restated, not added: 1,000 reversed, 2,500 posted.
    expect(report.balanceSheet.totalAssets).toBe(2500);
    expect(report.balanceSheet.isBalanced).toBe(true);

    const reconciliation = await ownerCaller.finance.accountingReconciliation({
      projectId,
    });
    expect(reconciliation.walletsMissingOpeningVoucher).toEqual([]);
  });

  it("refuses to report on a project the caller does not own", async () => {
    const db = await getDb();
    if (!db)
      throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");
    await db.insert(users).values({
      openId: "e2e-statement-outsider",
      name: "E2E Statement Outsider",
      email: "statement-outsider@e2e.test",
      loginMethod: "e2e",
      role: "user",
      status: "active",
    });
    const [outsider] = await db
      .select()
      .from(users)
      .where(eq(users.openId, "e2e-statement-outsider"));
    await seedDefaultRBAC();
    await assignRole(outsider!.id, ROLE_NAMES.MANAGER, outsider!.id);
    clearRBACCache();
    await initializeRBAC();

    const { projectId } = await seedBook(100, "E2E বিদেশি");
    await expect(
      caller(outsider as E2eUser).finance.financialStatements({ projectId })
    ).rejects.toThrow("Project not found or access denied");
  });
});
