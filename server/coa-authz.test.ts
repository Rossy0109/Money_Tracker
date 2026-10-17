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

const scratchDatabase = `money_tracker_coaauth_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("chart of accounts cross-project authorization (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;
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
    await upsertUser({ openId: "dbunit:coaauth" });
    userId = (await getUserIdByOpenId("dbunit:coaauth"))!;
    await upsertUser({ openId: "dbunit:coaauth-other" });
    otherUserId = (await getUserIdByOpenId("dbunit:coaauth-other"))!;
    await seedDefaultAccountTypes();
    const project = await createProject(userId, "CoA Authz");
    projectId = project.id!;
    const other = await createProject(otherUserId, "CoA Authz Other");
    otherProjectId = other.id!;
    await seedDefaultChartOfAccounts(userId, projectId);
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

  it("getChartOfAccounts rejects a foreign project", async () => {
    const { getChartOfAccounts } = await import("./db");
    await expect(
      getChartOfAccounts(otherUserId, projectId)
    ).rejects.toThrow("Project not found or access denied");
  });

  it("getChartOfAccountById never returns a foreign account", async () => {
    const { getChartOfAccounts, getChartOfAccountById } = await import("./db");
    const foreign = await getChartOfAccounts(otherUserId, otherProjectId);
    const foreignAccount = foreign.find(a => a.code === "1110")!;
    const account = await getChartOfAccountById(
      userId,
      projectId,
      foreignAccount.id
    );
    expect(account).toBeUndefined();
  });

  it("createChartOfAccount rejects a foreign project", async () => {
    const { createChartOfAccount, getAccountTypes } = await import("./db");
    const types = await getAccountTypes();
    const expenseType = types.find(t => t.code === "EXPENSE")!;
    await expect(
      createChartOfAccount(otherUserId, {
        projectId,
        accountTypeId: expenseType.id,
        code: "8888",
        name: "Cross project create",
      })
    ).rejects.toThrow("Project not found or access denied");
  });

  it("updateChartOfAccount rejects a foreign project", async () => {
    const { updateChartOfAccount, getChartOfAccounts } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const account = chart.find(a => a.code === "1110")!;
    await expect(
      updateChartOfAccount(otherUserId, projectId, account.id, {
        name: "Cross project edit",
      })
    ).rejects.toThrow("Project not found or access denied");
  });

  it("updateChartOfAccount rejects a foreign account id within the caller project", async () => {
    const {
      updateChartOfAccount,
      getChartOfAccounts,
    } = await import("./db");
    const foreign = await getChartOfAccounts(otherUserId, otherProjectId);
    const foreignAccount = foreign.find(a => a.code === "1110")!;
    await expect(
      updateChartOfAccount(userId, projectId, foreignAccount.id, {
        name: "Cross project account edit",
      })
    ).rejects.toThrow("অ্যাকাউন্ট পাওয়া যায়নি");
    // The foreign account must be untouched by the rejected call.
    const after = await getChartOfAccounts(otherUserId, otherProjectId);
    const untouched = after.find(a => a.id === foreignAccount.id)!;
    expect(untouched.name).toBe(foreignAccount.name);
  });

  it("deleteChartOfAccount rejects a foreign project", async () => {
    const { deleteChartOfAccount, getChartOfAccounts } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const account = chart.find(a => a.code === "1110")!;
    await expect(
      deleteChartOfAccount(otherUserId, projectId, account.id)
    ).rejects.toThrow("Project not found or access denied");
  });

  it("deleteChartOfAccount rejects a foreign account id within the caller project", async () => {
    const { deleteChartOfAccount, getChartOfAccounts } = await import("./db");
    const foreign = await getChartOfAccounts(otherUserId, otherProjectId);
    const foreignAccount = foreign.find(a => a.code === "1110")!;
    await expect(
      deleteChartOfAccount(userId, projectId, foreignAccount.id)
    ).rejects.toThrow("অ্যাকাউন্ট পাওয়া যায়নি");
    const after = await getChartOfAccounts(otherUserId, otherProjectId);
    expect(after.some(a => a.id === foreignAccount.id)).toBe(true);
  });

  it("seedDefaultChartOfAccounts rejects a foreign project", async () => {
    const { seedDefaultChartOfAccounts } = await import("./db");
    await expect(
      seedDefaultChartOfAccounts(otherUserId, projectId)
    ).rejects.toThrow("Project not found or access denied");
  });
});
