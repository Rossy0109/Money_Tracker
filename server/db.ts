import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  financeAccounts,
  financeBills,
  financeBudgets,
  financeCategories,
  financeProjects,
  financeTransactions,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { DEFAULT_CATEGORIES } from "./finance.constants";

const DEFAULT_PROJECT_NAME = "Face Two Button";

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
  const [accounts, categories, transactions, budgets, bills] = await Promise.all([
    db.select().from(financeAccounts).where(scope).orderBy(asc(financeAccounts.createdAt)),
    db.select().from(financeCategories).where(and(eq(financeCategories.userId, userId), eq(financeCategories.projectId, projectId))).orderBy(asc(financeCategories.type), asc(financeCategories.name)),
    db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.projectId, projectId))).orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id)),
    db.select().from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.projectId, projectId), eq(financeBudgets.monthKey, monthKey()))),
    db.select().from(financeBills).where(and(eq(financeBills.userId, userId), eq(financeBills.projectId, projectId))).orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt)),
  ]);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const totalIncome = transactions.filter(row => row.type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = transactions.filter(row => row.type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);
  const budgetProgress = budgets.map(budget => {
    const category = categories.find(item => item.id === budget.categoryId);
    const spent = transactions.filter(row => row.categoryId === budget.categoryId && row.type === "expense" && row.occurredAt.toISOString().slice(0, 7) === budget.monthKey).reduce((sum, row) => sum + Number(row.amount), 0);
    return { ...budget, categoryName: category?.name ?? "Unknown", spent };
  });
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
  return { accounts, categories, transactions: displayTransactions, budgets: budgetProgress, bills, trend, monthKey: monthKey(), totals: { totalBalance, totalIncome, totalExpense, netAmount: totalIncome - totalExpense } };
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
  const result = await db.insert(financeTransactions).values({ userId, projectId: input.projectId, categoryId: input.categoryId, accountId: input.accountId ?? null, type: input.type, amount: decimal(input.amount), paymentMethod: input.paymentMethod.trim(), note: input.note?.trim() || null, occurredAt: input.occurredAt });
  const id = Number(result[0].insertId);
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

export async function createBill(userId: number, input: { projectId: number; title: string; amount: number; dueAt: Date }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const result = await db.insert(financeBills).values({ userId, projectId: input.projectId, title: input.title.trim(), amount: decimal(input.amount), dueAt: input.dueAt });
  const id = Number(result[0].insertId);
  await logAudit({ actorUserId: userId, projectId: input.projectId, action: "create", entityType: "bill", entityId: id, summary: "Bill reminder created" });
}

export async function updateBill(userId: number, projectId: number, id: number, input: { title: string; amount: number; dueAt: Date; isPaid: boolean }) {
  const db = databaseRequired(await getDb());
  const result = await db.update(financeBills).set({ title: input.title.trim(), amount: decimal(input.amount), dueAt: input.dueAt, isPaid: input.isPaid }).where(and(eq(financeBills.id, id), eq(financeBills.userId, userId), eq(financeBills.projectId, projectId)));
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

export type AuditLogFilters = { from?: Date; to?: Date; actorUserId?: number };

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const db = databaseRequired(await getDb());
  const predicates = [
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
    filters.actorUserId ? eq(auditLogs.actorUserId, filters.actorUserId) : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, summary: auditLogs.summary, createdAt: auditLogs.createdAt, actorUserId: auditLogs.actorUserId, actorName: users.name, projectId: auditLogs.projectId, projectName: financeProjects.name }).from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).leftJoin(financeProjects, eq(auditLogs.projectId, financeProjects.id)).where(predicates.length ? and(...predicates) : undefined).orderBy(desc(auditLogs.createdAt)).limit(250);
}

export async function listUsersForAdmin() {
  const db = databaseRequired(await getDb());
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).orderBy(desc(users.lastSignedIn));
}

export async function listProjectsForAdmin() {
  const db = databaseRequired(await getDb());
  return db.select({ id: financeProjects.id, name: financeProjects.name, userId: financeProjects.userId, ownerName: users.name, ownerEmail: users.email, createdAt: financeProjects.createdAt }).from(financeProjects).leftJoin(users, eq(financeProjects.userId, users.id)).orderBy(desc(financeProjects.createdAt));
}
