import { createHash } from "node:crypto";
import { createConnection } from "mysql2/promise";
import { seedDefaultRBAC } from "./seed-rbac";
import { migrateExistingUsersToRBAC } from "./migrate-existing-users-rbac";
import { initializeRBAC, markRBACUnavailable } from "./rbac";

const LOCK_TIMEOUT_SECONDS = 5;
const LOCK_NAME_PREFIX = "money-tracker-rbac:";
let rbacInitialization: Promise<void> | null = null;

function databaseIdentity(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const pathname = url.pathname;
    const databaseName = pathname.split("/").filter(Boolean).pop();
    if (databaseName)
      return `${url.hostname}:${url.port || "default"}/${decodeURIComponent(databaseName)}`;
  } catch {
    return "default";
  }
  return "default";
}

export function getRBACLockName(databaseUrl: string): string {
  const digest = createHash("sha256")
    .update(databaseIdentity(databaseUrl))
    .digest("hex")
    .slice(0, 40);
  return `${LOCK_NAME_PREFIX}${digest}`;
}

async function runInitialization(): Promise<void> {
  await seedDefaultRBAC();
  await migrateExistingUsersToRBAC();
  await initializeRBAC();
}

export async function runWithRBACLock(
  databaseUrl: string,
  initialize: () => Promise<void>
): Promise<void> {
  if (!databaseUrl)
    throw new Error("Database unavailable for RBAC startup lock");

  const connection = await createConnection(databaseUrl);
  const lockName = getRBACLockName(databaseUrl);
  let failed = false;
  let failure: unknown;

  try {
    const result = await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [
      lockName,
      LOCK_TIMEOUT_SECONDS,
    ]);
    const rows = result[0] as Array<{ acquired: number | string | null }>;
    if (Number(rows[0]?.acquired) !== 1) {
      throw new Error("RBAC startup lock could not be acquired");
    }
    await initialize();
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    try {
      await connection.end();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }

  if (failed) throw failure;
}

export function initializeRBACSystem(): Promise<void> {
  if (!rbacInitialization) {
    markRBACUnavailable();
    rbacInitialization = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Database unavailable for RBAC startup lock");
        }
        return runInitialization();
      }
      return runWithRBACLock(databaseUrl, runInitialization);
    })().catch(error => {
      markRBACUnavailable();
      rbacInitialization = null;
      throw error;
    });
  }
  return rbacInitialization;
}
