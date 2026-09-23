-- Phase 8: Database Integrity Migration
-- Safe migration: additive-only, no destructive changes, no data loss.
-- Review: foreign keys, indexes, unique constraints, nullability, decimal precision, transactions.

-- ============================================================
-- 1. NEW COLUMNS (additive, safe defaults)
-- ============================================================

-- 1a. Soft-delete column for projects
ALTER TABLE finance_projects
  ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER updatedAt;

-- 1b. Soft-delete column for accounts
ALTER TABLE finance_accounts
  ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER updatedAt;

-- 1c. Soft-delete column for categories
ALTER TABLE finance_categories
  ADD COLUMN isActive TINYINT(1) NOT NULL DEFAULT 1 AFTER isDefault;

-- 1d. Archive column for vouchers
ALTER TABLE finance_vouchers
  ADD COLUMN isArchived TINYINT(1) NOT NULL DEFAULT 0 AFTER reversalReference;

-- 1e. Voucher type column (if not already present from Phase 6/7)
-- ALTER TABLE finance_vouchers
--   ADD COLUMN voucherType VARCHAR(30) NOT NULL DEFAULT 'general' AFTER status;

-- ============================================================
-- 2. SAFE INDEX ADDITIONS (additive, no data loss)
-- ============================================================

-- 2a. Composite index for ledger account+voucher lookups
CREATE INDEX finance_ledger_account_voucher_idx
  ON finance_ledger_entries (accountId, voucherId);

-- 2b. Active flag indexes for filtering
CREATE INDEX finance_projects_active_idx
  ON finance_projects (isActive);
CREATE INDEX finance_accounts_active_idx
  ON finance_accounts (isActive);
CREATE INDEX finance_categories_active_idx
  ON finance_categories (isActive);

-- 2c. Voucher debits/credits composite indexes for joined lookups
CREATE INDEX finance_voucher_debits_voucher_account_idx
  ON finance_voucher_debits (voucherId, accountId);
CREATE INDEX finance_voucher_credits_voucher_account_idx
  ON finance_voucher_credits (voucherId, accountId);

-- ============================================================
-- 3. UNIQUE CONSTRAINTS (prevent duplicates)
-- ============================================================

-- 3a. Prevent duplicate account names per user+project
-- NOTE: Only safe if no duplicates exist. Run dedup first if needed:
-- SELECT userId, projectId, name, COUNT(*) FROM finance_accounts
--   GROUP BY userId, projectId, name HAVING COUNT(*) > 1;
-- ALTER TABLE finance_accounts
--   ADD UNIQUE INDEX finance_accounts_user_project_name_unique (userId, projectId, name);

-- ============================================================
-- 4. FOREIGN KEY HARDENING
-- ============================================================
-- The following foreign keys were changed from CASCADE to RESTRICT
-- in the Drizzle schema definition. These changes take effect when
-- the schema is regenerated and pushed via drizzle-kit.
--
-- Tables affected (userId/projectId changed from ON DELETE CASCADE → RESTRICT):
--   finance_projects           → userId references users.id (RESTRICT)
--   finance_vouchers           → userId, projectId (RESTRICT)
--   finance_voucher_settings   → userId, projectId (RESTRICT)
--   finance_accounts           → userId, projectId (RESTRICT)
--   finance_categories         → userId, projectId (RESTRICT)
--   finance_transactions       → userId, projectId (RESTRICT)
--   finance_dues               → userId, projectId (RESTRICT)
--   finance_due_settlements    → userId, projectId (RESTRICT)
--   finance_budgets            → userId, projectId (RESTRICT), categoryId (RESTRICT)
--   finance_bills              → userId, projectId (RESTRICT)
--   finance_recurring_transactions → userId, projectId (RESTRICT)
--   finance_invoices           → userId, projectId (RESTRICT)
--   finance_inventory_items    → userId, projectId (RESTRICT)
--   finance_employees          → userId, projectId (RESTRICT)
--   finance_salary_payments    → userId, projectId (RESTRICT)
--   finance_employee_advances  → userId, projectId (RESTRICT)
--   finance_voucher_reversals  → userId, projectId (RESTRICT)
--   finance_bank_reconciliations → userId, projectId (RESTRICT)
--   finance_period_locks       → userId, projectId (RESTRICT)
--   finance_fiscal_periods     → userId (RESTRICT)
--
-- Child records of vouchers changed from CASCADE → RESTRICT:
--   finance_ledger_entries     → voucherId (RESTRICT — immutable)
--   finance_journal_entries    → voucherId, projectId (RESTRICT)
--   finance_voucher_references → voucherId (RESTRICT)
--   finance_voucher_audit      → voucherId (RESTRICT — immutable audit trail)
--
-- Kept as CASCADE (deleting parent deletes children — same entity):
--   finance_voucher_debits     → voucherId (CASCADE)
--   finance_voucher_credits    → voucherId (CASCADE)
--   finance_journal_lines      → journalEntryId (CASCADE)

-- ============================================================
-- 5. TRANSACTION BOUNDARY FIXES (code-level, not SQL)
-- ============================================================
-- reverseVoucher() was refactored to wrap all writes in a single
-- db.transaction() block: reversal voucher creation + reversal
-- record + original voucher status update + audit entry.
-- All succeed together or rollback together.
--
-- createVoucherWithEntries() already used a single transaction.
-- postVoucher() already uses a single transaction.

-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm integrity)
-- ============================================================

-- Check for orphaned ledger entries (should be 0):
-- SELECT COUNT(*) FROM finance_ledger_entries le
--   LEFT JOIN finance_vouchers v ON v.id = le.voucherId
--   WHERE v.id IS NULL;

-- Check for orphaned journal entries:
-- SELECT COUNT(*) FROM finance_journal_entries je
--   LEFT JOIN finance_vouchers v ON v.id = je.voucherId
--   WHERE v.id IS NULL;

-- Check for orphaned audit entries:
-- SELECT COUNT(*) FROM finance_voucher_audit va
--   LEFT JOIN finance_vouchers v ON v.id = va.voucherId
--   WHERE v.id IS NULL;

-- Check for duplicate account names:
-- SELECT userId, projectId, name, COUNT(*) FROM finance_accounts
--   GROUP BY userId, projectId, name HAVING COUNT(*) > 1;
