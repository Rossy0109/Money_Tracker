/**
 * P3-S-3 — password-reset tokens are hashed at rest.
 *
 * Runs against the same disposable MariaDB harness as
 * rateLimitDbStore.test.ts: without ISOLATED_E2E_DATABASE_URL the suite
 * self-skips, with it CI proves the round trip on a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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

const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_resettok_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)(
  "password-reset token hashing (disposable MariaDB)",
  () => {
    const email = "reset-hash@example.com";
    let financeDb: typeof import("./db");

    beforeAll(async () => {
      const admin = await createConnection(baseUrl as string);
      await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
      await admin.destroy();
      await bootstrapLocalE2eSchema(scratchUrl);
      process.env.DATABASE_URL = scratchUrl;

      financeDb = await import("./db");
      const { databaseRequired, getDb } = financeDb;
      const db = databaseRequired(await getDb());
      const { users } = await import("../drizzle/schema");
      await db.insert(users).values({
        openId: "google:reset-hash-test",
        email,
        name: "Reset Hash",
        loginMethod: "password",
        status: "active",
      });
    }, 60000);

    afterAll(async () => {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;
      await closeDatabaseConnection();
      const admin = await createConnection(baseUrl as string);
      await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
      await admin.destroy();
    }, 60000);

    it("stores only a SHA-256 hash of the issued token", async () => {
      const issued = await financeDb.createPasswordResetToken(email);
      expect(issued.success).toBe(true);
      if (!("resetToken" in issued) || !issued.resetToken) {
        throw new Error("expected a token for the known email");
      }

      const { databaseRequired, getDb } = financeDb;
      const db = databaseRequired(await getDb());
      const { users } = await import("../drizzle/schema");
      const [row] = await db
        .select({
          resetToken: users.resetToken,
          resetTokenExpiresAt: users.resetTokenExpiresAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      // The stored value is a 64-char hex digest — never the token itself.
      expect(row?.resetToken).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.resetToken).not.toBe(issued.resetToken);
      expect(row?.resetTokenExpiresAt).toBeInstanceOf(Date);
    });

    it("validates the plaintext token it returned and rejects a tamper", async () => {
      const issued = await financeDb.createPasswordResetToken(email);
      if (!("resetToken" in issued) || !issued.resetToken) {
        throw new Error("expected a token for the known email");
      }

      const valid = await financeDb.validatePasswordResetToken(
        issued.resetToken
      );
      expect(valid.valid).toBe(true);
      expect(valid.user?.email).toBe(email);

      const tampered = await financeDb.validatePasswordResetToken(
        `${issued.resetToken}x`
      );
      expect(tampered.valid).toBe(false);

      const other = await financeDb.validatePasswordResetToken("guess");
      expect(other.valid).toBe(false);
    });

    it("clears the hash on consume so a used token cannot replay", async () => {
      const issued = await financeDb.createPasswordResetToken(email);
      if (!("resetToken" in issued) || !issued.resetToken) {
        throw new Error("expected a token for the known email");
      }
      await financeDb.consumePasswordResetToken(
        "google:reset-hash-test",
        "scrypt$fake$hash"
      );

      const after = await financeDb.validatePasswordResetToken(
        issued.resetToken
      );
      expect(after.valid).toBe(false);
    });
  }
);
