-- Repair migration: 18 secondary indexes that exist in schema.ts but were
-- never emitted by any migration (same drift class as 0016). Includes the
-- finance_accounts per-project name uniqueness guard. All names fit the
-- 64-char MySQL/TiDB limit. Safe to re-run: plain CREATE INDEX / ADD UNIQUE
-- fail on duplicates, and scripts/reconcile-migrations.mjs skips those.
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`);
--> statement-breakpoint
CREATE INDEX `finance_account_groups_user_project_idx` ON `finance_account_groups` (`userId`,`projectId`);
--> statement-breakpoint
CREATE INDEX `finance_account_groups_type_idx` ON `finance_account_groups` (`accountTypeId`);
--> statement-breakpoint
CREATE INDEX `finance_account_groups_parent_idx` ON `finance_account_groups` (`parentId`);
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_user_project_name_unique` UNIQUE(`userId`,`projectId`,`name`);
--> statement-breakpoint
CREATE INDEX `finance_accounts_active_idx` ON `finance_accounts` (`isActive`);
--> statement-breakpoint
CREATE INDEX `finance_categories_active_idx` ON `finance_categories` (`isActive`);
--> statement-breakpoint
CREATE INDEX `finance_fiscal_periods_user_project_idx` ON `finance_fiscal_periods` (`userId`,`projectId`);
--> statement-breakpoint
CREATE INDEX `finance_fiscal_periods_status_idx` ON `finance_fiscal_periods` (`projectId`,`status`);
--> statement-breakpoint
CREATE INDEX `finance_fiscal_periods_dates_idx` ON `finance_fiscal_periods` (`projectId`,`startDate`,`endDate`);
--> statement-breakpoint
CREATE INDEX `finance_journal_entries_project_date_idx` ON `finance_journal_entries` (`projectId`,`date`);
--> statement-breakpoint
CREATE INDEX `finance_journal_entries_status_idx` ON `finance_journal_entries` (`status`);
--> statement-breakpoint
CREATE INDEX `finance_journal_lines_entry_idx` ON `finance_journal_lines` (`journalEntryId`);
--> statement-breakpoint
CREATE INDEX `finance_journal_lines_account_idx` ON `finance_journal_lines` (`accountId`);
--> statement-breakpoint
CREATE INDEX `finance_ledger_account_voucher_idx` ON `finance_ledger_entries` (`accountId`,`voucherId`);
--> statement-breakpoint
CREATE INDEX `finance_projects_active_idx` ON `finance_projects` (`isActive`);
--> statement-breakpoint
CREATE INDEX `finance_vouchers_status_idx` ON `finance_vouchers` (`projectId`,`status`);
--> statement-breakpoint
CREATE INDEX `finance_vouchers_fiscal_period_idx` ON `finance_vouchers` (`fiscalPeriodId`);
