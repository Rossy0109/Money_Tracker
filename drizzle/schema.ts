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
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["pending", "active", "suspended"]).default("pending").notNull(),
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

/** A household is separate from private projects and is owned by exactly one authenticated user. */
export const financeHouseholds = mysqlTable(
  "finance_households",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_households_owner_name_unique").on(table.ownerUserId, table.name),
    index("finance_households_owner_idx").on(table.ownerUserId),
  ],
);

/** Invited users obtain household access only after accepting an email-matched invitation. */
export const financeHouseholdMembers = mysqlTable(
  "finance_household_members",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull().references(() => financeHouseholds.id, { onDelete: "cascade" }),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    inviteeEmail: varchar("inviteeEmail", { length: 320 }).notNull(),
    displayName: varchar("displayName", { length: 120 }),
    role: mysqlEnum("role", ["editor", "viewer"]).notNull().default("viewer"),
    status: mysqlEnum("status", ["pending", "active", "declined", "revoked"]).notNull().default("pending"),
    invitedByUserId: int("invitedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_household_member_email_unique").on(table.householdId, table.inviteeEmail),
    uniqueIndex("finance_household_member_user_unique").on(table.householdId, table.userId),
    index("finance_household_members_user_status_idx").on(table.userId, table.status),
    index("finance_household_members_household_status_idx").on(table.householdId, table.status),
  ],
);

/** A shared household budget is category-labelled and independently scoped from personal project budgets. */
export const financeSharedBudgets = mysqlTable(
  "finance_shared_budgets",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull().references(() => financeHouseholds.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_shared_budgets_household_label_month_unique").on(table.householdId, table.label, table.monthKey),
    index("finance_shared_budgets_household_month_idx").on(table.householdId, table.monthKey),
  ],
);

/** Every shared household expense retains the contributing member for transparent family totals. */
export const financeSharedExpenses = mysqlTable(
  "finance_shared_expenses",
  {
    id: int("id").autoincrement().primaryKey(),
    householdId: int("householdId").notNull().references(() => financeHouseholds.id, { onDelete: "cascade" }),
    budgetId: int("budgetId").notNull().references(() => financeSharedBudgets.id, { onDelete: "cascade" }),
    contributorUserId: int("contributorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    note: varchar("note", { length: 500 }),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_shared_expenses_household_date_idx").on(table.householdId, table.occurredAt),
    index("finance_shared_expenses_budget_idx").on(table.budgetId),
    index("finance_shared_expenses_contributor_idx").on(table.contributorUserId),
  ],
);

/** A project-owned voucher range; numbers are assigned sequentially by the server. */
export const financeVoucherSettings = mysqlTable(
  "finance_voucher_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    prefix: varchar("prefix", { length: 24 }).notNull().default("V"),
    startNumber: int("startNumber").notNull().default(1),
    endNumber: int("endNumber").notNull().default(999999),
    nextNumber: int("nextNumber").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("finance_voucher_settings_user_project_unique").on(table.userId, table.projectId)],
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
    voucherNo: varchar("voucherNo", { length: 80 }),
    reason: varchar("reason", { length: 180 }),
    paymentMethod: varchar("paymentMethod", { length: 100 }).notNull(),
    note: varchar("note", { length: 500 }),
    recurringTemplateId: int("recurringTemplateId").references(() => financeRecurringTransactions.id, { onDelete: "set null" }),
    recurringRunKey: varchar("recurringRunKey", { length: 16 }),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_transactions_user_project_date_idx").on(table.userId, table.projectId, table.occurredAt),
    index("finance_transactions_user_project_type_idx").on(table.userId, table.projectId, table.type),
    index("finance_transactions_account_idx").on(table.accountId),
    uniqueIndex("finance_transactions_recurring_run_unique").on(table.recurringTemplateId, table.recurringRunKey),
  ],
);

/** Separate running balances for money owed by or owed to the project. */
export const financeDues = mysqlTable(
  "finance_dues",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["debt", "receivable"]).notNull(),
    counterparty: varchar("counterparty", { length: 180 }).notNull(),
    originalAmount: decimal("originalAmount", { precision: 15, scale: 2 }).notNull(),
    outstandingAmount: decimal("outstandingAmount", { precision: 15, scale: 2 }).notNull(),
    voucherNo: varchar("voucherNo", { length: 80 }),
    reason: varchar("reason", { length: 180 }),
    note: varchar("note", { length: 500 }),
    openedAt: timestamp("openedAt").notNull(),
    dueAt: timestamp("dueAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_dues_user_project_type_idx").on(table.userId, table.projectId, table.type),
    index("finance_dues_user_project_opened_idx").on(table.userId, table.projectId, table.openedAt),
    index("finance_dues_user_project_due_idx").on(table.userId, table.projectId, table.dueAt),
  ],
);

/** Every debt payment or receivable collection is retained as a settlement record. */
export const financeDueSettlements = mysqlTable(
  "finance_due_settlements",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    dueId: int("dueId").notNull().references(() => financeDues.id, { onDelete: "cascade" }),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    voucherNo: varchar("voucherNo", { length: 80 }),
    note: varchar("note", { length: 500 }),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_due_settlements_user_project_date_idx").on(table.userId, table.projectId, table.occurredAt),
    index("finance_due_settlements_due_idx").on(table.dueId),
    index("finance_due_settlements_account_idx").on(table.accountId),
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
    reminderDaysBefore: int("reminderDaysBefore").notNull().default(3),
    lastReminderAt: timestamp("lastReminderAt"),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("finance_bills_user_project_due_idx").on(table.userId, table.projectId, table.dueAt),
    uniqueIndex("finance_bills_schedule_cron_task_unique").on(table.scheduleCronTaskUid),
  ],
);

/** User-controlled templates that create a new ordinary transaction when their next date arrives. */
export const financeRecurringTransactions = mysqlTable(
  "finance_recurring_transactions",
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
    frequency: mysqlEnum("frequency", ["weekly", "monthly"]).notNull(),
    scheduleDay: int("scheduleDay").notNull(),
    nextRunAt: timestamp("nextRunAt").notNull(),
    lastGeneratedAt: timestamp("lastGeneratedAt"),
    isActive: boolean("isActive").notNull().default(true),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("finance_recurring_user_project_next_idx").on(table.userId, table.projectId, table.isActive, table.nextRunAt),
    uniqueIndex("finance_recurring_schedule_cron_task_unique").on(table.scheduleCronTaskUid),
  ],
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

/**
 * Metadata, not file bytes, for private finance exports and backups. A Blob
 * pathname is never accepted as proof that a browser may read the object.
 */
export const financePrivateStorageObjects = mysqlTable(
  "finance_private_storage_objects",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").references(() => financeProjects.id, { onDelete: "cascade" }),
    householdId: int("householdId").references(() => financeHouseholds.id, { onDelete: "cascade" }),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    kind: mysqlEnum("kind", ["backup", "export"]).notNull(),
    scope: mysqlEnum("scope", ["owner", "household"]).notNull(),
    contentType: varchar("contentType", { length: 160 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_private_storage_key_unique").on(table.storageKey),
    index("finance_private_storage_owner_created_idx").on(table.ownerUserId, table.createdAt),
    index("finance_private_storage_project_created_idx").on(table.projectId, table.createdAt),
    index("finance_private_storage_household_created_idx").on(table.householdId, table.createdAt),
  ],
);

/** Customer invoices and billing vouchers. */
export const financeInvoices = mysqlTable(
  "finance_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
    clientName: varchar("clientName", { length: 160 }).notNull(),
    clientPhone: varchar("clientPhone", { length: 40 }),
    clientEmail: varchar("clientEmail", { length: 320 }),
    clientAddress: text("clientAddress"),
    clientBinTin: varchar("clientBinTin", { length: 64 }),
    issueDate: timestamp("issueDate").notNull(),
    dueDate: timestamp("dueDate").notNull(),
    subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
    discountAmount: decimal("discountAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
    vatAmount: decimal("vatAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
    grandTotal: decimal("grandTotal", { precision: 15, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 15, scale: 2 }).default("0.00").notNull(),
    status: mysqlEnum("status", ["draft", "unpaid", "partially_paid", "paid", "overdue", "cancelled"]).default("unpaid").notNull(),
    notesTerms: text("notesTerms"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_invoices_project_number_unique").on(table.projectId, table.invoiceNumber),
    index("finance_invoices_user_project_idx").on(table.userId, table.projectId),
    index("finance_invoices_status_idx").on(table.projectId, table.status),
  ],
);

/** Individual line items for customer invoices. */
export const financeInvoiceItems = mysqlTable(
  "finance_invoice_items",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => financeInvoices.id, { onDelete: "cascade" }),
    description: varchar("description", { length: 255 }).notNull(),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 15, scale: 2 }).notNull(),
    vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
    total: decimal("total", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("finance_invoice_items_invoice_idx").on(table.invoiceId),
  ],
);

/** Products, goods, materials and stock inventory. */
export const financeInventoryItems = mysqlTable(
  "finance_inventory_items",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    sku: varchar("sku", { length: 80 }),
    category: varchar("category", { length: 100 }),
    unit: varchar("unit", { length: 40 }).default("পিস").notNull(),
    purchasePrice: decimal("purchasePrice", { precision: 15, scale: 2 }).default("0.00").notNull(),
    sellingPrice: decimal("sellingPrice", { precision: 15, scale: 2 }).default("0.00").notNull(),
    currentStock: decimal("currentStock", { precision: 12, scale: 2 }).default("0.00").notNull(),
    lowStockThreshold: decimal("lowStockThreshold", { precision: 12, scale: 2 }).default("5.00").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("finance_inventory_user_project_idx").on(table.userId, table.projectId),
    index("finance_inventory_sku_idx").on(table.projectId, table.sku),
  ],
);

/** Employee payroll profiles and base compensation. */
export const financeEmployees = mysqlTable(
  "finance_employees",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    designation: varchar("designation", { length: 120 }),
    department: varchar("department", { length: 120 }),
    joiningDate: timestamp("joiningDate"),
    baseSalary: decimal("baseSalary", { precision: 15, scale: 2 }).notNull().default("0.00"),
    status: mysqlEnum("status", ["active", "inactive", "terminated"]).default("active").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "bank", "mobile"]).default("cash").notNull(),
    bankAccountDetails: text("bankAccountDetails"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("finance_employees_user_project_idx").on(table.userId, table.projectId),
    index("finance_employees_status_idx").on(table.projectId, table.status),
  ],
);

/** Monthly salary calculation and payment records. */
export const financeSalaryPayments = mysqlTable(
  "finance_salary_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    employeeId: int("employeeId").notNull().references(() => financeEmployees.id, { onDelete: "cascade" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(), // YYYY-MM
    baseSalary: decimal("baseSalary", { precision: 15, scale: 2 }).notNull(),
    bonusAmount: decimal("bonusAmount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    allowanceAmount: decimal("allowanceAmount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    advanceDeduction: decimal("advanceDeduction", { precision: 15, scale: 2 }).notNull().default("0.00"),
    otherDeduction: decimal("otherDeduction", { precision: 15, scale: 2 }).notNull().default("0.00"),
    netPayable: decimal("netPayable", { precision: 15, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    paymentDate: timestamp("paymentDate"),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    voucherNo: varchar("voucherNo", { length: 80 }),
    status: mysqlEnum("status", ["pending", "paid", "partially_paid"]).default("pending").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_salary_employee_month_unique").on(table.projectId, table.employeeId, table.monthKey),
    index("finance_salary_project_month_idx").on(table.projectId, table.monthKey),
    index("finance_salary_employee_idx").on(table.employeeId),
  ],
);

/** Advance salary and loan disbursements to employees. */
export const financeEmployeeAdvances = mysqlTable(
  "finance_employee_advances",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    employeeId: int("employeeId").notNull().references(() => financeEmployees.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    repaidAmount: decimal("repaidAmount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    disbursedDate: timestamp("disbursedDate").notNull(),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    voucherNo: varchar("voucherNo", { length: 80 }),
    status: mysqlEnum("status", ["open", "settled"]).default("open").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("finance_employee_advances_project_employee_idx").on(table.projectId, table.employeeId),
    index("finance_employee_advances_status_idx").on(table.projectId, table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FinanceProject = typeof financeProjects.$inferSelect;
export type FinanceHousehold = typeof financeHouseholds.$inferSelect;
export type FinanceHouseholdMember = typeof financeHouseholdMembers.$inferSelect;
export type FinanceSharedBudget = typeof financeSharedBudgets.$inferSelect;
export type FinanceSharedExpense = typeof financeSharedExpenses.$inferSelect;
export type FinanceVoucherSettings = typeof financeVoucherSettings.$inferSelect;
export type FinanceAccount = typeof financeAccounts.$inferSelect;
export type FinanceCategory = typeof financeCategories.$inferSelect;
export type FinanceTransaction = typeof financeTransactions.$inferSelect;
export type FinanceBudget = typeof financeBudgets.$inferSelect;
export type FinanceBill = typeof financeBills.$inferSelect;
export type FinanceRecurringTransaction = typeof financeRecurringTransactions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type FinancePrivateStorageObject = typeof financePrivateStorageObjects.$inferSelect;
export type FinanceInvoice = typeof financeInvoices.$inferSelect;
export type FinanceInvoiceItem = typeof financeInvoiceItems.$inferSelect;
export type FinanceInventoryItem = typeof financeInventoryItems.$inferSelect;
export type InsertFinanceInventoryItem = typeof financeInventoryItems.$inferInsert;
export type FinanceEmployee = typeof financeEmployees.$inferSelect;
export type InsertFinanceEmployee = typeof financeEmployees.$inferInsert;
export type FinanceSalaryPayment = typeof financeSalaryPayments.$inferSelect;
export type FinanceEmployeeAdvance = typeof financeEmployeeAdvances.$inferSelect;

