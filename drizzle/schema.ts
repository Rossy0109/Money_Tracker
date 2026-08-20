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

/** Each user owns isolated workspaces; দৈনিক লেনদেনের খাতা is seeded on first use. */
export const financeProjects = mysqlTable(
  "finance_projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_projects_user_name_unique").on(table.userId, table.name),
    index("finance_projects_user_idx").on(table.userId),
  ],
);

/** Every finance record belongs to exactly one authenticated user and workspace. */
export const financeAccounts = mysqlTable(
  "finance_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["cash", "bank", "mobile"]).notNull(),
    openingBalance: decimal("openingBalance", { precision: 15, scale: 2 }).notNull().default("0.00"),
    currentBalance: decimal("currentBalance", { precision: 15, scale: 2 }).notNull().default("0.00"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("finance_accounts_user_project_idx").on(table.userId, table.projectId)],
);

export const financeCategories = mysqlTable(
  "finance_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_categories_user_project_name_type_unique").on(table.userId, table.projectId, table.name, table.type),
    index("finance_categories_user_project_idx").on(table.userId, table.projectId),
  ],
);

export const financeTransactions = mysqlTable(
  "finance_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
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
    index("finance_transactions_user_project_date_idx").on(table.userId, table.projectId, table.occurredAt),
    index("finance_transactions_user_project_type_idx").on(table.userId, table.projectId, table.type),
    index("finance_transactions_account_idx").on(table.accountId),
  ],
);

export const financeBudgets = mysqlTable(
  "finance_budgets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "cascade" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_budgets_user_project_category_month_unique").on(table.userId, table.projectId, table.categoryId, table.monthKey),
    index("finance_budgets_user_project_month_idx").on(table.userId, table.projectId, table.monthKey),
  ],
);

export const financeBills = mysqlTable(
  "finance_bills",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    dueAt: timestamp("dueAt").notNull(),
    isPaid: boolean("isPaid").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("finance_bills_user_project_due_idx").on(table.userId, table.projectId, table.dueAt)],
);

/** Immutable record of state-changing actions; only administrators may read it. */
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").references(() => financeProjects.id, { onDelete: "set null" }),
    action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    summary: varchar("summary", { length: 300 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_project_idx").on(table.projectId),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FinanceProject = typeof financeProjects.$inferSelect;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type FinanceCategory = typeof financeCategories.$inferSelect;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type FinanceBudget = typeof financeBudgets.$inferSelect;
export type FinanceBill = typeof financeBills.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
