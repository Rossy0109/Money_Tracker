-- Repair migration: schema drift convergence.
--
-- Audit (fresh-chain rehearsal + information_schema) proved these objects were
-- never created by migrations 0000-0015 even though drizzle/schema.ts and the
-- e2e bootstrap define them:
--   * 4 missing tables (used by voucher posting, CoA, fiscal calendar, bank recon)
--   * 21 missing columns (audit trail, isActive flags, voucher workflow fields)
--   * 3 narrowed enums that reject values the code writes (voucher submit /
--     approve / reverse and audit login/backup actions fail on migrated DBs)
--
-- NOTES:
--   * finance_vouchers.status keeps legacy 'cancelled' as a stored value even
--     though no code writes it anymore (superset avoids touching history rows).
--   * Constraint names stay <= 64 chars (MySQL/TiDB limit); see 0011 which
--     failed on overlong names.
--   * Idempotent under scripts/reconcile-migrations.mjs (already-exists skip).
CREATE TABLE `finance_account_groups` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `projectId` int NOT NULL,
  `accountTypeId` int NOT NULL,
  `parentId` int NULL,
  `code` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `nameBn` varchar(120),
  `description` varchar(500),
  `sortOrder` int NOT NULL DEFAULT 0,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `finance_account_groups_project_code_unique` (`projectId`, `code`),
  CONSTRAINT `finance_account_groups_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_account_groups_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_account_groups_acctype_fk` FOREIGN KEY (`accountTypeId`) REFERENCES `finance_account_types`(`id`) ON DELETE restrict ON UPDATE no action
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `finance_fiscal_periods` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `projectId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `startDate` timestamp NOT NULL,
  `endDate` timestamp NOT NULL,
  `status` enum('open','closed','locked') NOT NULL DEFAULT 'open',
  `closedAt` timestamp NULL,
  `closedBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `finance_fiscal_periods_project_name_unique` (`projectId`, `name`),
  CONSTRAINT `finance_fiscal_periods_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_fiscal_periods_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_fiscal_periods_closedBy_users_id_fk` FOREIGN KEY (`closedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `finance_journal_entries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `voucherId` int NOT NULL,
  `projectId` int NOT NULL,
  `journalNo` varchar(80) NOT NULL,
  `date` timestamp NOT NULL,
  `narration` varchar(500),
  `totalDebit` decimal(18,2) NOT NULL,
  `totalCredit` decimal(18,2) NOT NULL,
  `status` enum('draft','posted','reversed') NOT NULL DEFAULT 'draft',
  `postedBy` int NULL,
  `postedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `finance_journal_entries_voucher_unique` (`voucherId`),
  UNIQUE KEY `finance_journal_entries_no_unique` (`projectId`, `journalNo`),
  CONSTRAINT `finance_journal_entries_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_journal_entries_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action,
  CONSTRAINT `finance_journal_entries_postedBy_users_id_fk` FOREIGN KEY (`postedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) ENGINE=InnoDB;
--> statement-breakpoint
CREATE TABLE `finance_journal_lines` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `journalEntryId` int NOT NULL,
  `accountId` int NOT NULL,
  `entryType` enum('debit','credit') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `narration` varchar(300),
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `finance_journal_lines_entry_fk` FOREIGN KEY (`journalEntryId`) REFERENCES `finance_journal_entries`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `finance_journal_lines_coa_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_chart_of_accounts`(`id`) ON DELETE restrict ON UPDATE no action
) ENGINE=InnoDB;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `actorRole` varchar(20) NOT NULL DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `oldData` json NULL;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `newData` json NULL;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `ipAddress` varchar(45) NULL;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `userAgent` text NULL;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD COLUMN `requestId` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD COLUMN `isActive` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD COLUMN `isActive` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `finance_projects` ADD COLUMN `isActive` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `voucherType` varchar(30) NOT NULL DEFAULT 'general';
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `fiscalPeriodId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `submittedBy` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `submittedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `approvedBy` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `approvedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `postedBy` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `postedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `reversedBy` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `reversedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `reversalReference` varchar(120) NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD COLUMN `isArchived` tinyint(1) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_fiscalPeriodId_finance_fiscal_periods_id_fk` FOREIGN KEY (`fiscalPeriodId`) REFERENCES `finance_fiscal_periods`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` DROP FOREIGN KEY `finance_vouchers_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` DROP FOREIGN KEY `finance_vouchers_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_submittedBy_users_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_postedBy_users_id_fk` FOREIGN KEY (`postedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_reversedBy_users_id_fk` FOREIGN KEY (`reversedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `action` enum('create','update','delete','delete_attempt','approve','reject','post','reverse','login','logout','login_failed','permission_denied','user_suspended','backup_created','backup_restored') NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_voucher_audit` MODIFY COLUMN `action` enum('create','submit','approve','post','cancel','reverse') NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_vouchers` MODIFY COLUMN `status` enum('draft','submitted','approved','posted','reversed','cancelled') NOT NULL DEFAULT 'draft';
