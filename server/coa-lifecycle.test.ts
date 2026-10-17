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

const scratchDatabase = `money_tracker_coa_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("chart of accounts lifecycle (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;
  let secondProjectId = 0;
  let otherUserId = 0;
  let otherProjectId = 0;

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
    await upsertUser({ openId: "dbunit:coa" });
    userId = (await getUserIdByOpenId("dbunit:coa"))!;
    await upsertUser({ openId: "dbunit:coa-other" });
    otherUserId = (await getUserIdByOpenId("dbunit:coa-other"))!;
    await seedDefaultAccountTypes();
    const project = await createProject(userId, "CoA Lifecycle");
    projectId = project.id!;
    const second = await createProject(userId, "CoA Lifecycle Second");
    secondProjectId = second.id!;
    const other = await createProject(otherUserId, "CoA Lifecycle Other");
    otherProjectId = other.id!;
    await seedDefaultChartOfAccounts(userId, projectId);
    await seedDefaultChartOfAccounts(userId, secondProjectId);
    await seedDefaultChartOfAccounts(otherUserId, otherProjectId);
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it("moving an account to the root level clears its parent (edit contract)", async () => {
    const { updateChartOfAccount, getChartOfAccounts } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cashInHand = chart.find(a => a.code === "1110")!;
    // Seeded under 1100 (Cash & Bank), so it must carry a parent row.
    expect(cashInHand.parentId).toBeTruthy();
    await updateChartOfAccount(
      userId,
      projectId,
      cashInHand.id,
      { parentId: null }
    );
    const after = await getChartOfAccounts(userId, projectId);
    const moved = after.find(a => a.id === cashInHand.id)!;
    expect(moved.parentId).toBeNull();
  });

  it("rejects a sub-account under a non-detail group account", async () => {
    const { createChartOfAccount, getAccountTypes, getChartOfAccounts } =
      await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const chart = await getChartOfAccounts(userId, projectId);
    const group = chart.find(a => a.code === "1100")!;
    expect(group.isDetail).toBe(false);
    await expect(
      createChartOfAccount(userId, {
        projectId,
        accountTypeId: expenseType.id,
        parentId: group.id,
        code: "9999",
        name: "Under group",
      })
    ).rejects.toThrow(
      "শুধু ডিটেইল অ্যাকাউন্টের অধীনে সাব-অ্যাকাউন্ট তৈরি করা যায়"
    );
  });

  it("rejects an account becoming its own parent", async () => {
    const { updateChartOfAccount, getChartOfAccounts } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const leaf = chart.find(a => a.code === "1110")!;
    await expect(
      updateChartOfAccount(userId, projectId, leaf.id, {
        parentId: leaf.id,
      })
    ).rejects.toThrow("অ্যাকাউন্ট নিজেই তার পেরেন্ট হতে পারে না");
  });

  it("rejects a parent account from another project of the same user", async () => {
    const { createChartOfAccount, getAccountTypes, getChartOfAccounts } =
      await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const foreign = await getChartOfAccounts(userId, secondProjectId);
    const foreignDetail = foreign.find(a => a.code === "1110")!;
    await expect(
      createChartOfAccount(userId, {
        projectId,
        accountTypeId: expenseType.id,
        parentId: foreignDetail.id,
        code: "9998",
        name: "Foreign project parent",
      })
    ).rejects.toThrow("পেরেন্ট অ্যাকাউন্ট পাওয়া যায়নি");
  });

  it("rejects a parent account owned by another user", async () => {
    const { createChartOfAccount, getAccountTypes, getChartOfAccounts } =
      await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const foreign = await getChartOfAccounts(otherUserId, otherProjectId);
    const foreignDetail = foreign.find(a => a.code === "1110")!;
    await expect(
      createChartOfAccount(userId, {
        projectId,
        accountTypeId: expenseType.id,
        parentId: foreignDetail.id,
        code: "9997",
        name: "Foreign user parent",
      })
    ).rejects.toThrow("পেরেন্ট অ্যাকাউন্ট পাওয়া যায়নি");
  });

  it("refuses to delete an account that still has children", async () => {
    const {
      createChartOfAccount,
      deleteChartOfAccount,
      getAccountTypes,
    } = await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const parent = await createChartOfAccount(userId, {
      projectId,
      accountTypeId: expenseType.id,
      code: "9996",
      name: "Delete guard parent",
      isDetail: true,
    });
    await createChartOfAccount(userId, {
      projectId,
      accountTypeId: expenseType.id,
      parentId: parent.id,
      code: "9995",
      name: "Delete guard child",
      isDetail: true,
    });
    await expect(
      deleteChartOfAccount(userId, projectId, parent.id)
    ).rejects.toThrow("চাইল্ড অ্যাকাউন্ট থাকা অবস্থায় মুছা যাবে না");
  });

  it("refuses to delete an account referenced by voucher entries", async () => {
    const {
      createVoucherWithEntries,
      deleteChartOfAccount,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-02-01T10:00:00.000Z"),
      narration: "coa delete guard",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 100 }],
      credits: [{ accountId: revenue.id, amount: 100 }],
    });
    await expect(
      deleteChartOfAccount(userId, projectId, cash.id)
    ).rejects.toThrow(
      "এই অ্যাকাউন্ট ভাউচার এন্ট্রিতে ব্যবহৃত হয়েছে; মুছে ফেলা যাবে না"
    );
  });

  it("deletes a leaf account with no children or voucher references", async () => {
    const {
      createChartOfAccount,
      deleteChartOfAccount,
      getAccountTypes,
      getChartOfAccounts,
    } = await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const created = await createChartOfAccount(userId, {
      projectId,
      accountTypeId: expenseType.id,
      code: "9994",
      name: "Disposible leaf",
      isDetail: true,
    });
    await deleteChartOfAccount(userId, projectId, created.id);
    const chart = await getChartOfAccounts(userId, projectId);
    expect(chart.some(a => a.id === created.id)).toBe(false);
  });

  it("concurrent creates with the same code leave exactly one account", async () => {
    const {
      createChartOfAccount,
      getAccountTypes,
      getChartOfAccounts,
    } = await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    const input = {
      projectId,
      accountTypeId: expenseType.id,
      code: "9993",
      name: "Race duplicate",
      isDetail: true,
    };
    const results = await Promise.allSettled([
      createChartOfAccount(userId, input),
      createChartOfAccount(userId, input),
    ]);
    // One insert wins; the loser is rejected either by the pre-check or by
    // the (projectId, code) unique index — both outcomes are acceptable,
    // but exactly one row may exist.
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const chart = await getChartOfAccounts(userId, projectId);
    expect(chart.filter(a => a.code === "9993")).toHaveLength(1);
  });

  it("seeding the default CoA twice keeps exactly one account per code", async () => {
    const { seedDefaultChartOfAccounts, getChartOfAccounts } =
      await import("./db");
    await expect(
      seedDefaultChartOfAccounts(userId, projectId)
    ).resolves.toBeDefined();
    const chart = await getChartOfAccounts(userId, projectId);
    const codes = chart.map(a => a.code);
    const duplicates = codes.filter(
      (code, index) => codes.indexOf(code) !== index
    );
    expect(duplicates).toEqual([]);
  });
});
