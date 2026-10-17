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

const scratchDatabase = `money_tracker_mkc_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("voucher maker/checker separation (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;
  let otherUserId = 0;

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
    await upsertUser({ openId: "dbunit:mkc" });
    userId = (await getUserIdByOpenId("dbunit:mkc"))!;
    await upsertUser({ openId: "dbunit:mkc-other" });
    otherUserId = (await getUserIdByOpenId("dbunit:mkc-other"))!;
    await seedDefaultAccountTypes();
    const project = await createProject(userId, "Maker Checker");
    projectId = project.id!;
    await seedDefaultChartOfAccounts(userId, projectId);
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it("creator and submitter cannot approve their own voucher (4-eyes)", async () => {
    const {
      createVoucherWithEntries,
      submitVoucher,
      approveVoucher,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    const voucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-01T10:00:00.000Z"),
      narration: "self approval guard",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 500 }],
      credits: [{ accountId: revenue.id, amount: 500 }],
    });
    await submitVoucher(userId, projectId, voucher.voucherId);
    // The owner is both the creator and the submitter, so the creator
    // guard fires first.
    await expect(
      approveVoucher(userId, projectId, voucher.voucherId, "approve")
    ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না");
  });

  it("creator cannot post their own approved voucher", async () => {
    const {
      createVoucherWithEntries,
      postVoucher,
      getChartOfAccounts,
      getDb,
      databaseRequired,
    } = await import("./db");
    const { financeVouchers } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    const voucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-02T10:00:00.000Z"),
      narration: "self posting guard",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 250 }],
      credits: [{ accountId: revenue.id, amount: 250 }],
    });
    // VoucherInput only permits draft/posted on create, and
    // single-owner projects make the approve step unreachable
    // for a second actor — so the approved status is staged
    // directly at the data layer to exercise the posting
    // guard for the creator.
    const db = databaseRequired(await getDb());
    await db
      .update(financeVouchers)
      .set({ status: "approved" })
      .where(eq(financeVouchers.id, voucher.voucherId));
    await expect(
      postVoucher(userId, projectId, voucher.voucherId)
    ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না");
  });

  it("creator cannot reverse their own posted voucher", async () => {
    const {
      createVoucherWithEntries,
      reverseVoucher,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    // The documented _internalPostedBy bypass stages a posted voucher the
    // same way the reversal flow does.
    const voucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-03T10:00:00.000Z"),
      narration: "self reversal guard",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 100 }],
      credits: [{ accountId: revenue.id, amount: 100 }],
    });
    await expect(
      reverseVoucher(userId, projectId, {
        originalVoucherId: voucher.voucherId,
        reason: "self reversal attempt",
        date: new Date("2026-03-04T10:00:00.000Z"),
      })
    ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না");
  });

  it("return action bypasses the self-check and reopens the voucher as draft", async () => {
    const {
      createVoucherWithEntries,
      submitVoucher,
      approveVoucher,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    const voucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-05T10:00:00.000Z"),
      narration: "return exempt",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 75 }],
      credits: [{ accountId: revenue.id, amount: 75 }],
    });
    await submitVoucher(userId, projectId, voucher.voucherId);
    // The self-check applies only to the "approve" action; "return" is
    // exempt so the maker can pull a submission back to draft.
    await approveVoucher(userId, projectId, voucher.voucherId, "return");
    // submitVoucher only succeeds from draft, so a second submission
    // proves the voucher was reopened.
    await expect(
      submitVoucher(userId, projectId, voucher.voucherId)
    ).resolves.toBeDefined();
  });

  it("non-owner cannot reach the workflow guards (ownership checked first)", async () => {
    const { approveVoucher, postVoucher, submitVoucher } = await import("./db");
    await expect(
      approveVoucher(otherUserId, projectId, 1, "approve")
    ).rejects.toThrow("Project not found or access denied");
    await expect(
      postVoucher(otherUserId, projectId, 1)
    ).rejects.toThrow("Project not found or access denied");
    await expect(
      submitVoucher(otherUserId, projectId, 1)
    ).rejects.toThrow("Project not found or access denied");
  });

  it("state machine rejects invalid transitions before the self-checks", async () => {
    const {
      createVoucherWithEntries,
      submitVoucher,
      approveVoucher,
      postVoucher,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;
    const draft = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-06T10:00:00.000Z"),
      narration: "transition guard",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 25 }],
      credits: [{ accountId: revenue.id, amount: 25 }],
    });
    // draft -> posted is not allowed (postVoucher checks the transition
    // before the self-check).
    await expect(
      postVoucher(userId, projectId, draft.voucherId)
    ).rejects.toThrow("ভাউচার draft থেকে posted এ পরিবর্তন করা যায় না");
    // return on a draft targets draft, which is not a valid transition.
    await expect(
      approveVoucher(userId, projectId, draft.voucherId, "return")
    ).rejects.toThrow("ভাউচার draft থেকে draft এ পরিবর্তন করা যায় না");
    // submitted -> posted is not allowed either.
    await submitVoucher(userId, projectId, draft.voucherId);
    await expect(
      postVoucher(userId, projectId, draft.voucherId)
    ).rejects.toThrow("ভাউচার submitted থেকে posted এ পরিবর্তন করা যায় না");
  });

  it("architectural blocker: single-owner project owner cannot complete M-A-P workflow", async () => {
    const {
      createVoucherWithEntries,
      submitVoucher,
      approveVoucher,
      postVoucher,
      reverseVoucher,
      getChartOfAccounts,
    } = await import("./db");
    const chart = await getChartOfAccounts(userId, projectId);
    const cash = chart.find(a => a.code === "1110")!;
    const revenue = chart.find(a => a.code === "4100")!;

    // 1. Owner creates a voucher (draft)
    const voucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-10T10:00:00.000Z"),
      narration: "workflow blocker test",
      status: "draft",
      debits: [{ accountId: cash.id, amount: 100 }],
      credits: [{ accountId: revenue.id, amount: 100 }],
    });

    // 2. Owner submits the voucher (draft -> submitted)
    await submitVoucher(userId, projectId, voucher.voucherId);

    // 3. Owner attempts to approve their own submission -> BLOCKED
    // (creator check fires first since owner is both creator and submitter)
    await expect(
      approveVoucher(userId, projectId, voucher.voucherId, "approve")
    ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না");

    // 4. Owner attempts to post directly from submitted -> BLOCKED
    // (state machine: submitted -> posted not allowed)
    await expect(
      postVoucher(userId, projectId, voucher.voucherId)
    ).rejects.toThrow("ভাউচার submitted থেকে posted এ পরিবর্তন করা যায় না");

    // 5. Owner attempts to approve via return (return is exempt) -> SUCCEEDS
    // This reopens to draft, proving the workflow is stuck at submitted
    await approveVoucher(userId, projectId, voucher.voucherId, "return");
    await expect(
      submitVoucher(userId, projectId, voucher.voucherId)
    ).resolves.toBeDefined();

    // 6. Owner tries to post directly from submitted -> BLOCKED
    // (state machine: submitted -> posted not allowed)
    await expect(
      postVoucher(userId, projectId, voucher.voucherId)
    ).rejects.toThrow("ভাউচার submitted থেকে posted এ পরিবর্তন করা যায় না");

    // 7. Owner creates a posted voucher directly (bypassing workflow)
    // to test self-reversal guard
    const postedVoucher = await createVoucherWithEntries(userId, {
      projectId,
      date: new Date("2026-03-11T10:00:00.000Z"),
      narration: "posted for reversal test",
      status: "posted",
      _internalPostedBy: userId,
      debits: [{ accountId: cash.id, amount: 50 }],
      credits: [{ accountId: revenue.id, amount: 50 }],
    });

    // 7. Owner attempts to reverse their own posted voucher -> BLOCKED
    await expect(
      reverseVoucher(userId, projectId, {
        originalVoucherId: postedVoucher.voucherId,
        reason: "self reversal attempt",
        date: new Date("2026-03-12T10:00:00.000Z"),
      })
    ).rejects.toThrow("নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না");

    // ARCHITECTURAL NOTE: In single-owner projects, the project owner
    // is the ONLY actor who can act on vouchers (assertOwnedProject).
    // However, all lifecycle operations (approve, post, reverse) have
    // self-checks that block the creator/submitter. Since no second
    // actor exists in a single-owner project, the positive M-A-P path
    // is UNREACHABLE. This is a documented architectural limitation
    // (Maker–Approver–Poster proposal pending separate review).
    // This test exists to prevent accidental weakening of self-checks.
  });
});
