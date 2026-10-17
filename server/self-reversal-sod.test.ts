/**
 * S-02 — Quick-entry self-reversal segregation-of-duties exception.
 *
 * `reverseVoucherInTx` refuses to reverse a voucher created by the same actor
 * (the "নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না" guard), but it accepts
 * `enforceSelfCheck: false`. `updateTransaction` and `deleteTransaction` pass
 * that flag so a quick-entry holder can edit or delete their own posted entry:
 * the linked voucher is reversed internally and (on edit) replaced. This is an
 * explicitly approved SoD exception, scoped to the actor's *own* transaction
 * (`financeTransactions.userId = userId`) and recorded with a distinct audit
 * summary so forensics can separate it from the voucher lifecycle path.
 *
 * This suite locks that behaviour down. It runs only against a reachable
 * disposable MariaDB (`ISOLATED_E2E_DATABASE_URL`) and self-skips otherwise.
 */
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

const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_sod_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)(
  "quick-entry self-reversal SoD exception (disposable MariaDB)",
  () => {
    let userId = 0;
    let projectId = 0;
    let otherUserId = 0;
    let categoryId = 0;

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
        createCategory,
      } = await import("./db");
      await upsertUser({ openId: "dbunit:sod" });
      userId = (await getUserIdByOpenId("dbunit:sod"))!;
      await upsertUser({ openId: "dbunit:sod-other" });
      otherUserId = (await getUserIdByOpenId("dbunit:sod-other"))!;
      await seedDefaultAccountTypes();
      const project = await createProject(userId, "SoD Exception");
      projectId = project.id!;
      await seedDefaultChartOfAccounts(userId, projectId);
      const category = await createCategory(userId, {
        projectId,
        type: "expense",
        name: "SoD Test Expense",
      });
      categoryId = category.id;
    }, 60000);

    afterAll(async () => {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;
      await closeDatabaseConnection();
      const admin = await createConnection(baseUrl as string);
      await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
      await admin.destroy();
    }, 60000);

    async function voucherStatus(voucherId: number): Promise<string> {
      const { getDb, databaseRequired } = await import("./db");
      const { financeVouchers } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = databaseRequired(await getDb());
      const [row] = await db
        .select({ status: financeVouchers.status })
        .from(financeVouchers)
        .where(eq(financeVouchers.id, voucherId))
        .limit(1);
      return row?.status ?? "missing";
    }

    it("lets the owner edit their own quick entry, reversing the linked voucher (approved SoD exception)", async () => {
      const { createTransaction, updateTransaction, getDb, databaseRequired } =
        await import("./db");
      const { financeTransactions } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const id = await createTransaction(userId, {
        projectId,
        categoryId,
        type: "expense",
        amount: 400,
        paymentMethod: "cash",
        note: "edit me",
        occurredAt: new Date("2026-04-01T10:00:00.000Z"),
      });
      const db = databaseRequired(await getDb());
      const [before] = await db
        .select({ voucherId: financeTransactions.voucherId })
        .from(financeTransactions)
        .where(eq(financeTransactions.id, id))
        .limit(1);
      const originalVoucherId = before!.voucherId!;
      expect(originalVoucherId).toBeGreaterThan(0);
      expect(await voucherStatus(originalVoucherId)).toBe("posted");

      await expect(
        updateTransaction(userId, id, {
          projectId,
          categoryId,
          type: "expense",
          amount: 550,
          paymentMethod: "cash",
          note: "edited",
          occurredAt: new Date("2026-04-02T10:00:00.000Z"),
        })
      ).resolves.toBeUndefined();

      // The original voucher was reversed through the internal bypass...
      expect(await voucherStatus(originalVoucherId)).toBe("reversed");

      // ...and the transaction now points at a fresh replacement voucher.
      const [after] = await db
        .select({ voucherId: financeTransactions.voucherId })
        .from(financeTransactions)
        .where(eq(financeTransactions.id, id))
        .limit(1);
      expect(after!.voucherId).not.toBe(originalVoucherId);
      expect(await voucherStatus(after!.voucherId!)).toBe("posted");

      const { getVoucherReversals } = await import("./db");
      const reversals = await getVoucherReversals(userId, projectId);
      expect(
        reversals.some(r => r.originalVoucherId === originalVoucherId)
      ).toBe(true);
    });

    it("records a distinct audit summary so the exception is forensically separable", async () => {
      const { listAuditLogs } = await import("./audit");
      const logs = await listAuditLogs({ actorUserId: userId });
      expect(
        logs.some(
          l =>
            l.summary ===
            "Quick-entry edit: reversal of own posted voucher + replacement (approved SoD exception)"
        )
      ).toBe(true);
    });

    it("lets the owner delete their own quick entry, reversing the linked voucher (approved SoD exception)", async () => {
      const { createTransaction, deleteTransaction, getDb, databaseRequired } =
        await import("./db");
      const { financeTransactions } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const id = await createTransaction(userId, {
        projectId,
        categoryId,
        type: "expense",
        amount: 120,
        paymentMethod: "cash",
        occurredAt: new Date("2026-04-03T10:00:00.000Z"),
      });
      const db = databaseRequired(await getDb());
      const [row] = await db
        .select({ voucherId: financeTransactions.voucherId })
        .from(financeTransactions)
        .where(eq(financeTransactions.id, id))
        .limit(1);
      const voucherId = row!.voucherId!;

      await expect(
        deleteTransaction(userId, projectId, id)
      ).resolves.toBeUndefined();
      expect(await voucherStatus(voucherId)).toBe("reversed");
    });

    it("public reverseVoucher still blocks self-reversal (the exception is not the lifecycle path)", async () => {
      const { createVoucherWithEntries, reverseVoucher, getChartOfAccounts } =
        await import("./db");
      const chart = await getChartOfAccounts(userId, projectId);
      const cash = chart.find(a => a.code === "1110")!;
      const revenue = chart.find(a => a.code === "4100")!;
      const voucher = await createVoucherWithEntries(userId, {
        projectId,
        date: new Date("2026-04-04T10:00:00.000Z"),
        narration: "sod contrast",
        status: "posted",
        _internalPostedBy: userId,
        debits: [{ accountId: cash.id, amount: 90 }],
        credits: [{ accountId: revenue.id, amount: 90 }],
      });

      await expect(
        reverseVoucher(userId, projectId, {
          originalVoucherId: voucher.voucherId,
          reason: "self attempt",
          date: new Date("2026-04-05T10:00:00.000Z"),
        })
      ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না");
    });

    it("the exception stays scoped: another actor cannot edit/delete the owner's transaction", async () => {
      const { createTransaction, updateTransaction, deleteTransaction } =
        await import("./db");
      const id = await createTransaction(userId, {
        projectId,
        categoryId,
        type: "expense",
        amount: 60,
        paymentMethod: "cash",
        occurredAt: new Date("2026-04-06T10:00:00.000Z"),
      });

      await expect(
        updateTransaction(otherUserId, id, {
          projectId,
          categoryId,
          type: "expense",
          amount: 70,
          paymentMethod: "cash",
          occurredAt: new Date("2026-04-07T10:00:00.000Z"),
        })
      ).rejects.toThrow("Project not found or access denied");

      await expect(
        deleteTransaction(otherUserId, projectId, id)
      ).rejects.toThrow("Transaction not found or access denied");
    });
  }
);
