import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core identity table maintained by Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Every record below belongs to exactly one authenticated user. */
export const financeAccounts = mysqlTable(
  "finance_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["cash", "bank", "mobile"]).notNull(),
    openingBalance: decimal("openingBalance", { precision: 15, scale: 2 }).notNull().default("0.00"),
    currentBalance: decimal("currentBalance", { precision: 15, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("finance_accounts_user_idx").on(table.userId)],
);

export const financeCategories = mysqlTable(
  "finance_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_categories_user_name_type_unique").on(table.userId, table.name, table.type),
    index("finance_categories_user_idx").on(table.userId),
  ],
);

export const financeTransactions = mysqlTable(
  "finance_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "restrict" }),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    paymentMethod: varchar("paymentMethod", { length: 100 }).notNull(),
    note: varchar("note", { length: 500 }),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_transactions_user_date_idx").on(table.userId, table.occurredAt),
    index("finance_transactions_user_type_idx").on(table.userId, table.type),
    index("finance_transactions_account_idx").on(table.accountId),
  ],
);

export const financeBudgets = mysqlTable(
  "finance_budgets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "cascade" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_budgets_user_category_month_unique").on(table.userId, table.categoryId, table.monthKey),
    index("finance_budgets_user_month_idx").on(table.userId, table.monthKey),
  ],
);

export const financeBills = mysqlTable(
  "finance_bills",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    dueAt: timestamp("dueAt").notNull(),
    isPaid: boolean("isPaid").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("finance_bills_user_due_idx").on(table.userId, table.dueAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type FinanceCategory = typeof financeCategories.$inferSelect;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type FinanceBudget = typeof financeBudgets.$inferSelect;
export type FinanceBill = typeof financeBills.$inferSelect;
