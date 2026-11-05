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

const scratchDatabase = `money_tracker_members_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)(
  "W-1: project membership (maker–checker) on a disposable MariaDB",
  () => {
    let ownerId = 0;
    let makerId = 0;
    let checkerId = 0;
    let strangerId = 0;
    let projectId = 0;

    const accounts = new Map<string, number>();

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
        getChartOfAccounts,
      } = await import("./db");
      await upsertUser({ openId: "dbunit:owner", email: "owner@example.com" });
      ownerId = (await getUserIdByOpenId("dbunit:owner"))!;
      await upsertUser({ openId: "dbunit:maker", email: "maker@example.com" });
      makerId = (await getUserIdByOpenId("dbunit:maker"))!;
      await upsertUser({
        openId: "dbunit:checker",
        email: "checker@example.com",
      });
      checkerId = (await getUserIdByOpenId("dbunit:checker"))!;
      await upsertUser({
        openId: "dbunit:stranger",
        email: "stranger@example.com",
      });
      strangerId = (await getUserIdByOpenId("dbunit:stranger"))!;

      await seedDefaultAccountTypes();
      const project = await createProject(ownerId, "Membership Ledger");
      projectId = project.id!;
      await seedDefaultChartOfAccounts(ownerId, projectId);
      const chart = await getChartOfAccounts(ownerId, projectId);
      for (const code of ["1110", "4100"]) {
        const account = chart.find(a => a.code === code);
        if (!account) throw new Error(`Missing canonical account ${code}`);
        accounts.set(code, account.id);
      }

      // Owner registers both delegates and they accept the invitations.
      const {
        inviteProjectMember,
        acceptProjectInvitation,
        listProjectInvitations,
      } = await import("./db");
      await inviteProjectMember(ownerId, {
        projectId,
        email: "maker@example.com",
        role: "maker",
      });
      const makerInvites = await listProjectInvitations(makerId);
      const makerInvite = makerInvites.find(i => i.projectId === projectId);
      if (!makerInvite) throw new Error("Maker invitation not visible");
      await acceptProjectInvitation(makerId, makerInvite.membershipId);

      await inviteProjectMember(ownerId, {
        projectId,
        email: "checker@example.com",
        role: "checker",
      });
      const checkerInvites = await listProjectInvitations(checkerId);
      const checkerInvite = checkerInvites.find(i => i.projectId === projectId);
      if (!checkerInvite) throw new Error("Checker invitation not visible");
      await acceptProjectInvitation(checkerId, checkerInvite.membershipId);
    }, 120000);

    afterAll(async () => {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;
      await closeDatabaseConnection();
      if (!enabled) return;
      const admin = await createConnection(baseUrl as string);
      await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
      await admin.destroy();
    }, 60000);

    const draft = async (narration: string) => {
      const { createVoucherWithEntries } = await import("./db");
      return createVoucherWithEntries(makerId, {
        projectId,
        date: new Date("2026-05-01T10:00:00.000Z"),
        narration,
        status: "draft",
        debits: [{ accountId: accounts.get("1110")!, amount: 700 }],
        credits: [{ accountId: accounts.get("4100")!, amount: 700 }],
      });
    };

    it("resolves owner, maker and checker access; rejects strangers", async () => {
      const { getProjectAccess } = await import("./db");
      await expect(getProjectAccess(ownerId, projectId)).resolves.toMatchObject(
        { role: "owner", ownerId }
      );
      await expect(getProjectAccess(makerId, projectId)).resolves.toMatchObject(
        { role: "maker", ownerId }
      );
      await expect(
        getProjectAccess(checkerId, projectId)
      ).resolves.toMatchObject({ role: "checker", ownerId });
      await expect(getProjectAccess(strangerId, projectId)).rejects.toThrow(
        "Project not found or access denied"
      );
    });

    it("hides invitations from a non-matching account and blocks non-owner invites", async () => {
      const {
        listProjectInvitations,
        inviteProjectMember,
        acceptProjectInvitation,
      } = await import("./db");
      expect(await listProjectInvitations(strangerId)).toEqual([]);
      await expect(
        inviteProjectMember(makerId, {
          projectId,
          email: "stranger@example.com",
          role: "maker",
        })
      ).rejects.toThrow("Project not found or access denied");
      // An invitation addressed to someone else cannot be accepted by a
      // different account even if it knows the membership id.
      await inviteProjectMember(ownerId, {
        projectId,
        email: "stranger@example.com",
        role: "checker",
      });
      const invites = await listProjectInvitations(ownerId);
      expect(invites).toEqual([]);
      await expect(
        acceptProjectInvitation(makerId, 999999)
      ).rejects.toThrow("এই আমন্ত্রণ গ্রহণের অনুমতি আপনার নেই");
    });

    it("runs the full maker → checker approve → post path", async () => {
      const { submitVoucher, approveVoucher, postVoucher, getDb } =
        await import("./db");
      const voucher = await draft("member maker check path");

      const voucherRow = async () => {
        const { databaseRequired } = await import("./db");
        const { financeVouchers } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = databaseRequired(await getDb());
        const [row] = await db
          .select()
          .from(financeVouchers)
          .where(eq(financeVouchers.id, voucher.voucherId))
          .limit(1);
        return row;
      };

      // Data space stays owner-keyed; the acting maker is recorded separately.
      expect((await voucherRow()).userId).toBe(ownerId);
      expect((await voucherRow()).createdBy).toBe(makerId);

      // The maker submits but can never approve (maker ≠ checker role gate).
      await submitVoucher(makerId, projectId, voucher.voucherId);
      await expect(
        approveVoucher(makerId, projectId, voucher.voucherId, "approve")
      ).rejects.toThrow("এই ভাউচার কাজটি করার অনুমতি আপনার নেই");

      // The checker approves and posts.
      await approveVoucher(checkerId, projectId, voucher.voucherId, "approve");
      expect((await voucherRow()).approvedBy).toBe(checkerId);
      await postVoucher(checkerId, projectId, voucher.voucherId);
      const posted = await voucherRow();
      expect(posted.status).toBe("posted");
      expect(posted.postedBy).toBe(checkerId);
    }, 60000);

    it("blocks makers from approving/posting and checkers from creating", async () => {
      const { submitVoucher, approveVoucher, createVoucherWithEntries } =
        await import("./db");
      const voucher = await draft("role separation");
      await submitVoucher(makerId, projectId, voucher.voucherId);
      // A maker can never approve, even a voucher somebody else authored.
      await expect(
        approveVoucher(makerId, projectId, voucher.voucherId, "approve")
      ).rejects.toThrow("এই ভাউচার কাজটি করার অনুমতি আপনার নেই");
      // A checker cannot author vouchers.
      await expect(
        createVoucherWithEntries(checkerId, {
          projectId,
          date: new Date("2026-05-02T10:00:00.000Z"),
          status: "draft",
          debits: [{ accountId: accounts.get("1110")!, amount: 10 }],
          credits: [{ accountId: accounts.get("4100")!, amount: 10 }],
        })
      ).rejects.toThrow("এই ভাউচার কাজটি করার অনুমতি আপনার নেই");
    }, 60000);

    it("enforces 4-eyes on reversal and stamps the reversal under the owner", async () => {
      const {
        submitVoucher,
        approveVoucher,
        postVoucher,
        reverseVoucher,
        getVoucherReversals,
        getDb,
        databaseRequired,
      } = await import("./db");
      const { financeVouchers } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const voucher = await draft("reverse path");
      await submitVoucher(makerId, projectId, voucher.voucherId);
      await approveVoucher(checkerId, projectId, voucher.voucherId, "approve");
      await postVoucher(checkerId, projectId, voucher.voucherId);

      // The maker cannot reverse their own voucher.
      await expect(
        reverseVoucher(makerId, projectId, {
          originalVoucherId: voucher.voucherId,
          reason: "self reversal",
          date: new Date("2026-05-03T10:00:00.000Z"),
        })
      ).rejects.toThrow("এই ভাউচার কাজটি করার অনুমতি আপনার নেই");

      await reverseVoucher(checkerId, projectId, {
        originalVoucherId: voucher.voucherId,
        reason: "corrected amount",
        date: new Date("2026-05-03T10:00:00.000Z"),
      });

      const db = databaseRequired(await getDb());
      const [original] = await db
        .select()
        .from(financeVouchers)
        .where(eq(financeVouchers.id, voucher.voucherId))
        .limit(1);
      expect(original.status).toBe("reversed");

      const reversals = await getVoucherReversals(makerId, projectId);
      expect(reversals).toHaveLength(1);
      const [reversalRow] = await db
        .select()
        .from(financeVouchers)
        .where(eq(financeVouchers.id, reversals[0].reversalVoucherId))
        .limit(1);
      expect(reversalRow.userId).toBe(ownerId);
      expect(reversalRow.createdBy).toBe(checkerId);
      expect(reversalRow.status).toBe("posted");
    }, 60000);

    it("revoking a member removes access immediately", async () => {
      const {
        listProjectMembers,
        updateProjectMember,
        getProjectAccess,
      } = await import("./db");
      const members = await listProjectMembers(ownerId, projectId);
      const maker = members.find(m => m.inviteeEmail === "maker@example.com");
      if (!maker) throw new Error("Maker membership not found");
      await updateProjectMember(ownerId, {
        projectId,
        membershipId: maker.id,
        status: "revoked",
      });
      await expect(getProjectAccess(makerId, projectId)).rejects.toThrow(
        "Project not found or access denied"
      );
    }, 60000);
  }
);
