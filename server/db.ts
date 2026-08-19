import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  financeAccounts,
  financeBills,
  financeBudgets,
  financeCategories,
  financeTransactions,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { DEFAULT_CATEGORIES } from "./finance.constants";

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

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function ensureDefaultCategories(userId: number) {
  const db = await requireDb();
  const defaults = [
    ...DEFAULT_CATEGORIES.income.map(name => ({ userId, name, type: "income" as const, isDefault: true })),
    ...DEFAULT_CATEGORIES.expense.map(name => ({ userId, name, type: "expense" as const, isDefault: true })),
  ];
  await db.insert(financeCategories).values(defaults).onDuplicateKeyUpdate({ set: { isDefault: true } });
}

export async function listCategories(userId: number) {
  await ensureDefaultCategories(userId);
  const db = await requireDb();
  return db.select().from(financeCategories).where(eq(financeCategories.userId, userId)).orderBy(asc(financeCategories.type), asc(financeCategories.name));
}

export async function listAccounts(userId: number) {
  const db = await requireDb();
  return db.select().from(financeAccounts).where(eq(financeAccounts.userId, userId)).orderBy(asc(financeAccounts.createdAt));
}

export async function createAccount(userId: number, input: { name: string; type: "cash" | "bank" | "mobile"; openingBalance: string }) {
  const db = await requireDb();
  const openingBalance = Number(input.openingBalance).toFixed(2);
  await db.insert(financeAccounts).values({ ...input, userId, openingBalance, currentBalance: openingBalance });
}

export async function listTransactions(userId: number, type?: "income" | "expense") {
  const db = await requireDb();
  const where = type
    ? and(eq(financeTransactions.userId, userId), eq(financeTransactions.type, type))
    : eq(financeTransactions.userId, userId);
  return db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      accountName: financeAccounts.name,
      categoryId: financeTransactions.categoryId,
      categoryName: financeCategories.name,
      type: financeTransactions.type,
      amount: financeTransactions.amount,
      paymentMethod: financeTransactions.paymentMethod,
      note: financeTransactions.note,
      occurredAt: financeTransactions.occurredAt,
      createdAt: financeTransactions.createdAt,
    })
    .from(financeTransactions)
    .innerJoin(financeCategories, eq(financeTransactions.categoryId, financeCategories.id))
    .leftJoin(financeAccounts, eq(financeTransactions.accountId, financeAccounts.id))
    .where(where)
    .orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id));
}

export async function createTransaction(
  userId: number,
  input: { accountId?: number; categoryId: number; type: "income" | "expense"; amount: string; paymentMethod: string; note?: string; occurredAt: Date },
) {
  const db = await requireDb();
  const [category] = await db.select().from(financeCategories).where(and(eq(financeCategories.id, input.categoryId), eq(financeCategories.userId, userId))).limit(1);
  if (!category || category.type !== input.type) throw new Error("Selected category is unavailable for this transaction type");
  const account = input.accountId
    ? (await db.select().from(financeAccounts).where(and(eq(financeAccounts.id, input.accountId), eq(financeAccounts.userId, userId))).limit(1))[0]
    : undefined;
  if (input.accountId && !account) throw new Error("Selected account is unavailable");

  const amount = Number(input.amount).toFixed(2);
  const balanceDelta = input.type === "income" ? Number(amount) : -Number(amount);
  await db.transaction(async tx => {
    await tx.insert(financeTransactions).values({ ...input, userId, amount, note: input.note?.trim() || null, accountId: account?.id ?? null });
    if (account) {
      await tx.update(financeAccounts).set({ currentBalance: sql`${financeAccounts.currentBalance} + ${balanceDelta}` }).where(and(eq(financeAccounts.id, account.id), eq(financeAccounts.userId, userId)));
    }
  });
}

export async function deleteTransaction(userId: number, transactionId: number) {
  const db = await requireDb();
  const [transaction] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.id, transactionId), eq(financeTransactions.userId, userId))).limit(1);
  if (!transaction) throw new Error("Transaction was not found");
  const reverseDelta = transaction.type === "income" ? -Number(transaction.amount) : Number(transaction.amount);
  await db.transaction(async tx => {
    await tx.delete(financeTransactions).where(and(eq(financeTransactions.id, transactionId), eq(financeTransactions.userId, userId)));
    if (transaction.accountId) {
      await tx.update(financeAccounts).set({ currentBalance: sql`${financeAccounts.currentBalance} + ${reverseDelta}` }).where(and(eq(financeAccounts.id, transaction.accountId), eq(financeAccounts.userId, userId)));
    }
  });
}

export async function listBudgets(userId: number, monthKey: string) {
  const db = await requireDb();
  const budgets = await db
    .select({ id: financeBudgets.id, categoryId: financeBudgets.categoryId, categoryName: financeCategories.name, amount: financeBudgets.amount })
    .from(financeBudgets)
    .innerJoin(financeCategories, eq(financeBudgets.categoryId, financeCategories.id))
    .where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.monthKey, monthKey)))
    .orderBy(asc(financeCategories.name));

  const monthStart = new Date(`${monthKey}-01T00:00:00.000Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const spending = await db
    .select({ categoryId: financeTransactions.categoryId, amount: financeTransactions.amount })
    .from(financeTransactions)
    .where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.type, "expense"), gte(financeTransactions.occurredAt, monthStart), sql`${financeTransactions.occurredAt} < ${monthEnd}`));
  const spentByCategory = new Map<number, number>();
  spending.forEach(row => spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + Number(row.amount)));
  return budgets.map(row => ({ ...row, spent: spentByCategory.get(row.categoryId) ?? 0 }));
}

export async function upsertBudget(userId: number, input: { categoryId: number; monthKey: string; amount: string }) {
  const db = await requireDb();
  const [category] = await db.select().from(financeCategories).where(and(eq(financeCategories.id, input.categoryId), eq(financeCategories.userId, userId), eq(financeCategories.type, "expense"))).limit(1);
  if (!category) throw new Error("Budget must use one of your expense categories");
  await db.insert(financeBudgets).values({ ...input, userId, amount: Number(input.amount).toFixed(2) }).onDuplicateKeyUpdate({ set: { amount: Number(input.amount).toFixed(2) } });
}

export async function listBills(userId: number) {
  const db = await requireDb();
  return db.select().from(financeBills).where(eq(financeBills.userId, userId)).orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt));
}

export async function createBill(userId: number, input: { title: string; amount: string; dueAt: Date }) {
  const db = await requireDb();
  await db.insert(financeBills).values({ ...input, userId, title: input.title.trim(), amount: Number(input.amount).toFixed(2) });
}

export async function setBillPaid(userId: number, billId: number, isPaid: boolean) {
  const db = await requireDb();
  await db.update(financeBills).set({ isPaid }).where(and(eq(financeBills.id, billId), eq(financeBills.userId, userId)));
}

export async function getOverview(userId: number) {
  await ensureDefaultCategories(userId);
  const [accounts, transactions, categories, bills] = await Promise.all([listAccounts(userId), listTransactions(userId), listCategories(userId), listBills(userId)]);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
  const totalIncome = transactions.filter(row => row.type === "income").reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = transactions.filter(row => row.type === "expense").reduce((sum, row) => sum + Number(row.amount), 0);

  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - i));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const trend = monthKeys.map(monthKey => ({ monthKey, income: 0, expense: 0 }));
  transactions.forEach(transaction => {
    const key = transaction.occurredAt.toISOString().slice(0, 7);
    const entry = trend.find(row => row.monthKey === key);
    if (entry) entry[transaction.type] += Number(transaction.amount);
  });
  const budgets = await listBudgets(userId, monthKeys.at(-1)!);
  return { accounts, transactions, categories, bills, budgets, trend, totals: { totalBalance, totalIncome, totalExpense, netAmount: totalIncome - totalExpense }, monthKey: monthKeys.at(-1)! };
}
