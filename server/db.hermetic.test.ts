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
});
