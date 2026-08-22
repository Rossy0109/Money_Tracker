import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  financeAccounts,
  financeBills,
  financeBudgets,
  financeCategories,
  financeDues,
  financeDueSettlements,
  financeProjects,
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

export async function createDue(userId: number, input: { projectId: number; type: "debt" | "receivable"; counterparty: string; amount: number; note?: string; openedAt: Date }) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const id = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const result = await tx.insert(financeDues).values({ userId, projectId: input.projectId, type: input.type, counterparty: input.counterparty.trim(), originalAmount: decimal(input.amount), outstandingAmount: decimal(input.amount), voucherNo, note: input.note?.trim() || null, openedAt: input.openedAt });
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
