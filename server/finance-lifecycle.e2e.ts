/**
 * Live-database E2E for bank reconciliation and fiscal period close (P2-D-1).
 *
 * The unit suites pin these paths against a fake Drizzle client; this suite
 * runs the full machinery against real MySQL, which is the only way to catch
 * what mocks cannot see:
 *   - `recalculateReconciliation` arithmetic over real decimal columns,
 *   - the difference gate that blocks `completeBankReconciliation`,
 *   - `closeFiscalPeriod` counting locks by `monthKey` inside the period's
 *     month range instead of comparing `lockedAt` timestamps (P2-E.1): a month
 *     locked after the period end must count, a foreign month locked during
 *     the period must not.
 *
 * Runner: `pnpm test:e2e:isolated` (fresh `money_tracker_e2e_*` database,
 * schema from scripts/bootstrap-local-e2e-schema.mjs).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  financeChartOfAccounts,
  financePeriodLocks,
  users,
} from "../drizzle/schema";
import { appRouter } from "./routers";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { assignRole, clearRBACCache, initializeRBAC } from "./_core/rbac";
import { ROLE_NAMES } from "../shared/rbac";
import { closeDatabaseConnection, getDb } from "./db";

type E2eUser = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "admin" | "user";
  status: "pending" | "active" | "suspended";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

const OPEN_ID = "e2e-lifecycle-owner";

let owner: E2eUser;

function caller(user: E2eUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
    adminElevation: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

function assertIsolatedDatabase() {
  const databaseName = process.env.ISOLATED_E2E_DATABASE_NAME ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseHost = new URL(databaseUrl).hostname;
  if (
    process.env.ISOLATED_E2E_DATABASE !== "true" ||
    !/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(databaseName) ||
    !databaseUrl.includes(`/${databaseName}`) ||
    !["127.0.0.1", "localhost"].includes(databaseHost)
  ) {
    throw new Error(
      "এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডাটাবেসে চালানো যাবে"
    );
  }
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডাটাবেস সংযোগ পাওয়া যায়নি");

  await db.insert(users).values({
    openId: OPEN_ID,
    name: "E2E Lifecycle Owner",
    email: "lifecycle-owner@e2e.test",
    loginMethod: "e2e",
    role: "user",
    status: "active",
  });
  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.openId, OPEN_ID));
  if (!created) throw new Error("E2E পরিচয় তৈরি করা যায়নি");
  owner = created as E2eUser;

  await seedDefaultRBAC();
  await assignRole(owner.id, ROLE_NAMES.MANAGER, owner.id);
  clearRBACCache();
  await initializeRBAC();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("bank reconciliation against a real database (P2-D-1)", () => {
  it("runs create → add → match → unmatch → complete with the difference gate", async () => {
    const c = caller(owner);
    const projectId = (await c.projects.create({ name: "E2E রিকন" })).id;

    // Bank wallet: canonical CoA 1120 funded with an opening balance of 1000.
    await c.finance.addAccount({
      projectId,
      name: "E2E ব্যাংক",
      type: "bank",
      openingBalance: 1000,
    });
    const overview = await c.finance.overview({ projectId });
    const wallet = overview.accounts.find(item => item.name === "E2E ব্যাংক")!;
    const incomeCategory = overview.categories.find(
      item => item.type === "income"
    )!;

    // Deposit 500 on the bank account (quick-entry auto-posting — the
    // SoD exception documented in docs/W2-QUICK-ENTRY-SOD-EXCEPTION.md).
    await c.finance.addTransaction({
      projectId,
      categoryId: incomeCategory.id,
      accountId: wallet.id,
      type: "income",
      amount: 500,
      paymentMethod: "bank",
      note: "E2E আয়",
      occurredAt: new Date(),
    });

    const db = await getDb();
    if (!db) throw new Error("ডাটাবেস সংযোগ নেই");
    const [bankCoa] = await db
      .select()
      .from(financeChartOfAccounts)
      .where(
        and(
          eq(financeChartOfAccounts.projectId, projectId),
          eq(financeChartOfAccounts.code, "1120")
        )
      )
      .limit(1);
    if (!bankCoa) throw new Error("ক্যাননিক্যাল ব্যাংক হিসাবখাতা পাওয়া যায়নি");

    // Book balance: 1000 opening + 500 deposit.
    expect(Number(bankCoa.currentBalance)).toBe(1500);

    const ledgerEntries = await c.finance.getLedgerEntriesForReconciliation({
      projectId,
      accountId: bankCoa.id,
    });
    const depositEntry = ledgerEntries.find(
      entry => entry.entryType === "debit" && Number(entry.amount) === 500
    );
    expect(depositEntry).toBeDefined();

    // Statement shows 2000 while the book has 1500 → difference 500.
    const rec = await c.finance.createBankReconciliation({
      projectId,
      accountId: bankCoa.id,
      statementDate: new Date(),
      statementBalance: 2000,
      notes: "E2E স্টেটমেন্ট",
    });
    expect(Number(rec.difference)).toBe(500);
    expect(rec.status).toBe("in_progress");

    // An unmatched statement line does not move the difference.
    const itemId = await c.finance.addBankReconciliationItem({
      projectId,
      reconciliationId: rec.id,
      statementRef: "E2E-STMT-001",
      statementDate: new Date(),
      statementAmount: 500,
      statementType: "debit",
    });

    let items = await c.finance.getBankReconciliationItems({
      reconciliationId: rec.id,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.matched).toBe(false);
    let current = await c.finance.getBankReconciliation({
      projectId,
      reconciliationId: rec.id,
    });
    expect(Number(current.difference)).toBe(500);

    // Matching the deposit: adjusted book 1500 + 500 = 2000 → difference 0.
    await c.finance.matchBankReconciliationItem({
      projectId,
      itemId,
      ledgerEntryId: depositEntry!.id,
    });
    current = await c.finance.getBankReconciliation({
      projectId,
      reconciliationId: rec.id,
    });
    expect(Number(current.difference)).toBe(0);

    // Unmatch re-opens the gap → completion must be blocked by the gate.
    await c.finance.unmatchBankReconciliationItem({ projectId, itemId });
    current = await c.finance.getBankReconciliation({
      projectId,
      reconciliationId: rec.id,
    });
    expect(Number(current.difference)).toBe(500);
    await expect(
      c.finance.completeBankReconciliation({
        projectId,
        reconciliationId: rec.id,
      })
    ).rejects.toThrow("ডিফারেন্স");

    // Re-match → difference zero → completion succeeds and stamps the actor.
    await c.finance.matchBankReconciliationItem({
      projectId,
      itemId,
      ledgerEntryId: depositEntry!.id,
    });
    await c.finance.completeBankReconciliation({
      projectId,
      reconciliationId: rec.id,
    });
    current = await c.finance.getBankReconciliation({
      projectId,
      reconciliationId: rec.id,
    });
    expect(current.status).toBe("completed");
    expect(current.reconciledAt).not.toBeNull();
    expect(current.reconciledBy).toBe(owner.id);

    items = await c.finance.getBankReconciliationItems({
      reconciliationId: rec.id,
    });
    expect(items[0]?.matched).toBe(true);

    // Ownership is enforced: another user sees nothing of this project.
    const stranger: E2eUser = { ...owner, id: owner.id + 1_000_000 };
    await expect(
      caller(stranger).finance.getBankReconciliation({
        projectId,
        reconciliationId: rec.id,
      })
    ).rejects.toThrow();
  });
});

describe("fiscal period close against a real database (P2-E.1 / P2-D-1)", () => {
  it("counts locks by monthKey inside the period, ignoring lockedAt timing", async () => {
    const c = caller(owner);
    const projectId = (await c.projects.create({ name: "E2E ফিস্কাল" })).id;

    const { id: periodId } = await c.finance.createFiscalPeriod({
      projectId,
      name: "Jan 2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-31"),
    });

    const db = await getDb();
    if (!db) throw new Error("ডাটাবেস সংযোগ নেই");
    // Deliberately mix lockedAt timing with monthKey membership:
    //  - 2026-01 locked AFTER the period end  → must COUNT (old code missed it)
    //  - 2025-12 locked DURING the period     → must NOT count (old code did)
    //  - 2026-02 locked DURING the period     → must NOT count (old code did)
    await db.insert(financePeriodLocks).values([
      {
        userId: owner.id,
        projectId,
        monthKey: "2026-01",
        lockedAt: new Date("2026-02-10T12:00:00.000Z"),
        lockedBy: owner.id,
        reason: "E2E late lock",
      },
      {
        userId: owner.id,
        projectId,
        monthKey: "2025-12",
        lockedAt: new Date("2026-01-15T12:00:00.000Z"),
        lockedBy: owner.id,
        reason: "E2E foreign month locked during period",
      },
      {
        userId: owner.id,
        projectId,
        monthKey: "2026-02",
        lockedAt: new Date("2026-01-20T12:00:00.000Z"),
        lockedBy: owner.id,
        reason: "E2E next month locked during period",
      },
    ]);

    const result = await c.finance.closeFiscalPeriod({ projectId, periodId });
    // Only 2026-01 belongs to [2026-01, 2026-01] — exactly one lock.
    // The old lockedAt-based filter would have counted two (2025-12, 2026-02).
    expect(result).toEqual({ closed: true, lockedMonthsFound: 1 });

    const periods = await c.finance.listFiscalPeriods({ projectId });
    expect(periods).toHaveLength(1);
    expect(periods[0]?.status).toBe("closed");

    await expect(
      c.finance.closeFiscalPeriod({ projectId, periodId })
    ).rejects.toThrow("already closed");
  });
});
