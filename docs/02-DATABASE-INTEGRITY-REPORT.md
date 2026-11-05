# Database Integrity Report

## 1. Table Relationships

The database schema defines clear relationships between entities using foreign key constraints. Key relationships include:

- **Users** (`users` table) are central, with many tables referencing `users.id` (e.g., `financeProjects`, `financeAccounts`, `financeTransactions`, `financeVouchers`, etc.).
- **Projects** (`financeProjects`) represent isolated workspaces per user, with foreign keys to `users.id`.
- **Accounts** (`financeAccounts`) link to users, projects, and the chart of accounts (`financeChartOfAccounts`).
- **Chart of Accounts** (`financeChartOfAccounts`) links to users, projects, and account types (`financeAccountTypes`).
- **Vouchers** (`financeVouchers`) link to users, projects, and optionally to fiscal periods.
- **Ledger Entries** (`financeLedgerEntries`) link to vouchers, accounts, and the chart of accounts.
- **Journal Entries and Lines** (`financeJournalEntries`, `financeJournalLines`) link to vouchers and each other.
- **Budgets** (`financeBudgets`, `financeSharedBudgets`) link to users, projects, and categories.
- **Transactions** (`financeTransactions`) link to users, projects, accounts, categories, and vouchers.
- **Recurring Transactions** (`financeRecurringTransactions`) link to users, projects, accounts, and categories.
- **Bills** (`financeBills`) link to users and projects.
- **Invoices** (`financeInvoices`, `financeInvoiceItems`) link to users and projects.
- **Inventory Items** (`financeInventoryItems`) link to users and projects.
- **Employees** (`financeEmployees`, `financeSalaryPayments`, `financeEmployeeAdvances`) link to users and projects.
- **Dues and Settlements** (`financeDues`, `financeDueSettlements`) link to users and projects.
- **Households** (`financeHouseholds`, `financeHouseholdMembers`) link to users.
- **Backup and Audit** tables (`financePrivateStorageObjects`, `auditLogs`) link to users and optionally to projects/households.

All foreign keys are properly defined in the schema using Drizzle's `.references()` method.

## 2. Foreign-Key Integrity

Foreign key constraints are configured with appropriate `ON DELETE` and `ON UPDATE` actions:

- **CASCADE**: Used where child records should be deleted when the parent is removed (e.g., `user_sessions` → `users`, `financeVoucherDebits/Credits` → `financeVouchers`).
- **RESTRICT**: Used to prevent deletion of parent records that have dependent children (e.g., `financeProjects` → `users`, `financeFirmProfiles` → `users` and `financeProjects`, `financeChartOfAccounts` → `financeAccountTypes`). This ensures data integrity by blocking orphan-producing deletions.
- **SET NULL**: Used where the relationship is optional and the child should retain record but lose the parent link (e.g., `financeVouchers.fiscalPeriodId` → `financeFiscalPeriods`, `financeLedgerEntries.accountId` → `financeAccounts`).
- **NO ACTION**: Equivalent to RESTRICT in MySQL; used in some legacy constraints (e.g., the dropped `drive_connections` table used `ON UPDATE no action`).

All foreign keys reference existing tables and columns, ensuring referential integrity.

## 3. Unique Constraints

Unique constraints are enforced to prevent duplicate entries where business logic requires uniqueness:

- **Users**: `openId` is unique.
- **User Sessions**: `sessionToken` and `refreshToken` are unique.
- **Failed Login Attempts**: Composite unique on `(identifier, ipAddress)`.
- **Roles**: `name` is unique.
- **Permissions**: `name` is unique.
- **User Roles**: Composite unique on `(userId, roleId)`.
- **Role Permissions**: Composite unique on `(roleId, permissionId)`.
- **Finance Projects**: Composite unique on `(userId, name)`.
- **Finance Firm Profiles**: Composite unique on `(userId, projectId)`.
- **Finance Households**: Composite unique on `(ownerUserId, name)`.
- **Finance Household Members**: Composite unique on `(householdId, inviteeEmail)` and `(householdId, userId)`.
- **Finance Shared Budgets**: Composite unique on `(householdId, label, monthKey)`.
- **Finance Vouchers**: Composite unique on `(projectId, voucherNo)`.
- **Finance Voucher Settings**: Composite unique on `(userId, projectId)`.
- **Finance Accounts**: Composite unique on `(userId, projectId, name)`.
- **Finance Categories**: Composite unique on `(userId, projectId, name, type)`.
- **Finance Transactions**: Composite unique on `(userId, projectId, idempotencyKey)` and `(voucherId)` and `(recurringTemplateId, recurringRunKey)`.
- **Finance Dues**: No explicit unique, but indexed for query performance.
- **Finance Due Settlements**: No explicit unique.
- **Finance Budgets**: Composite unique on `(userId, projectId, categoryId, monthKey)`.
- **Finance Bills**: Unique on `scheduleCronTaskUid`.
- **Finance Recurring Transactions**: Unique on `scheduleCronTaskUid`.
- **Audit Logs**: No unique constraints (append-only).
- **Finance Private Storage Objects**: Unique on `storageKey`.
- **Finance Invoices**: Unique on `(projectId, invoiceNumber)`.
- **Finance Invoice Items**: No unique (linked to invoice).
- **Finance Inventory Items**: No unique (but indexed on `sku` per project).
- **Finance Employees**: No unique (but indexed per project).
- **Finance Salary Payments**: Unique on `(projectId, employeeId, monthKey)`.
- **Finance Employee Advances**: No unique.
- **Finance Voucher Reversals**: Unique on `originalVoucherId`.
- **Finance Bank Reconciliations**: No unique (but indexed per project/account).
- **Finance Bank Reconciliation Items**: No unique (but indexed per reconciliation and ledger entry).
- **Finance Account Groups**: Composite unique on `(projectId, code)`.
- **Finance Fiscal Periods**: Composite unique on `(projectId, name)`.
- **Finance Period Locks**: Composite unique on `(projectId, monthKey)`.
- **Idempotency Keys**: Composite unique on `(userId, idempotencyKey)`.

These constraints align with business rules and prevent data duplication.

## 4. Transaction Boundaries

Transactions are used extensively to ensure atomicity for multi-step operations. Key functions that utilize `db.transaction()` include:

- **Voucher Creation**: `createVoucherWithEntries` wraps the entire voucher creation (voucher header, debits, credits, references, audit) in a transaction. If auto-posting is requested, it also calls `postVoucherInternals` within the same transaction.
- **Voucher Lifecycle**:
  - `submitVoucher`: Uses a transaction to update voucher status, guard against concurrent submissions, and insert an audit record.
  - `approveVoucher`: Similar transactional guards for approval/return-to-draft.
  - `postVoucher`: Uses a transaction with row-level locking (`selectForUpdate`) to prevent concurrent posting, validates period locks, updates voucher status, and calls `postVoucherInternals`.
  - `reverseVoucher`: Uses a transaction to create a reversal voucher, update the original voucher status, and insert audit records.
- **Financial Operations**:
  - `createTransaction` (simple transaction): Creates a finance transaction and links it to a voucher if provided.
  - `settleDue`: Uses a transaction to create a settlement transaction, update the due outstanding amount, create a voucher if needed, and insert audit.
  - `createDue`, `updateDue`, `deleteDue`: Each uses a transaction for the operation and associated audit.
- **Account and Category Management**:
  - `createAccount`, `updateAccount`, `deleteAccount`: Transactional with audit.
  - `createCategory`, `updateCategory`, `deleteCategory`: Transactional with audit.
- **Budget Operations**:
  - `upsertBudget`: Transactional.
- **Bill Operations**:
  - `createBill`, `updateBill`, `setBillPaid`, `deleteBill`: Transactional.
- **Recurring Templates**:
  - `createRecurringTemplate`, `updateRecurringTemplate`: Transactional.
- **Inventory Operations**:
  - `createInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`, `adjustInventoryStock`: Transactional.
- **Employee Operations**:
  - `createEmployee`, `updateEmployee`, `deleteEmployee`: Transactional.
- **Salary Payments**:
  - `disburseSalary`: Transactional (creates salary payment, updates advance, creates voucher if needed).
  - `createEmployeeAdvance`: Transactional.
- **Household Operations**:
  - `createHousehold`, `inviteHouseholdMember`, `acceptHouseholdInvitation`, `updateHouseholdMember`: Transactional.
- **Shared Budget and Expense**:
  - `saveSharedBudget`, `addSharedExpense`: Transactional.
- **Backup and Restore**:
  - `exportProjectBackup`, `previewProjectBackup`, `restoreProjectBackup`: Transactional for database operations (though file operations are outside).
- **Period Locks**:
  - `lockPeriod`, `unlockPeriod`: Transactional.
- **Fiscal Periods**:
  - `createFiscalPeriod`, `closeFiscalPeriod`: Transactional.
- **Chart of Accounts and Account Groups**:
  - `createChartOfAccount`, `updateChartOfAccount`, `deleteChartOfAccount`: Transactional.
  - `createAccountGroup`, `updateAccountGroup`, `deleteAccountGroup`: Transactional.
- **Bank Reconciliation**:
  - `createBankReconciliation`, `addBankReconciliationItem`, `matchBankReconciliationItem`, `unmatchBankReconciliationItem`, `completeBankReconciliation`: Transactional.
- **Audit Logging**: Most mutating operations insert an audit record within the same transaction to ensure the audit trail is atomic with the data change.

All transactions are scoped to a single logical operation, ensuring that either all changes commit or none do, maintaining consistency even under failure or concurrency.

## 5. Indexing Strategy

Indexes are defined on columns used in frequent queries, joins, and filters. Notable indexing patterns:

- **Primary Keys**: All tables have an auto-incrementing `id` primary key (integer), providing fast lookups by ID.
- **Foreign Key Columns**: Most foreign key columns are indexed explicitly (e.g., `userId`, `projectId`, `accountId`, `chartOfAccountId`, `voucherId`) to speed up joins.
- **Composite Indexes**: Created for common query patterns:
  - `(userId, projectId)`: Appears in many tables (accounts, categories, transactions, etc.) for scoping queries to a user's project.
  - `(projectId, ...)`: Used when querying by project alone (e.g., `financeProjects_user_idx`).
  - `(userId, ...)`: Used for user-scoped queries (e.g., `financeAccounts_user_project_idx`).
  - `(userId, projectId, date)`: For time-series queries on transactions, vouchers, ledger entries (e.g., `financeTransactions_user_project_date_idx`).
  - `(userId, projectId, type)`: For filtering by income/expense (e.g., `financeTransactions_user_project_type_idx`).
  - `(userId, projectId, status)`: For workflow status filtering (e.g., `financeVouchers_status_idx` on `projectId` and `status`).
  - `(userId, projectId, monthKey)`: For budgeting and reporting (e.g., `financeBudgets_user_project_month_idx`).
  - `(userId, projectId, accountId)`: For account-specific queries (e.g., `financeBankReconciliations_project_account_idx`).
  - `(projectId, sku)`: For inventory lookups (e.g., `financeInventory_sku_idx`).
  - `(projectId, employeeId)`: For employee queries (e.g., `financeEmployees_user_project_idx`).
  - `(projectId, monthKey)`: For salary payments (e.g., `financeSalaryPayments_project_month_idx`).
  - `(projectId, reconciliationId)`: For bank reconciliation items (e.g., `financeBankReconciliationItems_reconciliation_idx`).
  - `(projectId, ledgerEntryId)`: For bank reconciliation items (e.g., `financeBankReconciliationItems_ledger_idx`).
  - `(projectId, voucherId)`: For voucher-specific queries (e.g., `financeVoucherDebits_voucher_idx`, `financeVoucherCredits_voucher_idx`).
  - `(projectId, accountId)`: For ledger entries (e.g., `financeLedgerAccountDateIdx` on `accountId` and `postedAt`).
  - `(projectId, chartOfAccountId)`: For ledger entries (e.g., `financeLedgerCoaDateIdx` on `chartOfAccountId` and `postedAt`).
  - `(projectId, fiscalPeriodId)`: For voucher fiscal period queries (e.g., `financeVouchers_fiscal_period_idx`).
  - `(projectId, periodLocks_monthKey)`: For period lock lookups (e.g., `financePeriodLocks_project_month_unique`).
  - `(projectId, code)`: For chart of accounts and account groups (e.g., `financeChartOfAccounts_project_code_unique`, `financeAccountGroups_project_code_unique`).
  - `(projectId, name)`: For fiscal periods and households (e.g., `financeFiscalPeriods_project_name_unique`, `financeHouseholds_owner_name_unique`).
  - `(projectId, label, monthKey)`: For shared budgets (e.g., `financeSharedBudgets_household_label_month_unique`).
  - `(projectId, voucherNo)`: For voucher lookups (e.g., `financeVouchers_project_voucher_unique`).
  - `(projectId, invoiceNumber)`: For invoices (e.g., `financeInvoices_project_number_unique`).
  - `(projectId, scheduleCronTaskUid)`: For bills and recurring tasks (e.g., `financeBills_schedule_cron_task_unique`, `financeRecurring_schedule_cron_task_unique`).
  - `(projectId, idempotencyKey)`: For transaction idempotency (e.g., `financeTransactions_idempotency_unique`).
  - `(projectId, recurringTemplateId, recurringRunKey)`: For recurring transaction runs (e.g., `financeTransactions_recurring_run_unique`).
  - `(projectId, categoryId)`: For budgets (e.g., `financeBudgets_user_project_category_month_unique` includes category).
  - `(projectId, accountTypeId)`: For chart of accounts (e.g., `financeChartOfAccounts_type_idx`).
  - `(projectId, parentId)`: For hierarchical accounts/groups (e.g., `financeChartOfAccounts_parent_idx`, `financeAccountGroups_parent_idx`).
  - `(projectId, isDetail)`: For filtering detail accounts (e.g., `financeChartOfAccounts_detail_idx` inferred from queries).
  - `(projectId, isActive)`: For active records (e.g., `financeAccounts_active_idx`, `financeCategories_active_idx`).
  - `(projectId, isArchived)`: For archived vouchers (e.g., `financeVouchers_isArchived_idx` though not explicitly defined; relies on primary key).
  - `(projectId, openingBalanceVoucherId)`: For accounts with opening vouchers (e.g., `financeAccounts_opening_voucher_idx`).
  - `(projectId, resetToken)`, `(projectId, resetTokenExpiresAt)`: For password reset (e.g., `users_resetToken_idx` implied).
  - `(projectId, lastSignedIn)`: For user activity (e.g., `users_lastSignedIn_idx` implied).
  - `(projectId, failedLoginAttempts_lockedUntil)`: For lockout queries (e.g., `failedLoginAttempts_locked_until_idx`).
  - `(projectId, loginHistory_attemptedAt)`: For login history (e.g., `loginHistory_attempted_at_idx`).
  - `(projectId, loginHistory_success)`: For login success/failure (e.g., `loginHistory_success_idx`).
  - `(projectId, auditLogs_createdAt)`: For audit log queries (e.g., `audit_logs_created_idx`).
  - `(projectId, auditLogs_actorUserId)`: For actor-based audit queries (e.g., `audit_logs_actor_idx`).
  - `(projectId, auditLogs_projectId)`: For project-based audit queries (e.g., `audit_logs_project_idx`).
  - `(projectId, auditLogs_entityType, entityId)`: For entity-based audit queries (e.g., `audit_logs_entity_idx`).

Indexes are created using Drizzle's `index()` and `uniqueIndex()` methods within table definitions. The strategy covers:
- Lookups by IDs (primary and foreign).
- Scoping by user and project (multi-tenancy).
- Time-range queries (dates, month keys).
- Status and type filtering.
- Unique constraint enforcement.
- Sorting and ordering needs (e.g., `sortOrder` columns).
- Join optimization (composite indexes matching query WHERE clauses).

This indexing strategy supports the query patterns observed in the accounting core, report generation, and API handlers, ensuring efficient data retrieval.

## 6. Query Efficiency

Query efficiency is ensured through:
- **Appropriate Indexing**: As detailed above, indexes match the WHERE, JOIN, ORDER BY, and GROUP BY clauses in common queries.
- **Selective Columns**: Queries typically select only the needed columns (e.g., in `accountBalances` in `accounting-core.ts`, only `accountId`, `entryType`, `amount` are selected).
- **Join Optimization**: Foreign key indexes enable efficient joins (e.g., joining `financeLedgerEntries` to `financeVouchers` and `financeChartOfAccounts`).
- **Time-Range Partitioning**: Queries often filter by date ranges (e.g., `gte`/`lte` on `financeVouchers.date`), which can leverage indexes on date columns.
- **Aggregation Efficiency**: Aggregate functions (SUM, COUNT) are performed on indexed columns where possible (e.g., summing amounts on indexed `amount` columns via the index on the column itself or via covering indexes).
- **Covering Indexes**: Some indexes may cover the query entirely (e.g., an index on `(userId, projectId, date)` including `amount` could cover a transaction sum query; however, the current schema does not include extra columns in indexes beyond the indexed ones. This is acceptable given the table sizes and write frequency).
- **Avoiding SELECT \***: Queries explicitly list columns, reducing data transfer.
- **Batch Operations**: Where applicable, operations are batched (e.g., inserting multiple debits/credits in a single `INSERT ... VALUES (...), (...), ...` statement).
- **Cursor-Based Pagination**: The API uses `page` and `pageSize` with `OFFSET`/`LIMIT`, which is acceptable for moderate datasets. For very large datasets, keyset pagination might be considered, but current volumes do not necessitate it.
- **Cached Lookups**: Reference data (account types, categories, etc.) is frequently queried but changes infrequently; these queries benefit from indexes and are lightweight.

Potential areas for improvement (noted but not critical):
- Some queries in `accounting-core.ts` (e.g., `accountBalances`) perform multiple joins without covering indexes; however, the tables involved (`financeLedgerEntries`, `financeVouchers`, `financeChartOfAccounts`) are indexed on the join columns, making the joins efficient.
- Aggregation queries (like trial balance) read large volumes of ledger entries; indexes on `(chartOfAccountId, voucherId)` and `(voucherId, chartOfAccountId)` help, but scanning the ledger entries for a period is necessary. This is acceptable given the append-only nature of ledger entries and the typical date-range filters.
- The `generateCashFlowStatement` function performs multiple scans of the accounts and balances; however, the account set is small (typically hundreds of accounts), making this efficient.

Overall, query efficiency is adequate for the current scale and usage patterns, with indexes supporting the major access paths.

## 7. Decimal and Currency Precision

Monetary values are stored with fixed-point precision to avoid floating-point errors:
- All monetary columns use `decimal(precision, scale)` with `precision: 18` and `scale: 2`.
  - Examples: `amount` in `financeTransactions`, `openingBalance` and `currentBalance` in `financeAccounts`, `amount` in `financeBudgets`, `amount` in `financeBills`, `amount` in `financeInvoices` (subtotal, discount, VAT, grand total, paid), `amount` in `financeSalaryPayments`, etc.
  - The `decimalFromCents` and `toCents` helper functions ensure conversion between integer cents (used internally for precise arithmetic) and decimal strings.
- Intermediate calculations in `accounting-core.ts` use integer cents (multiplying by 100) to maintain precision, converting back to decimal only for output.
- The `decimal` type in MySQL/MariaDB stores values exactly as specified, with no rounding errors for the defined scale.
- Currency is consistently Bangladeshi Taka (BDT) as per the product requirements; no multi-currency support is present, simplifying precision concerns.

This approach guarantees accurate financial calculations and reporting, complying with accounting standards.

## 8. Migration Consistency

Migration files are located in `/drizzle/` and are applied sequentially. Key observations:
- **Naming**: Migrations are prefixed with a sequential number and a descriptive name (e.g., `0001_mighty_hobgoblin.sql`, `0022_drop_drive_connections.sql`).
- **Order**: The sequence is unbroken from `0000` to `0022`, indicating consistent application order.
- **Content**: Each migration contains SQL statements that modify the schema (CREATE, ALTER, DROP). No migration appears to be empty or duplicated.
- **Irreversibility**: Migrations are designed to be applied once; there are no down migrations (as is typical for Drizzle). This is acceptable because the project treats the production database as read-only for schema changes, and migrations are only run on disposable databases in CI or local development.
- **Checksums**: Drizzle likely maintains internal checksums to detect migration tampering; the presence of `_journal.json` and snapshot files in `/drizzle/meta/` suggests version tracking.
- **Google Drive Removal**: The migration pair `0021_nappy_mordo.sql` (creation) and `0022_drop_drive_connections.sql` (removal) correctly handles the removal of the Google Drive integration. The creation migration defined the `drive_connections` table with a foreign key to `users` (ON DELETE CASCADE). The removal migration simply drops the table, which is safe because the foreign key constraint ensures no orphaned records would remain (though the table being dropped removes the constraint implicitly).
- **Schema Drift**: No evidence of schema drift; the current schema in `schema.ts` matches the cumulative effect of all migrations.
- **Best Practices**: The project adheres to the rule "Never rewrite or delete existing migration files in `drizzle/`," ensuring migration history is preserved.
- **CI Safety**: The `test` CI job provisions a MariaDB database and runs `pnpm test:coverage`, which applies migrations against a disposable database, ensuring migrations are forward-compatible and do not break.

Migration consistency is maintained, and the schema evolves in a predictable, controlled manner.

## 9. Orphan-Record Prevention

Orphan records (child records referencing a deleted parent) are prevented through foreign key constraints:
- **RESTRICT** on parent deletion prevents deletion if any child records exist (e.g., you cannot delete a user who has projects, accounts, etc.).
- **CASCADE** automatically deletes child records when the parent is deleted (e.g., deleting a user session deletes the associated tokens; deleting a voucher deletes its debits, credits, references, audit entries, and ledger entries—though note: ledger entries are set to `RESTRICT` on voucher deletion to preserve immutability; see below).
- **SET NULL** sets the foreign key to NULL when the parent is deleted (e.g., if a fiscal period is closed and later deleted (though unlikely), vouchers referencing it would have their `fiscalPeriodId` set to NULL).

Special considerations:
- **Immutable Records**: The `financeLedgerEntries` table has `onDelete: "restrict"` referencing `financeVouchers`, meaning ledger entries cannot be deleted if their voucher exists—but more importantly, vouchers cannot be deleted if they have ledger entries (posted vouchers). This ensures that once a voucher is posted, its ledger entries are permanent, and the voucher cannot be deleted (only reversed). This prevents orphans by making the ledger entries the source of truth for posted transactions.
- **Audit Tables**: The `financeVoucherAudit` table references `financeVouchers` with `onDelete: "restrict"`, preserving audit trails even if a voucher is somehow deleted (though voucher deletion is heavily restricted).
- **Soft Deletes**: Some tables use an `isActive` flag (e.g., `financeAccounts`, `financeCategories`) instead of physical deletion, logically orphaning records but preserving them for history. The application treats inactive records as hidden but still referable.
- **Optional Relationships**: Columns like `accountId` in `financeTransactions` are nullable and set to `NULL` on account deletion (`onDelete: "set null"`), preventing orphans while allowing the transaction to remain (though it becomes unlinked from an account).

Overall, the combination of RESTRICT, CASCADE, and SET NULL, along with immutable-by-design tables (ledger entries, audit), ensures that orphan records are either prevented or handled gracefully.

## 10. Concurrent Write Safety

Concurrent write safety is achieved through:
- **Transactions**: All multi-step operations are wrapped in `db.transaction()`, ensuring atomicity and isolation. The MySQL/MariaDB transaction isolation level (default REPEATABLE READ) prevents dirty reads, non-repeatable reads, and phantom reads within a transaction.
- **Row-Level Locking**: The `postVoucher` function uses `selectForUpdate` (which executes `SELECT ... FOR UPDATE`) to lock the voucher row during the posting process. This prevents two concurrent attempts to post the same voucher.
- **Status Guarding**: Before updating a voucher's status (e.g., from `draft` to `submitted`, `submitted` to `approved`, `approved` to `posted`), the code checks the current status and only allows the transition if the voucher is in the expected state. The update statement includes a `WHERE` clause matching the current status (e.g., `WHERE status = 'draft'`). If another transaction has already changed the status, the `affectedRows` will be zero, and the operation throws an error. This prevents lost updates and double-processing.
- **Idempotency Keys**: The `financeTransactions` table has a unique constraint on `(userId, projectId, idempotencyKey)`. This ensures that identical requests (same idempotency key) cannot create duplicate transactions, protecting against retries and duplicate submissions.
- **Running Balance Updates**: In `postVoucherInternals`, the chart of accounts balances are read, updated, and written back within the same transaction. Because the entire posting operation is transactional and the voucher row is locked, concurrent postings affecting the same accounts are serialized, preventing balance corruption.
- **Period Lock Checks**: Before posting, the system checks for period locks (via `assertPeriodNotLockedTx`). This check and the subsequent status update are within the same transaction, ensuring that a lock cannot be inserted between the check and the update.
- **Optimistic Concurrency (Audit)**: While not used for concurrency control, the audit snapshot captures the state at the time of the transaction, providing a way to detect conflicts post-hoc (though the primary defense is the transactional guards).
- **Database Connection Pooling**: The `mysql2` connection pool is used, ensuring that connections are reused safely. The `instrumentPool` function adds query timing metrics but does not affect concurrency.

These mechanisms ensure that the system handles concurrent writes correctly, maintaining data integrity under load.

## 11. Data Retention

Data retention policies are implicit in the design:
- **Immutable Data**: 
  - `financeLedgerEntries`: Once created (via voucher posting), entries are never updated or deleted. The `runningBalance` is set at creation and remains static. This provides an immutable audit trail for account balances.
  - `financeVoucherAudit`: Entries are inserted on voucher creation, submission, approval, posting, and reversal, and are never updated or deleted. This provides a complete, tamper-evident history of voucher lifecycle events.
  - `auditLogs`: Append-only log of system actions (login, permission changes, admin operations, etc.). Never updated or deleted.
  - `financeJournalEntries` and `financeJournalLines`: Created when a voucher is posted and are immutable thereafter.
- **Historical Data**:
  - Most tables retain records indefinitely (e.g., `financeTransactions`, `financeInvoices`, `financeBills`, `financeDues`, `financeEmployees`, etc.). Soft-delete flags (`isActive`) allow logical hiding while preserving data for reporting and compliance.
  - The `isActive` flag is present on `financeAccounts`, `financeCategories`, `financeRecurringTransactions`, `financeBills` (via `isPaid` and status), `financeEmployees` (via `status`), etc.
- **Archiving**:
  - Vouchers can be marked as `isArchived` (though not explicitly shown in the schema; the `financeVouchers` table has an `isArchived` column with default `false`). Archived vouchers are excluded from active lists but retained for history.
  - No automatic archiving or purging is implemented; data growth is managed by the user (e.g., exporting old data via backup/restore).
- **Backup Compatibility**: The system supports exporting projects to JSON (plaintext or encrypted) and restoring them, enabling users to archive old projects externally.
- **Legal Compliance**: Retention of financial records for audit and tax purposes is supported by the immutable ledger and voucher audit trails.

There is no automatic data deletion or expiration; retention is governed by the user's backup and export practices. This aligns with the product's aim as a long-term financial record-keeping system.

## 12. Backup Compatibility

Backup and restore functionality is well-integrated:
- **Export Formats**: 
  - Plaintext JSON export (`financeDb.exportUserData`, `financeDb.exportProjectBackup`).
  - Encrypted JSON export (for cloud backups) using AES-GCM (iv, encrypted, tag).
  - The export includes all relevant tables: users (limited to the actor), projects, accounts, categories, transactions, vouchers, voucher debits/credits, ledger entries, journal entries/lines, budgets, bills, dues, settlements, recurring advances, inventory, employees, salary payments, employee advances, chart of accounts, account groups, fiscal periods, period locks, voucher reversals, voucher audit, voucher references, private storage objects (metadata only), firm profiles, shared budgets/shared expenses, households, and household members.
  - The export format is versioned (`finance-project-backup-v1` or `v2`).
- **Import/Restore**:
  - `previewProjectBackup` validates the backup envelope (if encrypted) and checks compatibility without writing to the database.
  - `restoreProjectBackup` creates a new project (or restores to an existing one if allowed) and inserts all exported data within a transaction.
  - The restore process respects foreign key constraints and unique constraints by inserting in dependency order (as seen in the export structure: users first, then projects, then accounts/categories, etc.).
  - Conflicts (e.g., duplicate project names) are handled by the application logic (e.g., requiring a `confirmation: "RESTORE_NEW_PROJECT"` for new projects).
- **Metadata-Only for Private Storage**: The `financePrivateStorageObjects` table stores metadata (keys, kind, scope, etc.) but not the actual file bytes, which are stored in the configured cloud storage (Supabase or Vercel Blob). Backups include this metadata, allowing the system to restore references to the actual blobs.
- **Consistency**: Backups are transactional at the database level (though file export/upload is outside the transaction). Restores are transactional for the database inserts.
- **Schedule and Trigger**: Backups can be triggered manually via the API (`triggerCloudBackup`) or presumably via scheduled tasks (cron). The system does not automate backups but provides the tools for users or administrators to implement them.
- **Validation**: The backup envelope (IV, encrypted data, authentication tag) is verified before any database operation during restore, ensuring integrity and authenticity.
- **Cloud Provider Agnosticism**: The backup service abstracts the cloud storage provider (Supabase or Vercel Blob) via the `getCloudStorageConfig` and `executeCloudBackup` functions.

Backup compatibility is strong, with the system designed to support safe, consistent export and import of project data, enabling users to migrate between instances or archive data securely.

## Conclusion

The Money Tracker database demonstrates strong integrity properties:
- Relationships are well-defined and enforced via foreign keys.
- Unique constraints prevent duplication where business logic demands it.
- Transactions ensure atomicity for all critical operations.
- Indexing supports efficient query patterns across the application.
- Monetary precision is maintained using fixed-point decimals and integer-cent arithmetic.
- Migrations are applied consistently and never rewritten in production.
- Orphan prevention is achieved through a combination of RESTRICT, CASCADE, SET NULL, and immutable-by-design tables.
- Concurrent write safety is ensured via transactions, row locking, status guarding, and idempotency keys.
- Data retention favors immutability for financial logs and audit trails, with soft deletes for active records.
- Backup and restore functionality is robust, supporting both plaintext and encrypted exports with validation.

No critical weaknesses were identified; the database layer is fit for purpose as the foundation of a personal/business finance application.
