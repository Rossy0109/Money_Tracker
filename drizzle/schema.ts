import {
  boolean,
  decimal,
  index,
  int,
  json,
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
  role: mysqlEnum("role", ["user", "admin", "input_only"]).default("user").notNull(),
  status: mysqlEnum("status", ["pending", "active", "suspended"]).default("pending").notNull(),
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  resetToken: varchar("resetToken", { length: 255 }),
  resetTokenExpiresAt: timestamp("resetTokenExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Server-side session store for revocation and concurrent session limiting. */
export const userSessions = mysqlTable(
  "user_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionToken: varchar("sessionToken", { length: 255 }).notNull().unique(),
    refreshToken: varchar("refreshToken", { length: 255 }).notNull().unique(),
    userAgent: text("userAgent"),
    ipAddress: varchar("ipAddress", { length: 45 }),
    issuedAt: timestamp("issuedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  },
  (table) => [
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_session_token_idx").on(table.sessionToken),
    index("user_sessions_refresh_token_idx").on(table.refreshToken),
    index("user_sessions_expires_at_idx").on(table.expiresAt),
    index("user_sessions_revoked_at_idx").on(table.revokedAt),
  ],
);

/** Failed login attempt tracking for account lockout. */
export const failedLoginAttempts = mysqlTable(
  "failed_login_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    identifier: varchar("identifier", { length: 320 }).notNull(),
    ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
    attemptCount: int("attemptCount").default(1).notNull(),
    firstAttemptAt: timestamp("firstAttemptAt").defaultNow().notNull(),
    lastAttemptAt: timestamp("lastAttemptAt").defaultNow().notNull(),
    lockedUntil: timestamp("lockedUntil"),
  },
  (table) => [
    uniqueIndex("failed_login_attempts_identifier_ip_unique").on(table.identifier, table.ipAddress),
    index("failed_login_attempts_locked_until_idx").on(table.lockedUntil),
  ],
);

/** Login history for audit trail. */
export const loginHistory = mysqlTable(
  "login_history",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    loginMethod: varchar("loginMethod", { length: 64 }).notNull(),
    ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
    userAgent: text("userAgent"),
    success: boolean("success").notNull(),
    failureReason: varchar("failureReason", { length: 255 }),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  },
  (table) => [
    index("login_history_user_id_idx").on(table.userId),
    index("login_history_attempted_at_idx").on(table.attemptedAt),
    index("login_history_success_idx").on(table.success),
  ],
);

/** Role definitions for RBAC. */
export const roles = mysqlTable(
  "roles",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 64 }).notNull().unique(),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    description: text("description"),
    isSystem: boolean("isSystem").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("roles_name_unique").on(table.name),
  ],
);

/** Individual permissions for RBAC. */
export const permissions = mysqlTable(
  "permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull().unique(),
    displayName: varchar("displayName", { length: 128 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("permissions_name_unique").on(table.name),
    index("permissions_category_idx").on(table.category),
  ],
);

/** User-role assignments. */
export const userRoles = mysqlTable(
  "user_roles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: int("roleId").notNull().references(() => roles.id, { onDelete: "cascade" }),
    assignedBy: int("assignedBy").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
    index("user_roles_user_id_idx").on(table.userId),
    index("user_roles_role_id_idx").on(table.roleId),
  ],
);

/** Role-permission mappings. */
export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("roleId").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: int("permissionId").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_unique").on(table.roleId, table.permissionId),
    index("role_permissions_role_id_idx").on(table.roleId),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

/** Each user owns isolated workspaces; দৈনিক লেনদেনের খাতা is seeded on first use. */
export const financeProjects = mysqlTable(
  "finance_projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_projects_user_name_unique").on(table.userId, table.name),
    index("finance_projects_user_idx").on(table.userId),
    index("finance_projects_active_idx").on(table.isActive),
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
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    prefix: varchar("prefix", { length: 24 }).notNull().default("V"),
    startNumber: int("startNumber").notNull().default(1),
    endNumber: int("endNumber").notNull().default(999999),
    nextNumber: int("nextNumber").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("finance_voucher_settings_user_project_unique").on(table.userId, table.projectId)],
);

/** Voucher header - groups ledger entries atomically. Lifecycle: draft→submitted→approved→posted→reversed. */
export const financeVouchers = mysqlTable(
  "finance_vouchers",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    voucherNo: varchar("voucherNo", { length: 80 }).notNull(),
    date: timestamp("date").notNull(),
    narration: varchar("narration", { length: 500 }),
    totalDebit: decimal("totalDebit", { precision: 18, scale: 2 }).notNull().default("0.00"),
    totalCredit: decimal("totalCredit", { precision: 18, scale: 2 }).notNull().default("0.00"),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "posted", "reversed"]).default("draft").notNull(),
    voucherType: varchar("voucherType", { length: 30 }).notNull().default("general"),
    fiscalPeriodId: int("fiscalPeriodId").references(() => financeFiscalPeriods.id, { onDelete: "set null" }),
    submittedBy: int("submittedBy").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submittedAt"),
    approvedBy: int("approvedBy").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approvedAt"),
    postedBy: int("postedBy").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("postedAt"),
    reversedBy: int("reversedBy").references(() => users.id, { onDelete: "set null" }),
    reversedAt: timestamp("reversedAt"),
    reversalReference: varchar("reversalReference", { length: 120 }),
    isArchived: boolean("isArchived").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_vouchers_project_voucher_unique").on(table.projectId, table.voucherNo),
    index("finance_vouchers_user_project_date_idx").on(table.userId, table.projectId, table.date),
    index("finance_vouchers_status_idx").on(table.projectId, table.status),
    index("finance_vouchers_fiscal_period_idx").on(table.fiscalPeriodId),
  ],
);

/** Debit entries (Dr side) - multiple per voucher. */
export const financeVoucherDebits = mysqlTable(
  "finance_voucher_debits",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "cascade" }),
    accountId: int("accountId").notNull().references(() => financeAccounts.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    narration: varchar("narration", { length: 300 }),
    sortOrder: int("sortOrder").notNull().default(0),
  },
  (table) => [
    index("finance_voucher_debits_voucher_idx").on(table.voucherId),
    index("finance_voucher_debits_account_idx").on(table.accountId),
  ],
);

/** Credit entries (Cr side) - multiple per voucher. */
export const financeVoucherCredits = mysqlTable(
  "finance_voucher_credits",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "cascade" }),
    accountId: int("accountId").notNull().references(() => financeAccounts.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    narration: varchar("narration", { length: 300 }),
    sortOrder: int("sortOrder").notNull().default(0),
  },
  (table) => [
    index("finance_voucher_credits_voucher_idx").on(table.voucherId),
    index("finance_voucher_credits_account_idx").on(table.accountId),
  ],
);

/** Ledger entries - posted to account ledgers with running balance. Immutable once created. */
export const financeLedgerEntries = mysqlTable(
  "finance_ledger_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    accountId: int("accountId").notNull().references(() => financeAccounts.id, { onDelete: "restrict" }),
    entryType: mysqlEnum("entryType", ["debit", "credit"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    runningBalance: decimal("runningBalance", { precision: 18, scale: 2 }).notNull(),
    postedAt: timestamp("postedAt").defaultNow().notNull(),
  },
  (table) => [
    index("finance_ledger_account_date_idx").on(table.accountId, table.postedAt),
    index("finance_ledger_voucher_idx").on(table.voucherId),
    index("finance_ledger_account_voucher_idx").on(table.accountId, table.voucherId),
  ],
);

/**
 * Journal entries - accounting records created when a voucher is posted.
 * Each journal entry corresponds to one voucher and contains at least two lines.
 */
export const financeJournalEntries = mysqlTable(
  "finance_journal_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    journalNo: varchar("journalNo", { length: 80 }).notNull(),
    date: timestamp("date").notNull(),
    narration: varchar("narration", { length: 500 }),
    totalDebit: decimal("totalDebit", { precision: 18, scale: 2 }).notNull(),
    totalCredit: decimal("totalCredit", { precision: 18, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["draft", "posted", "reversed"]).default("draft").notNull(),
    postedBy: int("postedBy").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("postedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_journal_entries_voucher_unique").on(table.voucherId),
    uniqueIndex("finance_journal_entries_no_unique").on(table.projectId, table.journalNo),
    index("finance_journal_entries_project_date_idx").on(table.projectId, table.date),
    index("finance_journal_entries_status_idx").on(table.status),
  ],
);

/**
 * Journal lines - individual debit/credit lines of a journal entry.
 * Each line references a Chart of Accounts account. At least 2 lines per entry.
 */
export const financeJournalLines = mysqlTable(
  "finance_journal_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    journalEntryId: int("journalEntryId").notNull().references(() => financeJournalEntries.id, { onDelete: "cascade" }),
    accountId: int("accountId").notNull().references(() => financeChartOfAccounts.id, { onDelete: "restrict" }),
    entryType: mysqlEnum("entryType", ["debit", "credit"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    narration: varchar("narration", { length: 300 }),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("finance_journal_lines_entry_idx").on(table.journalEntryId),
    index("finance_journal_lines_account_idx").on(table.accountId),
  ],
);

/** Reference entries - cross-references (cheque no, bill ref, invoice ref, etc.). */
export const financeVoucherReferences = mysqlTable(
  "finance_voucher_references",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    refType: mysqlEnum("refType", ["cheque", "bill", "invoice", "challan", "other"]).notNull(),
    refNumber: varchar("refNumber", { length: 120 }).notNull(),
    refDate: timestamp("refDate"),
    relatedEntityType: varchar("relatedEntityType", { length: 50 }),
    relatedEntityId: int("relatedEntityId"),
  },
  (table) => [
    index("finance_voucher_references_voucher_idx").on(table.voucherId),
  ],
);

/** Audit entries - IMMUTABLE trail. Never cascade-deleted — use restrict. */
export const financeVoucherAudit = mysqlTable(
  "finance_voucher_audit",
  {
    id: int("id").autoincrement().primaryKey(),
    voucherId: int("voucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    actorUserId: int("actorUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    action: mysqlEnum("action", ["create", "submit", "approve", "post", "cancel", "reverse"]).notNull(),
    snapshot: json("snapshot").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("finance_voucher_audit_voucher_idx").on(table.voucherId),
    index("finance_voucher_audit_actor_idx").on(table.actorUserId),
  ],
);

/** Account types for Chart of Accounts (Asset, Liability, Equity, Revenue, Expense). */
export const financeAccountTypes = mysqlTable(
  "finance_account_types",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 10 }).notNull(), // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    name: varchar("name", { length: 60 }).notNull(), // Asset, Liability, Equity, Revenue, Expense
    nameBn: varchar("nameBn", { length: 60 }), // Bengali name
    normalBalance: mysqlEnum("normalBalance", ["debit", "credit"]).notNull(),
    sortOrder: int("sortOrder").notNull().default(0),
    isSystem: boolean("isSystem").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_account_types_code_unique").on(table.code),
  ],
);

/** Chart of Accounts - hierarchical account structure with balances. */
export const financeChartOfAccounts = mysqlTable(
  "finance_chart_of_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    accountTypeId: int("accountTypeId").notNull().references(() => financeAccountTypes.id, { onDelete: "restrict" }),
    parentId: int("parentId"),
    code: varchar("code", { length: 30 }).notNull(), // e.g., 1000, 1010, 1010.01
    name: varchar("name", { length: 120 }).notNull(),
    nameBn: varchar("nameBn", { length: 120 }),
    description: varchar("description", { length: 500 }),
    isActive: boolean("isActive").notNull().default(true),
    isDetail: boolean("isDetail").notNull().default(true), // false = header/group account
    openingBalance: decimal("openingBalance", { precision: 18, scale: 2 }).notNull().default("0.00"),
    currentBalance: decimal("currentBalance", { precision: 18, scale: 2 }).notNull().default("0.00"),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_chart_of_accounts_project_code_unique").on(table.projectId, table.code),
    index("finance_chart_of_accounts_user_project_idx").on(table.userId, table.projectId),
    index("finance_chart_of_accounts_parent_idx").on(table.parentId),
    index("finance_chart_of_accounts_type_idx").on(table.accountTypeId),
  ],
);

/** Account groups for organizing Chart of Accounts within an account type. */
export const financeAccountGroups = mysqlTable(
  "finance_account_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    accountTypeId: int("accountTypeId").notNull().references(() => financeAccountTypes.id, { onDelete: "restrict" }),
    parentId: int("parentId"),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    nameBn: varchar("nameBn", { length: 120 }),
    description: varchar("description", { length: 500 }),
    sortOrder: int("sortOrder").notNull().default(0),
    isSystem: boolean("isSystem").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_account_groups_project_code_unique").on(table.projectId, table.code),
    index("finance_account_groups_user_project_idx").on(table.userId, table.projectId),
    index("finance_account_groups_type_idx").on(table.accountTypeId),
    index("finance_account_groups_parent_idx").on(table.parentId),
  ],
);

/** Fiscal periods define the accounting calendar (months/quarters/years). */
export const financeFiscalPeriods = mysqlTable(
  "finance_fiscal_periods",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    status: mysqlEnum("status", ["open", "closed", "locked"]).default("open").notNull(),
    closedAt: timestamp("closedAt"),
    closedBy: int("closedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("finance_fiscal_periods_project_name_unique").on(table.projectId, table.name),
    index("finance_fiscal_periods_user_project_idx").on(table.userId, table.projectId),
    index("finance_fiscal_periods_status_idx").on(table.projectId, table.status),
    index("finance_fiscal_periods_dates_idx").on(table.projectId, table.startDate, table.endDate),
  ],
);

/** Period lock - prevents edits to closed accounting periods. */
export const financePeriodLocks = mysqlTable(
  "finance_period_locks",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(), // YYYY-MM
    lockedAt: timestamp("lockedAt").defaultNow().notNull(),
    lockedBy: int("lockedBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 300 }),
  },
  (table) => [
    uniqueIndex("finance_period_locks_project_month_unique").on(table.projectId, table.monthKey),
    index("finance_period_locks_user_project_idx").on(table.userId, table.projectId),
  ],
);

/** Reversing vouchers / credit notes linked to original voucher. */
export const financeVoucherReversals = mysqlTable(
  "finance_voucher_reversals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    originalVoucherId: int("originalVoucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    reversalVoucherId: int("reversalVoucherId").notNull().references(() => financeVouchers.id, { onDelete: "restrict" }),
    reason: varchar("reason", { length: 500 }).notNull(),
    reversedAt: timestamp("reversedAt").defaultNow().notNull(),
    reversedBy: int("reversedBy").notNull().references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("finance_voucher_reversals_original_unique").on(table.originalVoucherId),
    index("finance_voucher_reversals_project_idx").on(table.projectId),
    index("finance_voucher_reversals_reversal_idx").on(table.reversalVoucherId),
  ],
);

/** Bank reconciliation - matches statement lines to ledger entries. */
export const financeBankReconciliations = mysqlTable(
  "finance_bank_reconciliations",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    accountId: int("accountId").notNull().references(() => financeChartOfAccounts.id, { onDelete: "restrict" }),
    statementDate: timestamp("statementDate").notNull(),
    statementBalance: decimal("statementBalance", { precision: 18, scale: 2 }).notNull(),
    bookBalance: decimal("bookBalance", { precision: 18, scale: 2 }).notNull(),
    difference: decimal("difference", { precision: 18, scale: 2 }).notNull().default("0.00"),
    status: mysqlEnum("status", ["in_progress", "completed", "unreconciled"]).default("in_progress").notNull(),
    reconciledAt: timestamp("reconciledAt"),
    reconciledBy: int("reconciledBy").references(() => users.id, { onDelete: "set null" }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("finance_bank_reconciliations_project_account_idx").on(table.projectId, table.accountId),
    index("finance_bank_reconciliations_status_idx").on(table.status),
  ],
);

/** Bank reconciliation items - individual matched/unmatched lines. */
export const financeBankReconciliationItems = mysqlTable(
  "finance_bank_reconciliation_items",
  {
    id: int("id").autoincrement().primaryKey(),
    reconciliationId: int("reconciliationId").notNull().references(() => financeBankReconciliations.id, { onDelete: "cascade" }),
    ledgerEntryId: int("ledgerEntryId").references(() => financeLedgerEntries.id, { onDelete: "set null" }),
    statementRef: varchar("statementRef", { length: 120 }), // Bank statement reference
    statementDate: timestamp("statementDate"),
    statementAmount: decimal("statementAmount", { precision: 18, scale: 2 }),
    statementType: mysqlEnum("statementType", ["debit", "credit"]),
    matched: boolean("matched").notNull().default(false),
    matchedAt: timestamp("matchedAt"),
    notes: varchar("notes", { length: 300 }),
  },
  (table) => [
    index("finance_bank_reconciliation_items_reconciliation_idx").on(table.reconciliationId),
    index("finance_bank_reconciliation_items_ledger_idx").on(table.ledgerEntryId),
  ],
);

/** Every finance record belongs to exactly one authenticated user and workspace. */
export const financeAccounts = mysqlTable(
  "finance_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["cash", "bank", "mobile"]).notNull(),
    openingBalance: decimal("openingBalance", { precision: 18, scale: 2 }).notNull().default("0.00"),
    currentBalance: decimal("currentBalance", { precision: 18, scale: 2 }).notNull().default("0.00"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("finance_accounts_user_project_name_unique").on(table.userId, table.projectId, table.name),
    index("finance_accounts_user_project_idx").on(table.userId, table.projectId),
    index("finance_accounts_active_idx").on(table.isActive),
  ],
);

export const financeCategories = mysqlTable(
  "finance_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("finance_categories_user_project_name_type_unique").on(table.userId, table.projectId, table.name, table.type),
    index("finance_categories_user_project_idx").on(table.userId, table.projectId),
    index("finance_categories_active_idx").on(table.isActive),
  ],
);

export const financeTransactions = mysqlTable(
  "finance_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "restrict" }),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    type: mysqlEnum("type", ["debt", "receivable"]).notNull(),
    counterparty: varchar("counterparty", { length: 180 }).notNull(),
    originalAmount: decimal("originalAmount", { precision: 18, scale: 2 }).notNull(),
    outstandingAmount: decimal("outstandingAmount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    dueId: int("dueId").notNull().references(() => financeDues.id, { onDelete: "cascade" }),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "restrict" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 180 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    accountId: int("accountId").references(() => financeAccounts.id, { onDelete: "set null" }),
    categoryId: int("categoryId").notNull().references(() => financeCategories.id, { onDelete: "restrict" }),
    type: mysqlEnum("type", ["income", "expense"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
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
    actorRole: varchar("actorRole", { length: 20 }).notNull().default("user"),
    projectId: int("projectId").references(() => financeProjects.id, { onDelete: "set null" }),
    action: mysqlEnum("action", [
      "create", "update", "delete", "delete_attempt",
      "approve", "reject", "post", "reverse",
      "login", "logout", "login_failed",
      "permission_denied", "user_suspended",
      "backup_created", "backup_restored",
    ]).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    summary: varchar("summary", { length: 300 }).notNull(),
    oldData: json("oldData"),
    newData: json("newData"),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: text("userAgent"),
    requestId: varchar("requestId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_logs_created_idx").on(table.createdAt),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_project_idx").on(table.projectId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
    clientName: varchar("clientName", { length: 160 }).notNull(),
    clientPhone: varchar("clientPhone", { length: 40 }),
    clientEmail: varchar("clientEmail", { length: 320 }),
    clientAddress: text("clientAddress"),
    clientBinTin: varchar("clientBinTin", { length: 64 }),
    issueDate: timestamp("issueDate").notNull(),
    dueDate: timestamp("dueDate").notNull(),
    subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull(),
    discountAmount: decimal("discountAmount", { precision: 18, scale: 2 }).default("0.00").notNull(),
    vatAmount: decimal("vatAmount", { precision: 18, scale: 2 }).default("0.00").notNull(),
    grandTotal: decimal("grandTotal", { precision: 18, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 18, scale: 2 }).default("0.00").notNull(),
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
    unitPrice: decimal("unitPrice", { precision: 18, scale: 2 }).notNull(),
    vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("0.00").notNull(),
    total: decimal("total", { precision: 18, scale: 2 }).notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    sku: varchar("sku", { length: 80 }),
    category: varchar("category", { length: 100 }),
    unit: varchar("unit", { length: 40 }).default("পিস").notNull(),
    purchasePrice: decimal("purchasePrice", { precision: 18, scale: 2 }).default("0.00").notNull(),
    sellingPrice: decimal("sellingPrice", { precision: 18, scale: 2 }).default("0.00").notNull(),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    designation: varchar("designation", { length: 120 }),
    department: varchar("department", { length: 120 }),
    joiningDate: timestamp("joiningDate"),
    baseSalary: decimal("baseSalary", { precision: 18, scale: 2 }).notNull().default("0.00"),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    employeeId: int("employeeId").notNull().references(() => financeEmployees.id, { onDelete: "cascade" }),
    monthKey: varchar("monthKey", { length: 7 }).notNull(), // YYYY-MM
    baseSalary: decimal("baseSalary", { precision: 18, scale: 2 }).notNull(),
    bonusAmount: decimal("bonusAmount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    allowanceAmount: decimal("allowanceAmount", { precision: 18, scale: 2 }).notNull().default("0.00"),
    advanceDeduction: decimal("advanceDeduction", { precision: 18, scale: 2 }).notNull().default("0.00"),
    otherDeduction: decimal("otherDeduction", { precision: 18, scale: 2 }).notNull().default("0.00"),
    netPayable: decimal("netPayable", { precision: 18, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 18, scale: 2 }).notNull().default("0.00"),
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
    userId: int("userId").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectId: int("projectId").notNull().references(() => financeProjects.id, { onDelete: "restrict" }),
    employeeId: int("employeeId").notNull().references(() => financeEmployees.id, { onDelete: "cascade" }),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    repaidAmount: decimal("repaidAmount", { precision: 18, scale: 2 }).notNull().default("0.00"),
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
export type FinanceVoucher = typeof financeVouchers.$inferSelect;
export type FinanceVoucherDebit = typeof financeVoucherDebits.$inferSelect;
export type FinanceVoucherCredit = typeof financeVoucherCredits.$inferSelect;
export type FinanceLedgerEntry = typeof financeLedgerEntries.$inferSelect;
export type FinanceVoucherReference = typeof financeVoucherReferences.$inferSelect;
export type FinanceVoucherAudit = typeof financeVoucherAudit.$inferSelect;
export type FinanceAccountType = typeof financeAccountTypes.$inferSelect;
export type FinanceChartOfAccount = typeof financeChartOfAccounts.$inferSelect;
export type FinanceAccountGroup = typeof financeAccountGroups.$inferSelect;
export type FinanceFiscalPeriod = typeof financeFiscalPeriods.$inferSelect;
export type FinancePeriodLock = typeof financePeriodLocks.$inferSelect;
export type FinanceVoucherReversal = typeof financeVoucherReversals.$inferSelect;
export type FinanceBankReconciliation = typeof financeBankReconciliations.$inferSelect;
export type FinanceBankReconciliationItem = typeof financeBankReconciliationItems.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type FailedLoginAttempt = typeof failedLoginAttempts.$inferSelect;
export type LoginHistory = typeof loginHistory.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;

/**
 * Persistent idempotency keys — prevents duplicate mutations across retries,
 * network glitches, double-clicks, and multi-instance deployments.
 *
 * Unique constraint: (userId, idempotencyKey) ensures each user's key is unique.
 * Entries auto-expire after TTL to prevent unbounded table growth.
 */
export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    route: varchar("route", { length: 200 }).notNull(),
    requestHash: varchar("requestHash", { length: 64 }).notNull(),
    responseStatus: int("responseStatus").notNull(),
    responseBody: text("responseBody").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_user_key_unique").on(table.userId, table.idempotencyKey),
    index("idempotency_keys_expires_idx").on(table.expiresAt),
    index("idempotency_keys_user_route_idx").on(table.userId, table.route),
  ],
);

