import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
// @ts-expect-error - helper script without type declarations
import { getIsolatedE2EDatabaseUrl } from "../scripts/e2e-database.mjs";
// @ts-expect-error - helper script without type declarations
import { bootstrapLocalE2eSchema } from "../scripts/bootstrap-local-e2e-schema.mjs";
import { closeDatabaseConnection } from "./_core/dbConnection";
import { fromCents } from "./money";

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

const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_recon_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("ledger <-> balance reconciliation (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;

  beforeAll(async () => {
    const admin = await createConnection(baseUrl as string);
    await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await admin.destroy();
    await bootstrapLocalE2eSchema(scratchUrl);
    process.env.DATABASE_URL = scratchUrl;

    const { upsertUser, createProject, seedDefaultAccountTypes } = await import(
      "./db"
    );
    await upsertUser({ openId: "dbunit:recon" });
    const { getUserIdByOpenId } = await import("./db");
    userId = (await getUserIdByOpenId("dbunit:recon"))!;
    await seedDefaultAccountTypes();
    const project = await createProject(userId, "Recon Test");
    projectId = project.id!;
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it("posted voucher ledger entries reconcile exactly with account balances", async () => {
    const {
      getChartOfAccounts,
      createVoucherWithEntries,
      getLedgerEntriesForReconciliation,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const sales = chart.find(a => a.code === "4100")!;
    const expenseAcct = chart.find(a => a.code === "5110")!;
    expect(cash && sales && expenseAcct).toBeTruthy();

    // Two posted vouchers: a sale (cash debit / sales credit) and an expense.
    // Distinct dates keep ledger ordering deterministic.
    const day1 = new Date("2026-01-01T10:00:00.000Z");
    const day2 = new Date("2026-01-02T10:00:00.000Z");
    await createVoucherWithEntries(userId, {
      projectId,
      date: day1,
      narration: "recon sale",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 500 }],
      credits: [{ accountId: sales.id, amount: 500 }],
    });
    await createVoucherWithEntries(userId, {
      projectId,
      date: day2,
      narration: "recon expense",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: expenseAcct.id, amount: 120 }],
      credits: [{ accountId: cash.id, amount: 120 }],
    });

    // 1. Per-account net of ledger entries matches expected movement.
    const cashNet = await getLedgerEntriesForReconciliation(
      userId,
      projectId,
      cash.id
    );
    const salesNet = await getLedgerEntriesForReconciliation(
      userId,
      projectId,
      sales.id
    );
    const expenseNet = await getLedgerEntriesForReconciliation(
      userId,
      projectId,
      expenseAcct.id
    );
    const net = (rows: { entryType: string; amount: string }[]) =>
      rows.reduce(
        (sum, e) =>
          sum + (e.entryType === "debit" ? 1 : -1) * Number(e.amount),
        0
      );
    expect(net(cashNet)).toBeCloseTo(500 - 120, 2);
    expect(net(salesNet)).toBeCloseTo(-500, 2);
    expect(net(expenseNet)).toBeCloseTo(120, 2);

    // 2. runningBalance on the last ledger row equals the account's
    //    currentBalance (posting sequence is internally consistent).
    const after = await getChartOfAccounts(userId, projectId);
    for (const [rows, code] of [
      [cashNet, "1110"],
      [salesNet, "4100"],
      [expenseNet, "5110"],
    ] as const) {
      const last = rows[0]; // ordered by postedAt desc
      const account = after.find(a => a.code === code)!;
      expect(Number(account.currentBalance)).toBeCloseTo(
        Number(last.runningBalance),
        2
      );
    }

    // 3. Ledger amounts are strictly positive; cents helper is exact.
    for (const rows of [cashNet, salesNet, expenseNet])
      for (const e of rows) expect(Number(e.amount)).toBeGreaterThan(0);
    expect(fromCents(380)).toBeCloseTo(3.8, 2);
  }, 60000);

  it("parent-child integrity: children only under detail accounts, codes unique per project", async () => {
    const { getChartOfAccounts, createChartOfAccount, createProject } =
      await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const groupAcct = chart.find(a => a.code === "1000")!; // group (isDetail=false)
    const detailAcct = chart.find(a => a.code === "1110")!; // detail

    // Child under a group account is rejected.
    await expect(
      createChartOfAccount(userId, {
        projectId,
        accountTypeId: detailAcct.accountTypeId,
        parentId: groupAcct.id,
        code: "9990",
        name: "bad child",
      })
    ).rejects.toThrow();

    // Child under a detail account succeeds.
    const child = await createChartOfAccount(userId, {
      projectId,
      accountTypeId: detailAcct.accountTypeId,
      parentId: detailAcct.id,
      code: "9991",
      name: "good child",
    });
    expect(child?.parentId).toBe(detailAcct.id);

    // Reusing an existing code in the same project is rejected.
    await expect(
      createChartOfAccount(userId, {
        projectId,
        accountTypeId: detailAcct.accountTypeId,
        code: "1110",
        name: "dup code",
      })
    ).rejects.toThrow();

    // The same non-canonical code is fine in a *different* project
    // (project-scoped uniqueness; canonical codes are seeded everywhere).
    const other = await createProject(userId, "Recon Other");
    const sameCode = await createChartOfAccount(userId, {
      projectId: other.id!,
      accountTypeId: detailAcct.accountTypeId,
      code: "7777",
      name: "scoped dup ok",
    });
    expect(sameCode?.code).toBe("7777");
    await expect(
      createChartOfAccount(userId, {
        projectId: other.id!,
        accountTypeId: detailAcct.accountTypeId,
        code: "7777",
        name: "scoped dup again",
      })
    ).rejects.toThrow();

    // Editing the child to reuse the parent's own code is rejected server-side.
    const { updateChartOfAccount } = await import("./db");
    await expect(
      updateChartOfAccount(userId, projectId, child!.id, { code: "1110" })
    ).rejects.toThrow();
  }, 60000);
});
