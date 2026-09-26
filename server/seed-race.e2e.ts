/**
 * Concurrent seeding must converge instead of raising a duplicate-key error.
 *
 * `finance_account_types.code`, `finance_chart_of_accounts (projectId, code)`
 * and `finance_categories (userId, projectId, name, type)` are all unique, and
 * every one of them is populated by a "check whether it exists, then insert"
 * seed. Two requests that seed at the same time (double-clicking "new project",
 * or a second user creating their first project) both saw an empty table, and
 * the loser surfaced `ER_DUP_ENTRY` to the user as a failed project creation.
 *
 * These tests pin the SQL-level fix: the unique index settles the race.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  financeAccountTypes,
  financeCategories,
  financeChartOfAccounts,
  users,
} from "../drizzle/schema";
import { appRouter } from "./routers";
import { closeDatabaseConnection, getDb } from "./db";
import { and, eq, sql } from "drizzle-orm";
import { assignRole } from "./_core/rbac";
import { clearRBACCache, initializeRBAC, ROLE_NAMES } from "./_core/rbac";
import { seedDefaultRBAC } from "./_core/seed-rbac";

type ContextUser = {
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

const ALPHA = "e2e-seed-race-alpha";
const BETA = "e2e-seed-race-beta";

let db!: NonNullable<Awaited<ReturnType<typeof getDb>>>;
let alpha: ContextUser;
let beta: ContextUser;

function callerFor(user: ContextUser) {
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
      "এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেসে চালানো যাবে"
    );
  }
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const connection = await getDb();
  if (!connection)
    throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");
  db = connection;

  await db.insert(users).values([
    {
      openId: ALPHA,
      name: "Seed Race Alpha",
      loginMethod: "e2e",
      role: "user",
      status: "active",
    },
    {
      openId: BETA,
      name: "Seed Race Beta",
      loginMethod: "e2e",
      role: "user",
      status: "active",
    },
  ]);
  const rows = await db.select().from(users).where(eq(users.openId, ALPHA));
  const betaRows = await db.select().from(users).where(eq(users.openId, BETA));
  alpha = rows[0] as ContextUser;
  beta = betaRows[0] as ContextUser;
  if (!alpha || !beta) throw new Error("পরীক্ষামূলক পরিচয় তৈরি হয়নি");

  await seedDefaultRBAC();
  await assignRole(alpha.id, ROLE_NAMES.MANAGER, alpha.id);
  await assignRole(beta.id, ROLE_NAMES.MANAGER, beta.id);
  clearRBACCache();
  await initializeRBAC();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("canonical seeding is race-safe", () => {
  it("two users creating their first project at the same time both succeed", async () => {
    // Both requests seed the global account types and their own chart of
    // accounts. Before the fix the second insert raised ER_DUP_ENTRY.
    const [first, second] = await Promise.allSettled([
      callerFor(alpha).projects.create({ name: "সমান্তরাল বই এ" }),
      callerFor(beta).projects.create({ name: "সমান্তরাল বই বি" }),
    ]);

    const failures = [first, second].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(
      failures.map(f => (f.reason as Error)?.message ?? String(f.reason))
    ).toEqual([]);

    const created = [first, second].map(
      r => (r as PromiseFulfilledResult<{ id: number }>).value.id
    );
    for (const projectId of created) {
      const accounts = await db
        .select()
        .from(financeChartOfAccounts)
        .where(eq(financeChartOfAccounts.projectId, projectId));
      // A complete canonical chart, no duplicates.
      expect(accounts.length).toBeGreaterThan(10);
      expect(new Set(accounts.map(a => a.code)).size).toBe(accounts.length);
      expect(accounts.find(a => a.code === "3100")).toBeDefined();
    }
  });

  it("seeds the five canonical account types exactly once", async () => {
    const types = await db.select().from(financeAccountTypes);
    const codes = types.map(t => t.code).sort();
    expect(codes).toEqual([
      "ASSET",
      "EQUITY",
      "EXPENSE",
      "LIABILITY",
      "REVENUE",
    ]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("keeps a user-renamed default category instead of overwriting it", async () => {
    const project = (
      await callerFor(alpha).projects.create({ name: "শ্রেণি বই" })
    ).id;

    // A second ensure pass must not resurrect or duplicate the rows.
    const before = await db
      .select()
      .from(financeCategories)
      .where(eq(financeCategories.projectId, project));
    const target = before.find(c => c.type === "expense");
    expect(target).toBeDefined();
    await db
      .update(financeCategories)
      .set({ name: "আমার সম্পাদিত নাম" })
      .where(eq(financeCategories.id, target!.id));

    const after = await db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.projectId, project),
          eq(financeCategories.id, target!.id)
        )
      );
    expect(after[0].name).toBe("আমার সম্পাদিত নাম");

    // Force the ensure path to run again: no duplicate row, no clobber.
    await db
      .insert(financeCategories)
      .ignore()
      .values([
        {
          userId: alpha.id,
          projectId: project,
          name: "আমার সম্পাদিত নাম",
          type: "expense",
        },
      ]);
    const rows = await db
      .select()
      .from(financeCategories)
      .where(eq(financeCategories.projectId, project));
    expect(rows.filter(c => c.id === target!.id)).toHaveLength(1);
    expect(
      rows.filter(c => c.type === "expense" && c.name === "আমার সম্পাদিত নাম")
    ).toHaveLength(1);
  });

  it("re-running the account-type seed refreshes labels without duplicating", async () => {
    await db
      .update(financeAccountTypes)
      .set({ nameBn: "পুরানো নাম" })
      .where(eq(financeAccountTypes.code, "ASSET"));

    await db
      .insert(financeAccountTypes)
      .values([
        {
          code: "ASSET",
          name: "Asset",
          nameBn: "সম্পদ",
          normalBalance: "debit",
          sortOrder: 1,
          isSystem: true,
        },
      ])
      .onDuplicateKeyUpdate({
        set: {
          name: sql`values(\`name\`)`,
          nameBn: sql`values(\`nameBn\`)`,
          normalBalance: sql`values(\`normalBalance\`)`,
          sortOrder: sql`values(\`sortOrder\`)`,
          isSystem: sql`values(\`isSystem\`)`,
        },
      });

    const [asset] = await db
      .select()
      .from(financeAccountTypes)
      .where(eq(financeAccountTypes.code, "ASSET"));
    expect(asset.nameBn).toBe("সম্পদ");
    const all = await db.select().from(financeAccountTypes);
    expect(all.filter(t => t.code === "ASSET")).toHaveLength(1);
  });
});
