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

// Top-level probe: the suite runs only with a reachable disposable MariaDB
// (local runs). CI's unit job has no database service and skips cleanly.
const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_dbunit_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("db.ts hermetic flows (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;
  let incomeId = 0;

  beforeAll(async () => {
    const admin = await createConnection(baseUrl as string);
    await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await admin.destroy();
    await bootstrapLocalE2eSchema(scratchUrl);
    process.env.DATABASE_URL = scratchUrl;
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it(
    "upserts a user and reads it back",
    async () => {
      const { upsertUser, getUserByOpenId, getUserIdByOpenId } = await import(
        "./db"
      );
      await upsertUser({ openId: "dbunit:hermetic" });
      const user = await getUserByOpenId("dbunit:hermetic");
      expect(user?.openId).toBe("dbunit:hermetic");
      const id = await getUserIdByOpenId("dbunit:hermetic");
      expect(id).toBeGreaterThan(0);
      if (!id) throw new Error("User id missing after upsert");
      userId = id;
    },
    30000
  );

  it(
    "createProject seeds the 15 default categories",
    async () => {
      const { createProject, getOverview } = await import("./db");
      const project = await createProject(userId, "Hermetic");
      expect(project.id).toBeGreaterThan(0);
      if (!project.id) throw new Error("Project creation returned no id");
      projectId = project.id;
      const overview = await getOverview(userId, projectId);
      expect(overview.categories).toHaveLength(15);
      expect(
        overview.categories.filter(c => c.type === "income")
      ).toHaveLength(3);
      expect(overview.categories.map(c => c.name)).toContain("বেতন");
    },
    30000
  );

  it(
    "income and expense move the account balance",
    async () => {
      const { createAccount, createTransaction, getOverview } = await import(
        "./db"
      );
      const account = await createAccount(userId, {
        projectId,
        name: "Cash",
        type: "cash",
        openingBalance: 1000,
      });
      const incomeCat = (
        await getOverview(userId, projectId)
      ).categories.find(c => c.type === "income");
      const expenseCat = (
        await getOverview(userId, projectId)
      ).categories.find(c => c.type === "expense");
      expect(incomeCat).toBeDefined();
      expect(expenseCat).toBeDefined();

      incomeId = await createTransaction(userId, {
        projectId,
        categoryId: incomeCat!.id,
        accountId: account.id,
        type: "income",
        amount: 500,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      let overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1500);

      const expenseId = await createTransaction(userId, {
        projectId,
        categoryId: expenseCat!.id,
        accountId: account.id,
        type: "expense",
        amount: 200,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1300);

      const { deleteTransaction } = await import("./db");
      await deleteTransaction(userId, projectId, expenseId);
      overview = await getOverview(userId, projectId);
      expect(overview.transactions).toHaveLength(1);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1500);
    },
    60000
  );

  it(
    "updating a transaction rebalances the account",
    async () => {
      const { updateTransaction, getOverview } = await import("./db");
      const overview0 = await getOverview(userId, projectId);
      const incomeCat = overview0.categories.find(c => c.type === "income")!;
      const account = overview0.accounts[0];
      const before = Number(account.currentBalance);

      await updateTransaction(userId, Number(incomeId), {
        projectId,
        categoryId: incomeCat.id,
        accountId: account.id,
        type: "income",
        amount: 700,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      const overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 500 + 700);
    },
    60000
  );

  it(
    "rejects non-positive amounts",
    async () => {
      const { createTransaction, getOverview } = await import("./db");
      const cat = (await getOverview(userId, projectId)).categories[0];
      await expect(
        createTransaction(userId, {
          projectId,
          categoryId: cat.id,
          type: cat.type as "income" | "expense",
          amount: 0,
          paymentMethod: "cash",
          occurredAt: new Date(),
        })
      ).rejects.toThrow("লেনদেনের পরিমাণ");
    },
    30000
  );

  it(
    "runs the session lifecycle",
    async () => {
      const {
        createUserSession,
        getSessionByRefreshToken,
        countActiveSessions,
        revokeSession,
        revokeAllUserSessions,
        findRevokedSessionByToken,
        cleanupExpiredSessions,
      } = await import("./db");
      const future = new Date(Date.now() + 3600_000);
      await createUserSession(
        userId,
        "sess-hermetic-1",
        "refresh-hermetic-1",
        "vitest",
        "127.0.0.1",
        future,
        future
      );
      const session = await getSessionByRefreshToken("refresh-hermetic-1");
      expect(session?.userId).toBe(userId);
      expect(await countActiveSessions(userId)).toBe(1);

      await revokeSession("refresh-hermetic-1");
      expect(await countActiveSessions(userId)).toBe(0);
      const revoked = await findRevokedSessionByToken("sess-hermetic-1");
      expect(revoked.length).toBe(1);

      await createUserSession(
        userId,
        "sess-hermetic-2",
        "refresh-hermetic-2",
        "vitest",
        "127.0.0.1",
        future,
        future
      );
      await revokeAllUserSessions(userId);
      expect(await countActiveSessions(userId)).toBe(0);

      const past = new Date(Date.now() - 3600_000);
      await createUserSession(
        userId,
        "sess-hermetic-3",
        "refresh-hermetic-3",
        "vitest",
        "127.0.0.1",
        past,
        past
      );
      await cleanupExpiredSessions();
      expect(
        await getSessionByRefreshToken("refresh-hermetic-3")
      ).toBeUndefined();
    },
    60000
  );

  it(
    "enforces the voucher state machine",
    async () => {
      const {
        getChartOfAccounts,
        createVoucherWithEntries,
        submitVoucher,
        approveVoucher,
      } = await import("./db");
      const chart = await getChartOfAccounts(userId, projectId);
      const debitCoa = chart.find(a => a.code === "1110");
      const creditCoa = chart.find(a => a.code === "4100");
      expect(debitCoa?.id).toBeGreaterThan(0);
      expect(creditCoa?.id).toBeGreaterThan(0);
      if (!debitCoa || !creditCoa)
        throw new Error("Canonical chart accounts missing");

      await expect(
        createVoucherWithEntries(userId, {
          projectId,
          date: new Date(),
          narration: "unbalanced",
          debits: [{ accountId: debitCoa.id, amount: 100 }],
          credits: [{ accountId: creditCoa.id, amount: 99 }],
        })
      ).rejects.toThrow();

      const { voucherId } = await createVoucherWithEntries(userId, {
        projectId,
        date: new Date(),
        narration: "hermetic draft",
        debits: [{ accountId: debitCoa.id, amount: 100 }],
        credits: [{ accountId: creditCoa.id, amount: 100 }],
      });
      expect(voucherId).toBeGreaterThan(0);

      const submitted = await submitVoucher(userId, projectId, voucherId);
      expect(submitted.status).toBe("submitted");
      // Double submit is an illegal transition.
      await expect(
        submitVoucher(userId, projectId, voucherId)
      ).rejects.toThrow();
      // Maker cannot check their own voucher.
      await expect(
        approveVoucher(userId, projectId, voucherId, "approve")
      ).rejects.toThrow();
      // Return to draft, then submit again.
      await approveVoucher(userId, projectId, voucherId, "return");
      const resubmitted = await submitVoucher(userId, projectId, voucherId);
      expect(resubmitted.status).toBe("submitted");
    },
    60000
  );

  it(
    "builds the monthly report from recorded transactions",
    async () => {
      const { getMonthlyReport } = await import("./db");
      const monthKey = new Date().toISOString().slice(0, 7);
      const report = await getMonthlyReport(userId, projectId, monthKey);
      // State so far: one income txn of 700, expense deleted.
      expect(report.totalIncome).toBe(700);
      expect(report.totalExpense).toBe(0);
      expect(report.netAmount).toBe(700);
      expect(report.transactionCount).toBe(1);
      expect(report.monthKey).toBe(monthKey);
      expect(report.financialPosition.accountBalance).toBe(1700);
    },
    60000
  );

  it(
    "creates and partially settles a debt",
    async () => {
      const { createDue, settleDue, getOverview, getMonthlyReport } =
        await import("./db");
      const account = (await getOverview(userId, projectId)).accounts[0];
      const before = Number(account.currentBalance);
      const due = await createDue(userId, {
        projectId,
        type: "debt",
        counterparty: "Hermetic Lender",
        amount: 300,
        openedAt: new Date(),
      });
      expect(Number(due.outstandingAmount)).toBe(300);

      // Overpaying must be rejected.
      await expect(
        settleDue(userId, {
          projectId,
          dueId: due.id,
          accountId: account.id,
          amount: 500,
          occurredAt: new Date(),
        })
      ).rejects.toThrow();

      await settleDue(userId, {
        projectId,
        dueId: due.id,
        accountId: account.id,
        amount: 100,
        occurredAt: new Date(),
      });
      const monthKey = new Date().toISOString().slice(0, 7);
      const report = await getMonthlyReport(userId, projectId, monthKey);
      expect(report.totalDebt).toBe(200);
      const overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 100);
    },
    60000
  );

  it(
    "generates a due recurring run",
    async () => {
      const {
        createRecurringTemplate,
        generateRecurringNow,
        getOverview,
      } = await import("./db");
      const overview0 = await getOverview(userId, projectId);
      const expenseCat = overview0.categories.find(
        c => c.type === "expense"
      )!;
      const account = overview0.accounts[0];
      const before = Number(account.currentBalance);
      const txnCount = overview0.transactions.length;

      const templateId = await createRecurringTemplate(userId, {
        projectId,
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 50,
        paymentMethod: "cash",
        frequency: "monthly",
        scheduleDay: 1,
        nextRunAt: new Date(Date.now() - 86_400_000),
      });
      const result = await generateRecurringNow(
        userId,
        projectId,
        templateId,
        new Date()
      );
      expect(result.created).toBeGreaterThanOrEqual(1);

      const overview = await getOverview(userId, projectId);
      expect(overview.transactions.length).toBeGreaterThan(txnCount);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 50 * result.created);
    },
    60000
  );
});
