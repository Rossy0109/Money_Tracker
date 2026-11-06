import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
// @ts-expect-error - helper script without type declarations
import { getIsolatedE2EDatabaseUrl } from "../scripts/e2e-database.mjs";
// @ts-expect-error - helper script without type declarations
import { bootstrapLocalE2eSchema } from "../scripts/bootstrap-local-e2e-schema.mjs";
import { closeDatabaseConnection } from "./_core/dbConnection";
import type { RateLimitStore } from "./_core/rateLimiter";

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

const scratchDatabase = `money_tracker_ratelimit_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("database rate-limit store (disposable MariaDB)", () => {
  let store: RateLimitStore;
  const key = (suffix: string) => `rl:test:${suffix}`;

  beforeAll(async () => {
    const admin = await createConnection(baseUrl as string);
    await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await admin.destroy();
    await bootstrapLocalE2eSchema(scratchUrl);
    process.env.DATABASE_URL = scratchUrl;

    const { createDbRateLimitStore } = await import(
      "./_core/rateLimitDbStore"
    );
    store = createDbRateLimitStore();
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it("returns null for an unknown key", async () => {
    await expect(store.get(key("missing"))).resolves.toBeNull();
  });

  it("round-trips a window through set and get", async () => {
    const record = { count: 3, resetAt: Date.now() + 60_000 };
    await store.set(key("roundtrip"), record);
    await expect(store.get(key("roundtrip"))).resolves.toEqual(record);
  });

  it("upserts an existing window instead of failing", async () => {
    await store.set(key("upsert"), { count: 1, resetAt: Date.now() + 60_000 });
    const next = { count: 2, resetAt: Date.now() + 60_000 };
    await store.set(key("upsert"), next);
    await expect(store.get(key("upsert"))).resolves.toEqual(next);
  });

  it("treats an expired window as missing and drops the row", async () => {
    await store.set(key("expired"), {
      count: 9,
      resetAt: Date.now() - 1_000,
    });
    await expect(store.get(key("expired"))).resolves.toBeNull();

    // The row itself is gone, not merely hidden behind a stale timestamp.
    const { databaseRequired, getDb } = await import("./db");
    const db = databaseRequired(await getDb());
    const { rateLimitCounters } = await import("../drizzle/schema");
    const rows = await db
      .select()
      .from(rateLimitCounters)
      .where(eq(rateLimitCounters.key, key("expired")));
    expect(rows).toHaveLength(0);
  });

  it("removes a key on delete", async () => {
    await store.set(key("delete"), {
      count: 5,
      resetAt: Date.now() + 60_000,
    });
    await store.delete(key("delete"));
    await expect(store.get(key("delete"))).resolves.toBeNull();
  });
});
