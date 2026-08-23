import { and, asc, desc, eq, gte, like, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  financeAccounts,
  financeBills,
  financeBudgets,
  financeCategories,
  financeDues,
  financeDueSettlements,
  financeHouseholdMembers,
  financeHouseholds,
  financeProjects,
  financeRecurringTransactions,
  financeSharedBudgets,
  financeSharedExpenses,
  financeTransactions,
  financeVoucherSettings,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateDueSettlement } from "./dueAccounting";
import {
  calculateBudgetAlerts,
  calculateBudgetEarlyWarnings,
  DEFAULT_CATEGORIES,
} from "./finance.constants";
import { calculateSharedBudgetProgress } from "./householdAccounting";
import { summarizeHouseholdContributorMonthlySpend, summarizeHouseholdContributorSpend } from "./householdContributorAnalysis";

const DEFAULT_PROJECT_NAME = "দৈনিক লেনদেনের খাতা";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Releases the optional mysql pool for disposable test databases and graceful shutdown paths. */
export async function closeDatabaseConnection() {
  const client = (_db as any)?.$client as { end?: () => Promise<void> } | undefined;
  _db = null;
  await client?.end?.();
}

function databaseRequired<T>(db: T | null): T {
  if (!db) throw new Error("Database unavailable");
  return db;
}

function decimal(value: number) {
  return value.toFixed(2);
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function offsetMonthKey(targetMonthKey: string, offset: number) {
  const target = new Date(`${targetMonthKey}-01T12:00:00Z`);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
}

function signedAmount(type: "income" | "expense", amount: string | number) {
  const amountNumber = Number(amount);
  return type === "income" ? amountNumber : -amountNumber;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.openId === ENV.ownerOpenId ? "admin" : user.role ?? "user";
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

async function ensureDefaultProject(userId: number) {
  const db = databaseRequired(await getDb());
  let [project] = await db.select().from(financeProjects).where(and(eq(financeProjects.userId, userId), eq(financeProjects.name, DEFAULT_PROJECT_NAME))).limit(1);
  if (!project) {
    try {
      await db.insert(financeProjects).values({ userId, name: DEFAULT_PROJECT_NAME });
    } catch {
      // A concurrent first-use request may have created the same unique project.
    }
    [project] = await db.select().from(financeProjects).where(and(eq(financeProjects.userId, userId), eq(financeProjects.name, DEFAULT_PROJECT_NAME))).limit(1);
  }
  if (!project) throw new Error("Default project could not be created");
  return project;
}

async function ensureDefaultCategories(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  const existing = await db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId)));
  const existingKeys = new Set(existing.map(category => `${category.type}:${category.name}`));
  const missing = [
    ...DEFAULT_CATEGORIES.income.map(name => ({ userId, projectId, name, type: "income" as const, isDefault: true })),
    ...DEFAULT_CATEGORIES.expense.map(name => ({ userId, projectId, name, type: "expense" as const, isDefault: true })),
  ].filter(category => !existingKeys.has(`${category.type}:${category.name}`));
  if (missing.length) await db.insert(financeCategories).values(missing);
}

async function ensureVoucherSettings(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  await db.insert(financeVoucherSettings).values({ userId, projectId }).onDuplicateKeyUpdate({ set: { projectId } });
}

function formatVoucherNumber(prefix: string, number: number) {
  return `${prefix.trim() || "V"}-${String(number).padStart(6, "0")}`;
}

async function claimNextVoucher(tx: any, userId: number, projectId: number) {
  await tx.insert(financeVoucherSettings).values({ userId, projectId }).onDuplicateKeyUpdate({ set: { projectId } });
  const [settings] = await tx.select().from(financeVoucherSettings).where(and(eq(financeVoucherSettings.userId, userId), eq(financeVoucherSettings.projectId, projectId))).limit(1);
  if (!settings) throw new Error("ভাউচার সেটিংস পাওয়া যায়নি");
  if (settings.nextNumber > settings.endNumber) throw new Error("ভাউচার নম্বরের নির্ধারিত রেঞ্জ শেষ হয়েছে; সেটিংস থেকে রেঞ্জ বাড়ান");
  const result = await tx.update(financeVoucherSettings).set({ nextNumber: settings.nextNumber + 1 }).where(and(eq(financeVoucherSettings.id, settings.id), eq(financeVoucherSettings.nextNumber, settings.nextNumber)));
  if (!result[0].affectedRows) throw new Error("ভাউচার নম্বর এখন ব্যবহৃত হচ্ছে; আবার চেষ্টা করুন");
  return formatVoucherNumber(settings.prefix, settings.nextNumber);
}

export async function getVoucherSettings(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  await ensureVoucherSettings(userId, projectId);
  const db = databaseRequired(await getDb());
  const [settings] = await db.select().from(financeVoucherSettings).where(and(eq(financeVoucherSettings.userId, userId), eq(financeVoucherSettings.projectId, projectId))).limit(1);
  if (!settings) throw new Error("ভাউচার সেটিংস পাওয়া যায়নি");
  return settings;
}

export async function updateVoucherSettings(userId: number, input: { projectId: number; prefix: string; startNumber: number; endNumber: number }) {
  if (input.startNumber < 1 || input.endNumber < input.startNumber) throw new Error("ভাউচার রেঞ্জ সঠিক নয়");
  const current = await getVoucherSettings(userId, input.projectId);
  const nextNumber = Math.max(current.nextNumber, input.startNumber);
  if (nextNumber > input.endNumber + 1) throw new Error("বর্তমান ভাউচার নম্বরের চেয়ে কম রেঞ্জ নির্ধারণ করা যাবে না");
  const db = databaseRequired(await getDb());
  await db.update(financeVoucherSettings).set({ prefix: input.prefix.trim() || "V", startNumber: input.startNumber, endNumber: input.endNumber, nextNumber }).where(eq(financeVoucherSettings.id, current.id));
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "update", entityType: "voucher_settings", entityId: current.id, summary: "Voucher range updated" });
  return getVoucherSettings(userId, input.projectId);
}

export async function listProjects(userId: number) {
  await ensureDefaultProject(userId);
  const db = databaseRequired(await getDb());
  return db.select().from(financeProjects).where(eq(financeProjects.userId, userId)).orderBy(asc(financeProjects.createdAt));
}

export async function assertOwnedProject(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  const [project] = await db.select().from(financeProjects).where(and(eq(financeProjects.id, projectId), eq(financeProjects.userId, userId))).limit(1);
  if (!project) throw new Error("Project not found or access denied");
  return project;
}

export async function createProject(userId: number, name: string) {
  const db = databaseRequired(await getDb());
  const cleanName = name.trim();
  const result = await db.insert(financeProjects).values({ userId, name: cleanName });
  const projectId = Number(result[0].insertId);
  await ensureDefaultCategories(userId, projectId);
  await logAudit({ actorUserId: userId, projectId, action: "create", entityType: "project", entityId: projectId, summary: `Project created: ${cleanName}` });
  return assertOwnedProject(userId, projectId);
}

type HouseholdRole = "owner" | "editor" | "viewer";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getHouseholdAccess(userId: number, householdId: number): Promise<{ role: HouseholdRole; household: typeof financeHouseholds.$inferSelect }> {
  const db = databaseRequired(await getDb());
  const [household] = await db.select().from(financeHouseholds).where(eq(financeHouseholds.id, householdId)).limit(1);
  if (!household) throw new Error("পারিবারিক প্রোফাইল পাওয়া যায়নি");
  if (household.ownerUserId === userId) return { role: "owner", household };

  const [membership] = await db
    .select()
    .from(financeHouseholdMembers)
    .where(and(eq(financeHouseholdMembers.householdId, householdId), eq(financeHouseholdMembers.userId, userId), eq(financeHouseholdMembers.status, "active")))
    .limit(1);
  if (!membership) throw new Error("এই পারিবারিক প্রোফাইলে আপনার অনুমতি নেই");
  return { role: membership.role, household };
}

function requireHouseholdRole(role: HouseholdRole, allowed: HouseholdRole[]) {
  if (!allowed.includes(role)) throw new Error("এই কাজটি করার অনুমতি আপনার নেই");
}

export async function listHouseholds(userId: number) {
  const db = databaseRequired(await getDb());
  const [owned, memberships] = await Promise.all([
    db.select().from(financeHouseholds).where(eq(financeHouseholds.ownerUserId, userId)).orderBy(asc(financeHouseholds.name)),
    db
      .select({ household: financeHouseholds, role: financeHouseholdMembers.role })
      .from(financeHouseholdMembers)
      .innerJoin(financeHouseholds, eq(financeHouseholdMembers.householdId, financeHouseholds.id))
      .where(and(eq(financeHouseholdMembers.userId, userId), eq(financeHouseholdMembers.status, "active")))
      .orderBy(asc(financeHouseholds.name)),
  ]);
  return [
    ...owned.map(household => ({ ...household, role: "owner" as const })),
    ...memberships.map(({ household, role }) => ({ ...household, role })),
  ];
}

export async function listHouseholdInvitations(userId: number) {
  const db = databaseRequired(await getDb());
  const [currentUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!currentUser?.email) return [];
  const email = normalizeEmail(currentUser.email);
  return db
    .select({
      membershipId: financeHouseholdMembers.id,
      householdId: financeHouseholds.id,
      householdName: financeHouseholds.name,
      role: financeHouseholdMembers.role,
      displayName: financeHouseholdMembers.displayName,
      invitedAt: financeHouseholdMembers.createdAt,
    })
    .from(financeHouseholdMembers)
    .innerJoin(financeHouseholds, eq(financeHouseholdMembers.householdId, financeHouseholds.id))
    .where(and(eq(financeHouseholdMembers.inviteeEmail, email), eq(financeHouseholdMembers.status, "pending")))
    .orderBy(desc(financeHouseholdMembers.createdAt));
}

export async function createHousehold(userId: number, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("পারিবারিক প্রোফাইলের নাম দিন");
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeHouseholds).values({ ownerUserId: userId, name: cleanName });
  const householdId = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, action: "create", entityType: "household", entityId: householdId, summary: `Household profile created: ${cleanName}` });
  return getHouseholdAccess(userId, householdId);
}

export async function getHouseholdOverview(userId: number, householdId: number) {
  const db = databaseRequired(await getDb());
  const access = await getHouseholdAccess(userId, householdId);
  const [owner] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, access.household.ownerUserId)).limit(1);
  const memberRows = await db
    .select({
      id: financeHouseholdMembers.id,
      userId: financeHouseholdMembers.userId,
      inviteeEmail: financeHouseholdMembers.inviteeEmail,
      displayName: financeHouseholdMembers.displayName,
      role: financeHouseholdMembers.role,
      status: financeHouseholdMembers.status,
      acceptedAt: financeHouseholdMembers.acceptedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(financeHouseholdMembers)
    .leftJoin(users, eq(financeHouseholdMembers.userId, users.id))
    .where(eq(financeHouseholdMembers.householdId, householdId))
    .orderBy(asc(financeHouseholdMembers.createdAt));
  const visibleMembers = access.role === "owner" ? memberRows : memberRows.filter(member => member.status === "active" || member.userId === userId);
  const currentMonth = monthKey();
  const budgets = await db.select().from(financeSharedBudgets).where(and(eq(financeSharedBudgets.householdId, householdId), eq(financeSharedBudgets.monthKey, currentMonth))).orderBy(asc(financeSharedBudgets.label));
  const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
  const nextMonthStart = new Date(`${offsetMonthKey(currentMonth, 1)}-01T00:00:00.000Z`);
  const activeBudgetIds = new Set(budgets.map(budget => budget.id));
  const expenses = budgets.length
    ? (await db
        .select({
          id: financeSharedExpenses.id,
          householdId: financeSharedExpenses.householdId,
          budgetId: financeSharedExpenses.budgetId,
          contributorUserId: financeSharedExpenses.contributorUserId,
          amount: financeSharedExpenses.amount,
          note: financeSharedExpenses.note,
          occurredAt: financeSharedExpenses.occurredAt,
          createdAt: financeSharedExpenses.createdAt,
          contributorName: users.name,
          contributorEmail: users.email,
        })
        .from(financeSharedExpenses)
        .innerJoin(users, eq(financeSharedExpenses.contributorUserId, users.id))
        .where(and(eq(financeSharedExpenses.householdId, householdId), gte(financeSharedExpenses.occurredAt, monthStart), lt(financeSharedExpenses.occurredAt, nextMonthStart)))
        .orderBy(desc(financeSharedExpenses.occurredAt)))
        .filter(expense => activeBudgetIds.has(expense.budgetId))
    : [];
  const spentByBudget = new Map<number, number>();
  for (const expense of expenses) spentByBudget.set(expense.budgetId, (spentByBudget.get(expense.budgetId) ?? 0) + Number(expense.amount));
  const sharedBudgets = budgets.map(budget => {
    const spent = spentByBudget.get(budget.id) ?? 0;
    const amount = Number(budget.amount);
    return { ...budget, ...calculateSharedBudgetProgress(amount, spent) };
  });
  const visibleContributorIds = new Set([
    access.household.ownerUserId,
    ...visibleMembers.filter(member => member.status === "active" || member.userId === userId).flatMap(member => member.userId === null ? [] : [member.userId]),
  ]);
  const contributorSpend = summarizeHouseholdContributorSpend(expenses.map(expense => ({
    contributorUserId: access.role === "owner" || visibleContributorIds.has(expense.contributorUserId) ? expense.contributorUserId : 0,
    contributorName: access.role === "owner" || visibleContributorIds.has(expense.contributorUserId) ? (expense.contributorName || expense.contributorEmail || "সদস্য") : "সাবেক সদস্য",
    amount: Number(expense.amount),
  })));
  const comparisonMonthKeys = Array.from({ length: 6 }, (_, index) => offsetMonthKey(currentMonth, index - 5));
  const comparisonStart = new Date(`${comparisonMonthKeys[0]}-01T00:00:00.000Z`);
  const comparisonEnd = new Date(`${offsetMonthKey(currentMonth, 1)}-01T00:00:00.000Z`);
  const comparisonBudgets = await db
    .select({ id: financeSharedBudgets.id, monthKey: financeSharedBudgets.monthKey })
    .from(financeSharedBudgets)
    .where(and(eq(financeSharedBudgets.householdId, householdId), gte(financeSharedBudgets.monthKey, comparisonMonthKeys[0]), lte(financeSharedBudgets.monthKey, currentMonth)));
  const budgetMonthById = new Map(comparisonBudgets.map(budget => [budget.id, budget.monthKey]));
  const comparisonExpenses = comparisonBudgets.length
    ? (await db
        .select({
          budgetId: financeSharedExpenses.budgetId,
          contributorUserId: financeSharedExpenses.contributorUserId,
          amount: financeSharedExpenses.amount,
          occurredAt: financeSharedExpenses.occurredAt,
          contributorName: users.name,
          contributorEmail: users.email,
        })
        .from(financeSharedExpenses)
        .innerJoin(users, eq(financeSharedExpenses.contributorUserId, users.id))
        .where(and(eq(financeSharedExpenses.householdId, householdId), gte(financeSharedExpenses.occurredAt, comparisonStart), lt(financeSharedExpenses.occurredAt, comparisonEnd))))
        .filter(expense => budgetMonthById.get(expense.budgetId) === monthKey(expense.occurredAt))
    : [];
  const monthlyContributorSpend = summarizeHouseholdContributorMonthlySpend(comparisonExpenses.map(expense => ({
    monthKey: monthKey(expense.occurredAt),
    contributorUserId: access.role === "owner" || visibleContributorIds.has(expense.contributorUserId) ? expense.contributorUserId : 0,
    contributorName: access.role === "owner" || visibleContributorIds.has(expense.contributorUserId) ? (expense.contributorName || expense.contributorEmail || "সদস্য") : "সাবেক সদস্য",
    amount: Number(expense.amount),
  })), comparisonMonthKeys);
  return {
    household: access.household,
    currentRole: access.role,
    owner: owner ? { ...owner, role: "owner" as const, status: "active" as const } : null,
    members: visibleMembers,
    sharedBudgets,
    contributorSpend,
    monthlyContributorSpend,
    recentExpenses: expenses.slice(0, 20),
  };
}

export async function inviteHouseholdMember(userId: number, input: { householdId: number; email: string; displayName?: string; role: "editor" | "viewer" }) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("সদস্যের ইমেইল দিন");
  const db = databaseRequired(await getDb());
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (owner?.email && normalizeEmail(owner.email) === email) throw new Error("নিজেকে সদস্য হিসেবে আমন্ত্রণ দেওয়া যাবে না");
  const [existing] = await db.select().from(financeHouseholdMembers).where(and(eq(financeHouseholdMembers.householdId, input.householdId), eq(financeHouseholdMembers.inviteeEmail, email))).limit(1);
  if (existing?.status === "active") throw new Error("এই সদস্য ইতিমধ্যে যুক্ত আছেন");
  const [registeredUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const values = { householdId: input.householdId, inviteeEmail: email, displayName: input.displayName?.trim() || null, role: input.role, status: "pending" as const, invitedByUserId: userId, userId: registeredUser?.id ?? null, acceptedAt: null };
  if (existing) {
    await db.update(financeHouseholdMembers).set(values).where(eq(financeHouseholdMembers.id, existing.id));
    await logAudit({ actorUserId: userId, action: "update", entityType: "household_member", entityId: existing.id, summary: "Household invitation renewed" });
    return existing.id;
  }
  const result = await db.insert(financeHouseholdMembers).values(values);
  const membershipId = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, action: "create", entityType: "household_member", entityId: membershipId, summary: "Household invitation created" });
  return membershipId;
}

export async function acceptHouseholdInvitation(userId: number, membershipId: number) {
  const db = databaseRequired(await getDb());
  const [currentUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const [membership] = await db.select().from(financeHouseholdMembers).where(eq(financeHouseholdMembers.id, membershipId)).limit(1);
  if (!membership || membership.status !== "pending" || !currentUser?.email || normalizeEmail(currentUser.email) !== normalizeEmail(membership.inviteeEmail)) {
    throw new Error("এই আমন্ত্রণ গ্রহণের অনুমতি আপনার নেই");
  }
  await db.update(financeHouseholdMembers).set({ userId, status: "active", acceptedAt: new Date() }).where(eq(financeHouseholdMembers.id, membershipId));
  await logAudit({ actorUserId: userId, action: "update", entityType: "household_member", entityId: membershipId, summary: "Household invitation accepted" });
  return getHouseholdOverview(userId, membership.householdId);
}

export async function updateHouseholdMember(userId: number, input: { householdId: number; membershipId: number; role?: "editor" | "viewer"; status?: "revoked" }) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const db = databaseRequired(await getDb());
  const [membership] = await db.select().from(financeHouseholdMembers).where(and(eq(financeHouseholdMembers.id, input.membershipId), eq(financeHouseholdMembers.householdId, input.householdId))).limit(1);
  if (!membership) throw new Error("সদস্য পাওয়া যায়নি");
  await db.update(financeHouseholdMembers).set({ ...(input.role ? { role: input.role } : {}), ...(input.status ? { status: input.status } : {}) }).where(eq(financeHouseholdMembers.id, membership.id));
  await logAudit({ actorUserId: userId, action: "update", entityType: "household_member", entityId: membership.id, summary: input.status === "revoked" ? "Household member revoked" : "Household member role updated" });
  return getHouseholdOverview(userId, input.householdId);
}

export async function saveSharedBudget(userId: number, input: { householdId: number; label: string; monthKey: string; amount: number }) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const label = input.label.trim();
  if (!label || !/^\d{4}-\d{2}$/.test(input.monthKey) || input.amount <= 0) throw new Error("শেয়ার করা বাজেটের তথ্য সঠিক নয়");
  const db = databaseRequired(await getDb());
  const [existing] = await db.select().from(financeSharedBudgets).where(and(eq(financeSharedBudgets.householdId, input.householdId), eq(financeSharedBudgets.label, label), eq(financeSharedBudgets.monthKey, input.monthKey))).limit(1);
  if (existing) {
    await db.update(financeSharedBudgets).set({ amount: decimal(input.amount), createdByUserId: userId }).where(eq(financeSharedBudgets.id, existing.id));
    await logAudit({ actorUserId: userId, action: "update", entityType: "shared_budget", entityId: existing.id, summary: `Shared budget updated: ${label}` });
    return existing.id;
  }
  const result = await db.insert(financeSharedBudgets).values({ householdId: input.householdId, label, monthKey: input.monthKey, amount: decimal(input.amount), createdByUserId: userId });
  const budgetId = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, action: "create", entityType: "shared_budget", entityId: budgetId, summary: `Shared budget created: ${label}` });
  return budgetId;
}

export async function addSharedExpense(userId: number, input: { householdId: number; budgetId: number; amount: number; note?: string; occurredAt: Date }) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner", "editor"]);
  if (input.amount <= 0) throw new Error("খরচের পরিমাণ শূন্যের বেশি হতে হবে");
  const db = databaseRequired(await getDb());
  const [budget] = await db.select().from(financeSharedBudgets).where(and(eq(financeSharedBudgets.id, input.budgetId), eq(financeSharedBudgets.householdId, input.householdId))).limit(1);
  if (!budget) throw new Error("শেয়ার করা বাজেট পাওয়া যায়নি");
  const result = await db.insert(financeSharedExpenses).values({ householdId: input.householdId, budgetId: input.budgetId, contributorUserId: userId, amount: decimal(input.amount), note: input.note?.trim() || null, occurredAt: input.occurredAt });
  const expenseId = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, action: "create", entityType: "shared_expense", entityId: expenseId, summary: "Shared household expense added" });
  return expenseId;
}

async function assertOwnedCategory(userId: number, projectId: number, categoryId: number, type?: "income" | "expense") {
  const db = databaseRequired(await getDb());
  const conditions = [eq(financeCategories.id, categoryId), eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId)];
  if (type) conditions.push(eq(financeCategories.type, type));
  const [category] = await db.select().from(financeCategories).where(and(...conditions)).limit(1);
  if (!category) throw new Error("Category not found or access denied");
  return category;
}

async function assertOwnedAccount(userId: number, projectId: number, accountId: number) {
  const db = databaseRequired(await getDb());
  const [account] = await db.select().from(financeAccounts).where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId))).limit(1);
  if (!account) throw new Error("Account not found or access denied");
  return account;
}

async function assertOwnedDue(userId: number, projectId: number, dueId: number) {
  const db = databaseRequired(await getDb());
  const [due] = await db.select().from(financeDues).where(and(eq(financeDues.id, dueId), eq(financeDues.userId, userId), eq(financeDues.projectId, projectId))).limit(1);
  if (!due) throw new Error("দেনা বা পাওনার হিসাবটি পাওয়া যায়নি");
  return due;
}

async function adjustAccountBalance(userId: number, projectId: number, accountId: number | null, delta: number) {
  if (!accountId || delta === 0) return;
  const db = databaseRequired(await getDb());
  await assertOwnedAccount(userId, projectId, accountId);
  await db.update(financeAccounts).set({ currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(delta)}` }).where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId)));
}

export async function logAudit(input: {
  actorUserId: number;
  projectId?: number | null;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId?: number | null;
  summary: string;
}) {
  const db = databaseRequired(await getDb());
  await db.insert(auditLogs).values({ ...input, projectId: input.projectId ?? null, entityId: input.entityId ?? null });
}

export async function getOverview(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const scope = and(eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId));
  const [accounts, categories, transactions, budgets, bills, dues, dueSettlements, voucherSettings] = await Promise.all([
    db.select().from(financeAccounts).where(scope).orderBy(asc(financeAccounts.createdAt)),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId))).orderBy(asc(financeCategories.type), asc(financeCategories.name)),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))).orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id)),
    db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.projectId, projectId), eq(financeBudgets.monthKey, monthKey()))),
    db.select().from(financeBills).where(and(eq(financeBills.userId, userId), eq(financeBills.projectId, projectId))).orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt)),
    db.select().from(financeDues).where(and(eq(financeDues.userId, userId), eq(financeDues.projectId, projectId))).orderBy(desc(financeDues.openedAt), desc(financeDues.id)),
    db.select().from(financeDueSettlements).where(and(eq(financeDueSettlements.userId, userId), eq(financeDueSettlements.projectId, projectId))).orderBy(desc(financeDueSettlements.occurredAt), desc(financeDueSettlements.id)),
    getVoucherSettings(userId, projectId),
  ]);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const totalIncome = transactions.filter(row => row.type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = transactions.filter(row => row.type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const budgetProgress = budgets.map(budget => {
    const category = categories.find(item => item.id === budget.categoryId);
    const spent = transactions.filter(row => row.categoryId === budget.categoryId && row.type === "expense" && row.occurredAt.toISOString().slice(0, 7) === budget.monthKey).reduce((sum, row) => sum + Number(row.amount), 0);
    return { ...budget, categoryName: category?.name ?? "Unknown", spent };
  });
  const budgetCandidates = budgetProgress.map(budget => ({
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    budgetAmount: Number(budget.amount),
    spent: budget.spent,
  }));
  const budgetAlerts = calculateBudgetAlerts(budgetCandidates);
  const budgetEarlyWarnings = calculateBudgetEarlyWarnings(budgetCandidates);
  const trend = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (5 - offset), 1));
    const key = date.toISOString().slice(0, 7);
    return {
      monthKey: key,
      income: transactions.filter(row => row.type === "income" && row.occurredAt.toISOString().slice(0, 7) === key).reduce((sum, row) => sum + Number(row.amount), 0),
      expense: transactions.filter(row => row.type === "expense" && row.occurredAt.toISOString().slice(0, 7) === key).reduce((sum, row) => sum + Number(row.amount), 0),
    };
  });
  const displayTransactions = transactions.map(transaction => ({
    ...transaction,
    categoryName: categories.find(category => category.id === transaction.categoryId)?.name ?? "Unknown",
    accountName: transaction.accountId ? accounts.find(account => account.id === transaction.accountId)?.name ?? null : null,
  }));
  const displayDues = dues.map(due => ({ ...due, settlements: dueSettlements.filter(settlement => settlement.dueId === due.id).map(settlement => ({ ...settlement, accountName: settlement.accountId ? accounts.find(account => account.id === settlement.accountId)?.name ?? null : null })) }));
  const totalDebt = dues.filter(due => due.type === "debt").reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalReceivable = dues.filter(due => due.type === "receivable").reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  return { accounts, categories, transactions: displayTransactions, budgets: budgetProgress, budgetAlerts, budgetEarlyWarnings, bills, dues: displayDues, voucherSettings, trend, monthKey: monthKey(), totals: { totalBalance, totalIncome, totalExpense, totalDebt, totalReceivable, netAmount: totalIncome - totalExpense } };
}

export async function getBudgetPlan(userId: number, projectId: number, targetMonthKey: string) {
  await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const previousMonthKey = offsetMonthKey(targetMonthKey, -1);
  const [categories, budgets, transactions] = await Promise.all([
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId), eq(financeCategories.type, "expense"))).orderBy(asc(financeCategories.name)),
    db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.projectId, projectId), or(eq(financeBudgets.monthKey, targetMonthKey), eq(financeBudgets.monthKey, previousMonthKey)))),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId), eq(financeTransactions.type, "expense"))),
  ]);
  const plans = categories.map(category => {
    const currentBudget = budgets.find(budget => budget.categoryId === category.id && budget.monthKey === targetMonthKey);
    const previousBudget = budgets.find(budget => budget.categoryId === category.id && budget.monthKey === previousMonthKey);
    const previousSpent = transactions
      .filter(transaction => transaction.categoryId === category.id && monthKey(transaction.occurredAt) === previousMonthKey)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const suggestedAmount = Number(previousBudget?.amount ?? previousSpent);
    return {
      categoryId: category.id,
      categoryName: category.name,
      currentBudget: currentBudget ? Number(currentBudget.amount) : null,
      previousBudget: previousBudget ? Number(previousBudget.amount) : null,
      previousSpent,
      suggestedAmount,
    };
  });
  return { targetMonthKey, previousMonthKey, plans };
}

export async function getFinanceAnalytics(userId: number, projectId: number, months = 6) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [transactions, budgets] = await Promise.all([
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))),
    db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.projectId, projectId))),
  ]);
  const currentMonthKey = monthKey();
  const data = Array.from({ length: months }, (_, offset) => {
    const key = offsetMonthKey(currentMonthKey, -(months - 1 - offset));
    const income = transactions.filter(transaction => transaction.type === "income" && monthKey(transaction.occurredAt) === key).reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const expense = transactions.filter(transaction => transaction.type === "expense" && monthKey(transaction.occurredAt) === key).reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const budgeted = budgets.filter(budget => budget.monthKey === key).reduce((sum, budget) => sum + Number(budget.amount), 0);
    return {
      monthKey: key,
      income,
      expense,
      savings: income - expense,
      budgeted,
      budgetUsagePercentage: budgeted > 0 ? Math.round((expense / budgeted) * 100) : null,
    };
  });
  return { data };
}

export async function searchTransactions(userId: number, input: {
  projectId: number;
  query?: string;
  categoryId?: number;
  type?: "income" | "expense";
  from?: Date;
  to?: Date;
  minAmount?: number;
  maxAmount?: number;
  limit: number;
}) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const conditions = [eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, input.projectId)];
  if (input.categoryId) conditions.push(eq(financeTransactions.categoryId, input.categoryId));
  if (input.type) conditions.push(eq(financeTransactions.type, input.type));
  if (input.from) conditions.push(gte(financeTransactions.occurredAt, input.from));
  if (input.to) conditions.push(lte(financeTransactions.occurredAt, input.to));
  if (input.minAmount !== undefined) conditions.push(gte(financeTransactions.amount, decimal(input.minAmount)));
  if (input.maxAmount !== undefined) conditions.push(lte(financeTransactions.amount, decimal(input.maxAmount)));
  const query = input.query?.trim();
  if (query) {
    const term = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(like(financeTransactions.note, term), like(financeTransactions.voucherNo, term))!);
  }
  const [transactions, categories, accounts] = await Promise.all([
    db.select().from(financeTransactions).where(and(...conditions)).orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id)).limit(input.limit),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, input.projectId))),
    db.select().from(financeAccounts).where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, input.projectId))),
  ]);
  return transactions.map(transaction => ({
    ...transaction,
    categoryName: categories.find(category => category.id === transaction.categoryId)?.name ?? "অনির্ধারিত",
    accountName: transaction.accountId ? accounts.find(account => account.id === transaction.accountId)?.name ?? null : null,
  }));
}

export async function getMonthlyReport(userId: number, projectId: number, targetMonthKey: string) {
  const project = await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const [accounts, categories, transactions, dues] = await Promise.all([
    db.select().from(financeAccounts).where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId))).orderBy(asc(financeAccounts.createdAt)),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId))).orderBy(asc(financeCategories.type), asc(financeCategories.name)),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))).orderBy(asc(financeTransactions.occurredAt), asc(financeTransactions.id)),
    db.select().from(financeDues).where(and(eq(financeDues.userId, userId), eq(financeDues.projectId, projectId))).orderBy(asc(financeDues.openedAt), asc(financeDues.id)),
  ]);
  const isInSelectedMonth = (value: Date | string) => new Date(value).toISOString().slice(0, 7) === targetMonthKey;
  const targetMonth = new Date(`${targetMonthKey}-01T12:00:00Z`);
  const previousMonthKey = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const isInPreviousMonth = (value: Date | string) => new Date(value).toISOString().slice(0, 7) === previousMonthKey;
  const monthTransactions = transactions.filter(transaction => isInSelectedMonth(transaction.occurredAt));
  const totalIncome = monthTransactions.filter(transaction => transaction.type === "income").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const totalExpense = monthTransactions.filter(transaction => transaction.type === "expense").reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const categoryTotals = categories.map(category => ({
    name: category.name,
    type: category.type,
    total: monthTransactions.filter(transaction => transaction.categoryId === category.id).reduce((sum, transaction) => sum + Number(transaction.amount), 0),
  })).filter(category => category.total > 0);
  const totalDebt = dues.filter(due => due.type === "debt").reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalReceivable = dues.filter(due => due.type === "receivable").reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalAccountBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const previousExpenseCategoryTotals = categories
    .filter(category => category.type === "expense")
    .map(category => ({
      name: category.name,
      total: transactions
        .filter(transaction => transaction.type === "expense" && transaction.categoryId === category.id && isInPreviousMonth(transaction.occurredAt))
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
    }));
  const transactionDetails = monthTransactions.map(transaction => ({
    occurredAt: transaction.occurredAt,
    voucherNo: transaction.voucherNo ?? "—",
    type: transaction.type,
    categoryName: categories.find(category => category.id === transaction.categoryId)?.name ?? "অনির্ধারিত",
    description: transaction.note ?? "—",
    amount: Number(transaction.amount),
  }));
  const dueDetails = dues.map(due => ({
    type: due.type,
    counterparty: due.counterparty,
    voucherNo: due.voucherNo ?? "—",
    openedAt: due.openedAt,
    description: due.note ?? "—",
    originalAmount: Number(due.originalAmount),
    outstandingAmount: Number(due.outstandingAmount),
  }));
  return {
    projectName: project.name,
    monthKey: targetMonthKey,
    totalIncome,
    totalExpense,
    netAmount: totalIncome - totalExpense,
    categoryTotals,
    totalDebt,
    totalReceivable,
    transactionCount: monthTransactions.length,
    transactionDetails,
    previousMonthKey,
    previousExpenseCategoryTotals,
    profitAndLoss: {
      income: totalIncome,
      expense: totalExpense,
      profitOrLoss: totalIncome - totalExpense,
    },
    financialPosition: {
      accountBalance: totalAccountBalance,
      receivables: totalReceivable,
      assets: totalAccountBalance + totalReceivable,
      debts: totalDebt,
      netFinancialPosition: totalAccountBalance + totalReceivable - totalDebt,
    },
    accountDetails: accounts.map(account => ({
      name: account.name,
      type: account.type,
      currentBalance: Number(account.currentBalance),
    })),
    dueDetails,
  };
}

export async function createDue(userId: number, input: { projectId: number; type: "debt" | "receivable"; counterparty: string; amount: number; note?: string; openedAt: Date; dueAt?: Date }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const id = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const result = await tx.insert(financeDues).values({ userId, projectId: input.projectId, type: input.type, counterparty: input.counterparty.trim(), originalAmount: decimal(input.amount), outstandingAmount: decimal(input.amount), voucherNo, note: input.note?.trim() || null, openedAt: input.openedAt, dueAt: input.dueAt ?? null });
    return Number(result[0].insertId);
  });
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: input.type, entityId: id, summary: `${input.type === "debt" ? "Debt" : "Receivable"} added: ${input.counterparty.trim()}` });
  return assertOwnedDue(userId, input.projectId, id);
}

export async function settleDue(userId: number, input: { projectId: number; dueId: number; accountId?: number; amount: number; note?: string; occurredAt: Date }) {
  const due = await assertOwnedDue(userId, input.projectId, input.dueId);
  let effect: ReturnType<typeof calculateDueSettlement>;
  try {
    effect = calculateDueSettlement(due.type, Number(due.outstandingAmount), input.amount);
  } catch {
    throw new Error("পরিশোধ বা আদায়ের পরিমাণ বকেয়া টাকার চেয়ে বেশি হতে পারে না");
  }
  if (input.accountId) await assertOwnedAccount(userId, input.projectId, input.accountId);
  const db = databaseRequired(await getDb());
  await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const updateResult = await tx.update(financeDues).set({ outstandingAmount: sql`${financeDues.outstandingAmount} - ${decimal(input.amount)}` }).where(and(eq(financeDues.id, input.dueId), eq(financeDues.userId, userId), eq(financeDues.projectId, input.projectId), gte(financeDues.outstandingAmount, decimal(input.amount))));
    if (!updateResult[0].affectedRows) throw new Error("বকেয়া পরিমাণ পরিবর্তিত হয়েছে; আবার চেষ্টা করুন");
    const settlementResult = await tx.insert(financeDueSettlements).values({ userId, projectId: input.projectId, dueId: input.dueId, accountId: input.accountId ?? null, amount: decimal(input.amount), voucherNo, note: input.note?.trim() || null, occurredAt: input.occurredAt });
    if (input.accountId) {
      await tx.update(financeAccounts).set({ currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(effect.accountBalanceDelta)}` }).where(and(eq(financeAccounts.id, input.accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, input.projectId)));
    }
    const settlementId = Number(settlementResult[0].insertId);
    await tx.insert(auditLogs).values({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: due.type === "debt" ? "debt_settlement" : "receivable_collection", entityId: settlementId, summary: `${due.type === "debt" ? "Debt payment" : "Receivable collection"}: ${due.counterparty}` });
  });
}

export async function createAccount(userId: number, input: { projectId: number; name: string; type: "cash" | "bank" | "mobile"; openingBalance: number }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeAccounts).values({ userId, projectId: input.projectId, name: input.name.trim(), type: input.type, openingBalance: decimal(input.openingBalance), currentBalance: decimal(input.openingBalance) });
  const id = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: "account", entityId: id, summary: `Account created: ${input.name.trim()}` });
}

export async function updateAccount(userId: number, id: number, input: { projectId: number; name: string; type: "cash" | "bank" | "mobile"; openingBalance: number }) {
  const db = databaseRequired(await getDb());
  const existing = await assertOwnedAccount(userId, input.projectId, id);
  const openingDifference = input.openingBalance - Number(existing.openingBalance);
  await db.update(financeAccounts).set({ name: input.name.trim(), type: input.type, openingBalance: decimal(input.openingBalance), currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(openingDifference)}` }).where(and(eq(financeAccounts.id, id), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, input.projectId)));
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "update", entityType: "account", entityId: id, summary: `Account updated: ${input.name.trim()}` });
}

export async function deleteAccount(userId: number, projectId: number, id: number) {
  const db = databaseRequired(await getDb());
  await assertOwnedAccount(userId, projectId, id);
  const [transaction] = await db.select({ id: financeTransactions.id }).from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId), eq(financeTransactions.accountId, id))).limit(1);
  if (transaction) throw new Error("লেনদেন থাকা অ্যাকাউন্ট মুছতে আগে ওই লেনদেনগুলো সম্পাদনা বা মুছুন");
  await db.delete(financeAccounts).where(and(eq(financeAccounts.id, id), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId)));
  await logAudit({ actorUserId: userId, projectId, action: "delete", entityType: "account", entityId: id, summary: "Account deleted" });
}

export async function createTransaction(userId: number, input: { projectId: number; categoryId: number; accountId?: number; type: "income" | "expense"; amount: number; paymentMethod: string; note?: string; occurredAt: Date }) {
  await assertOwnedProject(userId, input.projectId);
  await assertOwnedCategory(userId, input.projectId, input.categoryId, input.type);
  if (input.accountId) await assertOwnedAccount(userId, input.projectId, input.accountId);
  const db = databaseRequired(await getDb());
  const id = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const result = await tx.insert(financeTransactions).values({ userId, projectId: input.projectId, categoryId: input.categoryId, accountId: input.accountId ?? null, type: input.type, amount: decimal(input.amount), voucherNo, paymentMethod: input.paymentMethod.trim(), note: input.note?.trim() || null, occurredAt: input.occurredAt });
    return Number(result[0].insertId);
  });
  await adjustAccountBalance(userId, input.projectId, input.accountId ?? null, signedAmount(input.type, input.amount));
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: "transaction", entityId: id, summary: `${input.type === "income" ? "Income" : "Expense"} transaction created` });
}

export async function updateTransaction(userId: number, id: number, input: { projectId: number; categoryId: number; accountId?: number; type: "income" | "expense"; amount: number; paymentMethod: string; note?: string; occurredAt: Date }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const [existing] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, input.projectId))).limit(1);
  if (!existing) throw new Error("Transaction not found or access denied");
  await assertOwnedCategory(userId, input.projectId, input.categoryId, input.type);
  if (input.accountId) await assertOwnedAccount(userId, input.projectId, input.accountId);
  await adjustAccountBalance(userId, input.projectId, existing.accountId, -signedAmount(existing.type, existing.amount));
  await db.update(financeTransactions).set({ categoryId: input.categoryId, accountId: input.accountId ?? null, type: input.type, amount: decimal(input.amount), paymentMethod: input.paymentMethod.trim(), note: input.note?.trim() || null, occurredAt: input.occurredAt }).where(eq(financeTransactions.id, id));
  await adjustAccountBalance(userId, input.projectId, input.accountId ?? null, signedAmount(input.type, input.amount));
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "update", entityType: "transaction", entityId: id, summary: "Transaction updated" });
}

export async function deleteTransaction(userId: number, projectId: number, id: number) {
  const db = databaseRequired(await getDb());
  const [transaction] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))).limit(1);
  if (!transaction) throw new Error("Transaction not found or access denied");
  await adjustAccountBalance(userId, projectId, transaction.accountId, -signedAmount(transaction.type, transaction.amount));
  await db.delete(financeTransactions).where(eq(financeTransactions.id, id));
  await logAudit({ actorUserId: userId, projectId, action: "delete", entityType: "transaction", entityId: id, summary: "Transaction deleted" });
}

export async function upsertBudget(userId: number, input: { projectId: number; categoryId: number; monthKey: string; amount: number }) {
  await assertOwnedCategory(userId, input.projectId, input.categoryId, "expense");
  const db = databaseRequired(await getDb());
  await db.insert(financeBudgets).values({ userId, projectId: input.projectId, categoryId: input.categoryId, monthKey: input.monthKey, amount: decimal(input.amount) }).onDuplicateKeyUpdate({ set: { amount: decimal(input.amount) } });
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "update", entityType: "budget", summary: "Monthly budget saved" });
}

export async function createBill(userId: number, input: { projectId: number; title: string; amount: number; dueAt: Date; reminderDaysBefore?: number }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeBills).values({ userId, projectId: input.projectId, title: input.title.trim(), amount: decimal(input.amount), dueAt: input.dueAt, reminderDaysBefore: input.reminderDaysBefore ?? 3 });
  const id = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: "bill", entityId: id, summary: "Bill reminder created" });
}

export async function updateBill(userId: number, projectId: number, id: number, input: { title: string; amount: number; dueAt: Date; isPaid: boolean; reminderDaysBefore?: number }) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeBills).set({ title: input.title.trim(), amount: decimal(input.amount), dueAt: input.dueAt, isPaid: input.isPaid, ...(input.reminderDaysBefore !== undefined ? { reminderDaysBefore: input.reminderDaysBefore } : {}) }).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
  if (result[0].affectedRows === 0) throw new Error("Bill not found or access denied");
  await logAudit({ actorUserId: userId, projectId, action: "update", entityType: "bill", entityId: id, summary: "Bill reminder updated" });
}

export async function setBillPaid(userId: number, projectId: number, id: number, isPaid: boolean) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeBills).set({ isPaid }).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
  if (result[0].affectedRows === 0) throw new Error("Bill not found or access denied");
  await logAudit({ actorUserId: userId, projectId, action: "update", entityType: "bill", entityId: id, summary: `Bill marked ${isPaid ? "paid" : "unpaid"}` });
}

export async function deleteBill(userId: number, projectId: number, id: number) {
  const db = databaseRequired(await getDb());
  const result = await db.delete(financeBills).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
  if (result[0].affectedRows === 0) throw new Error("Bill not found or access denied");
  await logAudit({ actorUserId: userId, projectId, action: "delete", entityType: "bill", entityId: id, summary: "Bill reminder deleted" });
}

export async function getAutomationOverview(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [recurring, bills, dues, accounts, categories] = await Promise.all([
    db.select().from(financeRecurringTransactions).where(and(eq(financeRecurringTransactions.userId, userId), eq(financeRecurringTransactions.projectId, projectId))).orderBy(asc(financeRecurringTransactions.nextRunAt)),
    db.select().from(financeBills).where(and(eq(financeBills.userId, userId), eq(financeBills.projectId, projectId))).orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt)),
    db.select().from(financeDues).where(and(eq(financeDues.userId, userId), eq(financeDues.projectId, projectId))).orderBy(asc(financeDues.dueAt), asc(financeDues.openedAt)),
    db.select().from(financeAccounts).where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId))),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId))),
  ]);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  return {
    recurring: recurring.map(row => ({ ...row, amount: Number(row.amount), accountName: row.accountId ? accounts.find(account => account.id === row.accountId)?.name ?? null : null, categoryName: categories.find(category => category.id === row.categoryId)?.name ?? "অজানা ক্যাটাগরি" })),
    bills: bills.map(row => ({ ...row, amount: Number(row.amount), reminderDueAt: new Date(row.dueAt.getTime() - row.reminderDaysBefore * 86_400_000) })),
    ageing: dues.filter(due => Number(due.outstandingAmount) > 0).map(due => {
      const dueAt = due.dueAt ? new Date(due.dueAt) : null;
      const daysOverdue = dueAt ? Math.max(0, Math.floor((startToday.getTime() - dueAt.getTime()) / 86_400_000)) : null;
      const overdueDays = daysOverdue ?? 0;
      const status = !dueAt ? "undated" : overdueDays > 30 ? "overdue_31_plus" : overdueDays > 0 ? "overdue_1_30" : dueAt.getTime() < startToday.getTime() + 86_400_000 ? "due_today" : "upcoming";
      return { ...due, originalAmount: Number(due.originalAmount), outstandingAmount: Number(due.outstandingAmount), daysOverdue, status };
    }),
  };
}

export async function createRecurringTemplate(userId: number, input: { projectId: number; accountId?: number; categoryId: number; type: "income" | "expense"; amount: number; paymentMethod: string; note?: string; frequency: "weekly" | "monthly"; scheduleDay: number; nextRunAt: Date }) {
  await assertOwnedProject(userId, input.projectId);
  await assertOwnedCategory(userId, input.projectId, input.categoryId, input.type);
  if (input.accountId) await assertOwnedAccount(userId, input.projectId, input.accountId);
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeRecurringTransactions).values({ userId, projectId: input.projectId, accountId: input.accountId ?? null, categoryId: input.categoryId, type: input.type, amount: decimal(input.amount), paymentMethod: input.paymentMethod.trim(), note: input.note?.trim() || null, frequency: input.frequency, scheduleDay: input.scheduleDay, nextRunAt: input.nextRunAt });
  const id = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: "recurring_transaction", entityId: id, summary: "Recurring transaction template created" });
  return id;
}

export async function setRecurringScheduleTask(userId: number, projectId: number, id: number, scheduleCronTaskUid: string | null) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeRecurringTransactions).set({ scheduleCronTaskUid }).where(and(eq(financeRecurringTransactions.id, id), eq(financeRecurringTransactions.userId, userId), eq(financeRecurringTransactions.projectId, projectId)));
  if (!result[0].affectedRows) throw new Error("পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
}

export async function updateRecurringTemplate(userId: number, input: { id: number; projectId: number; isActive: boolean }) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeRecurringTransactions).set({ isActive: input.isActive }).where(and(eq(financeRecurringTransactions.id, input.id), eq(financeRecurringTransactions.userId, userId), eq(financeRecurringTransactions.projectId, input.projectId)));
  if (!result[0].affectedRows) throw new Error("পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "update", entityType: "recurring_transaction", entityId: input.id, summary: input.isActive ? "Recurring transaction activated" : "Recurring transaction paused" });
}

export async function setBillReminderSettings(userId: number, projectId: number, id: number, reminderDaysBefore: number) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeBills).set({ reminderDaysBefore }).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
  if (!result[0].affectedRows) throw new Error("বিলটি পাওয়া যায়নি");
}

export async function setBillScheduleTask(userId: number, projectId: number, id: number, scheduleCronTaskUid: string | null) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeBills).set({ scheduleCronTaskUid }).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
  if (!result[0].affectedRows) throw new Error("বিলটি পাওয়া যায়নি");
}

function advanceRecurringRun(current: Date, frequency: "weekly" | "monthly", scheduleDay: number) {
  if (frequency === "weekly") return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 7, 12));
  const monthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 12));
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(scheduleDay, lastDay), 12));
}

async function generateRecurringRuns(template: typeof financeRecurringTransactions.$inferSelect, now: Date) {
  const db = databaseRequired(await getDb());
  let created = 0;
  let nextRunAt = new Date(template.nextRunAt);
  for (let safety = 0; nextRunAt <= now && safety < 24; safety += 1) {
    const runKey = nextRunAt.toISOString().slice(0, 10);
    await db.transaction(async tx => {
      const [existing] = await tx.select({ id: financeTransactions.id }).from(financeTransactions).where(and(eq(financeTransactions.recurringTemplateId, template.id), eq(financeTransactions.recurringRunKey, runKey))).limit(1);
      if (existing) return;
      const voucherNo = await claimNextVoucher(tx, template.userId, template.projectId);
      const result = await tx.insert(financeTransactions).values({ userId: template.userId, projectId: template.projectId, accountId: template.accountId, categoryId: template.categoryId, type: template.type, amount: template.amount, voucherNo, paymentMethod: template.paymentMethod, note: template.note, recurringTemplateId: template.id, recurringRunKey: runKey, occurredAt: nextRunAt });
      if (template.accountId) await tx.update(financeAccounts).set({ currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(signedAmount(template.type, template.amount))}` }).where(and(eq(financeAccounts.id, template.accountId), eq(financeAccounts.userId, template.userId), eq(financeAccounts.projectId, template.projectId)));
      await tx.insert(auditLogs).values({ actorUserId: template.userId, projectId: template.projectId, action: "create", entityType: "recurring_transaction_run", entityId: Number(result[0].insertId), summary: `Recurring transaction generated for ${runKey}` });
      created += 1;
    });
    nextRunAt = advanceRecurringRun(nextRunAt, template.frequency, template.scheduleDay);
  }
  await db.update(financeRecurringTransactions).set({ nextRunAt, lastGeneratedAt: created ? now : template.lastGeneratedAt }).where(eq(financeRecurringTransactions.id, template.id));
  return { created, nextRunAt };
}

export async function generateRecurringNow(userId: number, projectId: number, id: number, now = new Date()) {
  const db = databaseRequired(await getDb());
  const [template] = await db.select().from(financeRecurringTransactions).where(and(eq(financeRecurringTransactions.id, id), eq(financeRecurringTransactions.userId, userId), eq(financeRecurringTransactions.projectId, projectId), eq(financeRecurringTransactions.isActive, true))).limit(1);
  if (!template) throw new Error("চালু পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
  return generateRecurringRuns(template, now);
}

export async function processScheduledRecurring(taskUid: string, now = new Date()) {
  const db = databaseRequired(await getDb());
  const [template] = await db.select().from(financeRecurringTransactions).where(and(eq(financeRecurringTransactions.scheduleCronTaskUid, taskUid), eq(financeRecurringTransactions.isActive, true))).limit(1);
  if (!template) return { created: 0, skipped: true };
  const result = await generateRecurringRuns(template, now);
  return { ...result, skipped: false };
}

export async function processScheduledBillReminder(taskUid: string, now = new Date()) {
  const db = databaseRequired(await getDb());
  const [bill] = await db.select().from(financeBills).where(eq(financeBills.scheduleCronTaskUid, taskUid)).limit(1);
  if (!bill || bill.isPaid) return { reminded: false, skipped: true };
  const reminderDueAt = new Date(bill.dueAt.getTime() - bill.reminderDaysBefore * 86_400_000);
  if (now < reminderDueAt) return { reminded: false, skipped: true };
  await db.update(financeBills).set({ lastReminderAt: now }).where(eq(financeBills.id, bill.id));
  return { reminded: true, skipped: false };
}

export async function exportUserData(userId: number) {
  const db = databaseRequired(await getDb());
  const [projects, accounts, categories, transactions, budgets, bills] = await Promise.all([
    listProjects(userId),
    db.select().from(financeAccounts).where(eq(financeAccounts.userId, userId)),
    db.select().from(financeCategories).where(eq(financeCategories.userId, userId)),
    db.select().from(financeTransactions).where(eq(financeTransactions.userId, userId)),
    db.select().from(financeBudgets).where(eq(financeBudgets.userId, userId)),
    db.select().from(financeBills).where(eq(financeBills.userId, userId)),
  ]);
  return { projects, accounts, categories, transactions, budgets, bills };
}

export async function exportProjectBackup(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [project] = await db.select().from(financeProjects).where(and(eq(financeProjects.id, projectId), eq(financeProjects.userId, userId))).limit(1);
  if (!project) throw new Error("নির্বাচিত প্রজেক্টটি পাওয়া যায়নি");
  const [accounts, categories, transactions, budgets, bills, dues, settlements, recurring, voucherSettings] = await Promise.all([
    db.select().from(financeAccounts).where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId))),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId))),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))),
    db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.projectId, projectId))),
    db.select().from(financeBills).where(and(eq(financeBills.userId, userId), eq(financeBills.projectId, projectId))),
    db.select().from(financeDues).where(and(eq(financeDues.userId, userId), eq(financeDues.projectId, projectId))),
    db.select().from(financeDueSettlements).where(and(eq(financeDueSettlements.userId, userId), eq(financeDueSettlements.projectId, projectId))),
    db.select().from(financeRecurringTransactions).where(and(eq(financeRecurringTransactions.userId, userId), eq(financeRecurringTransactions.projectId, projectId))),
    db.select().from(financeVoucherSettings).where(and(eq(financeVoucherSettings.userId, userId), eq(financeVoucherSettings.projectId, projectId))).limit(1),
  ]);
  return {
    formatVersion: "finance-project-backup-v1" as const,
    exportedAt: new Date(),
    project: { id: project.id, name: project.name },
    accounts,
    categories,
    transactions,
    budgets,
    bills,
    dues,
    settlements,
    recurring,
    voucherSettings: voucherSettings[0] ?? null,
  };
}

function assertUniqueBackupIds(rows: Array<{ id: number }>, label: string) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`${label} ব্যাকআপে একই আইডি একাধিকবার আছে`);
}

function assertBackupReferences(backup: any) {
  for (const [rows, label] of [[backup.accounts, "অ্যাকাউন্ট"], [backup.categories, "ক্যাটাগরি"], [backup.dues, "দেনা/পাওনা"], [backup.recurring, "পুনরাবৃত্ত লেনদেন"]] as const) {
    assertUniqueBackupIds(rows, label);
  }
  const accountIds = new Set(backup.accounts.map((row: any) => row.id));
  const categoryIds = new Set(backup.categories.map((row: any) => row.id));
  const dueIds = new Set(backup.dues.map((row: any) => row.id));
  const ensureAccount = (id: number | null | undefined) => { if (id !== null && id !== undefined && !accountIds.has(id)) throw new Error("ব্যাকআপের একটি অ্যাকাউন্ট রেফারেন্স সঠিক নয়"); };
  const ensureCategory = (id: number) => { if (!categoryIds.has(id)) throw new Error("ব্যাকআপের একটি ক্যাটাগরি রেফারেন্স সঠিক নয়"); };
  backup.transactions.forEach((row: any) => { ensureCategory(row.categoryId); ensureAccount(row.accountId); });
  backup.budgets.forEach((row: any) => ensureCategory(row.categoryId));
  backup.settlements.forEach((row: any) => { if (!dueIds.has(row.dueId)) throw new Error("ব্যাকআপের একটি দেনা/পাওনা সমন্বয় রেফারেন্স সঠিক নয়"); ensureAccount(row.accountId); });
  backup.recurring.forEach((row: any) => { ensureCategory(row.categoryId); ensureAccount(row.accountId); });
}

export function previewProjectBackup(backup: any) {
  assertBackupReferences(backup);
  const transactionDates = backup.transactions.map((row: any) => new Date(row.occurredAt).getTime()).filter(Number.isFinite);
  return {
    sourceProjectName: backup.project.name,
    exportedAt: backup.exportedAt,
    counts: {
      accounts: backup.accounts.length,
      categories: backup.categories.length,
      transactions: backup.transactions.length,
      budgets: backup.budgets.length,
      bills: backup.bills.length,
      dues: backup.dues.length,
      settlements: backup.settlements.length,
      recurring: backup.recurring.length,
    },
    transactionDateRange: transactionDates.length ? { from: new Date(Math.min(...transactionDates)), to: new Date(Math.max(...transactionDates)) } : null,
    restorationPolicy: "নতুন প্রজেক্টে পুনরুদ্ধার হবে; বিদ্যমান কোনো হিসাব মুছে বা প্রতিস্থাপন হবে না।",
  };
}

export async function restoreProjectBackup(userId: number, input: { projectName: string; backup: any }) {
  const db = databaseRequired(await getDb());
  assertBackupReferences(input.backup);
  const [existing] = await db.select({ id: financeProjects.id }).from(financeProjects).where(and(eq(financeProjects.userId, userId), eq(financeProjects.name, input.projectName))).limit(1);
  if (existing) throw new Error("এই নামে একটি প্রজেক্ট ইতিমধ্যে আছে; পুনরুদ্ধারের জন্য আলাদা নাম দিন");
  const projectId = await db.transaction(async tx => {
    const projectResult = await tx.insert(financeProjects).values({ userId, name: input.projectName }).execute();
    const restoredProjectId = Number(projectResult[0].insertId);
    const accountMap = new Map<number, number>();
    const categoryMap = new Map<number, number>();
    const dueMap = new Map<number, number>();

    for (const row of input.backup.accounts) {
      const result = await tx.insert(financeAccounts).values({ userId, projectId: restoredProjectId, name: row.name, type: row.type, openingBalance: String(row.openingBalance), currentBalance: String(row.currentBalance) }).execute();
      accountMap.set(row.id, Number(result[0].insertId));
    }
    for (const row of input.backup.categories) {
      const result = await tx.insert(financeCategories).values({ userId, projectId: restoredProjectId, name: row.name, type: row.type, isDefault: Boolean(row.isDefault) }).execute();
      categoryMap.set(row.id, Number(result[0].insertId));
    }
    if (input.backup.voucherSettings) {
      const row = input.backup.voucherSettings;
      await tx.insert(financeVoucherSettings).values({ userId, projectId: restoredProjectId, prefix: row.prefix, startNumber: row.startNumber, endNumber: row.endNumber, nextNumber: row.nextNumber }).execute();
    } else {
      await tx.insert(financeVoucherSettings).values({ userId, projectId: restoredProjectId }).execute();
    }
    for (const row of input.backup.recurring) {
      await tx.insert(financeRecurringTransactions).values({ userId, projectId: restoredProjectId, accountId: row.accountId == null ? null : accountMap.get(row.accountId)!, categoryId: categoryMap.get(row.categoryId)!, type: row.type, amount: String(row.amount), paymentMethod: row.paymentMethod, note: row.note ?? null, frequency: row.frequency, scheduleDay: row.scheduleDay, nextRunAt: row.nextRunAt, lastGeneratedAt: row.lastGeneratedAt ?? null, isActive: false, scheduleCronTaskUid: null }).execute();
    }
    for (const row of input.backup.transactions) {
      await tx.insert(financeTransactions).values({ userId, projectId: restoredProjectId, accountId: row.accountId == null ? null : accountMap.get(row.accountId)!, categoryId: categoryMap.get(row.categoryId)!, type: row.type, amount: String(row.amount), voucherNo: row.voucherNo ?? null, reason: row.reason ?? null, paymentMethod: row.paymentMethod, note: row.note ?? null, occurredAt: row.occurredAt }).execute();
    }
    for (const row of input.backup.budgets) {
      await tx.insert(financeBudgets).values({ userId, projectId: restoredProjectId, categoryId: categoryMap.get(row.categoryId)!, monthKey: row.monthKey, amount: String(row.amount) }).execute();
    }
    for (const row of input.backup.bills) {
      await tx.insert(financeBills).values({ userId, projectId: restoredProjectId, title: row.title, amount: String(row.amount), dueAt: row.dueAt, isPaid: Boolean(row.isPaid), reminderDaysBefore: row.reminderDaysBefore, lastReminderAt: row.lastReminderAt ?? null, scheduleCronTaskUid: null }).execute();
    }
    for (const row of input.backup.dues) {
      const result = await tx.insert(financeDues).values({ userId, projectId: restoredProjectId, type: row.type, counterparty: row.counterparty, originalAmount: String(row.originalAmount), outstandingAmount: String(row.outstandingAmount), voucherNo: row.voucherNo ?? null, reason: row.reason ?? null, note: row.note ?? null, openedAt: row.openedAt, dueAt: row.dueAt ?? null }).execute();
      dueMap.set(row.id, Number(result[0].insertId));
    }
    for (const row of input.backup.settlements) {
      await tx.insert(financeDueSettlements).values({ userId, projectId: restoredProjectId, dueId: dueMap.get(row.dueId)!, accountId: row.accountId == null ? null : accountMap.get(row.accountId)!, amount: String(row.amount), voucherNo: row.voucherNo ?? null, note: row.note ?? null, occurredAt: row.occurredAt }).execute();
    }
    return restoredProjectId;
  });
  await logAudit({ actorUserId: userId, projectId, action: "create", entityType: "project_restore", entityId: projectId, summary: `Project restored safely from backup: ${input.projectName}` });
  return { projectId };
}

export type AuditLogFilters = { from?: Date; to?: Date; actorUserId?: number; actorRole?: "admin" | "user"; search?: string };

function auditLogPredicates(filters: AuditLogFilters) {
  const keyword = filters.search?.trim();
  const searchPattern = keyword ? `%${keyword.replace(/[\\%_]/g, "\\$&")}%` : undefined;
  return [
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
    filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
    filters.actorRole ? eq(users.role, filters.actorRole) : undefined,
    searchPattern ? or(like(auditLogs.summary, searchPattern), like(auditLogs.entityType, searchPattern), like(auditLogs.action, searchPattern)) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
}

export type AuditLogPageInput = AuditLogFilters & { page: number; pageSize: number };

export async function listAuditLogsPage({ page, pageSize, ...filters }: AuditLogPageInput) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  const [logs, totalRows] = await Promise.all([
    db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, summary: auditLogs.summary, createdAt: auditLogs.createdAt, actorUserId: auditLogs.actorUserId, actorName: users.name, projectId: auditLogs.projectId, projectName: financeProjects.name }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).leftJoin(financeProjects, eq(auditLogs.projectId, financeProjects.id)).where(where).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)` }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).where(where),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);
  return { logs, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listAuditLogsForExport(filters: AuditLogFilters = {}) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, summary: auditLogs.summary, createdAt: auditLogs.createdAt, actorUserId: auditLogs.actorUserId, actorName: users.name, projectId: auditLogs.projectId, projectName: financeProjects.name }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).leftJoin(financeProjects, eq(auditLogs.projectId, financeProjects.id)).where(where).orderBy(desc(auditLogs.createdAt));
}

export async function getAuditLogActivity(filters: AuditLogFilters = {}) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  const activityCount = sql<number>`count(*)`;
  return db.select({ action: auditLogs.action, count: activityCount }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).where(where).groupBy(auditLogs.action).orderBy(desc(activityCount));
}

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const predicates = [
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
    filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  return listAuditLogsPage({ ...filters, page: 1, pageSize: 250 }).then(result => result.logs);
}

export async function listUsersForAdmin() {
  const db = databaseRequired(await getDb());
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(desc(users.lastSignedIn));
}

export async function listProjectsForAdmin() {
  const db = databaseRequired(await getDb());
  return db.select({ id: financeProjects.id, name: financeProjects.name, userId: financeProjects.userId, ownerName: users.name, ownerEmail: users.email, createdAt: financeProjects.createdAt }).from(financeProjects).leftJoin(users, eq(financeProjects.userId, users.id)).orderBy(desc(financeProjects.createdAt));
}
