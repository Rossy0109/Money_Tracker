CREATE TABLE `finance_account_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(10) NOT NULL,
	`name` varchar(60) NOT NULL,
	`nameBn` varchar(60),
	`normalBalance` enum('debit','credit') NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_account_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_account_types_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `finance_bank_reconciliation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reconciliationId` int NOT NULL,
	`ledgerEntryId` int,
	`statementRef` varchar(120),
	`statementDate` timestamp,
	`statementAmount` decimal(15,2),
	`statementType` enum('debit','credit'),
	`matched` boolean NOT NULL DEFAULT false,
	`matchedAt` timestamp,
	`notes` varchar(300),
	CONSTRAINT `finance_bank_reconciliation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_bank_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`accountId` int NOT NULL,
	`statementDate` timestamp NOT NULL,
	`statementBalance` decimal(15,2) NOT NULL,
	`bookBalance` decimal(15,2) NOT NULL,
	`difference` decimal(15,2) NOT NULL DEFAULT '0.00',
	`status` enum('in_progress','completed','unreconciled') NOT NULL DEFAULT 'in_progress',
	`reconciledAt` timestamp,
	`reconciledBy` int,
	`notes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_bank_reconciliations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_chart_of_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`accountTypeId` int NOT NULL,
	`parentId` int,
	`code` varchar(30) NOT NULL,
	`name` varchar(120) NOT NULL,
	`nameBn` varchar(120),
	`description` varchar(500),
	`isActive` boolean NOT NULL DEFAULT true,
	`isDetail` boolean NOT NULL DEFAULT true,
	`openingBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_chart_of_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_chart_of_accounts_project_code_unique` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `finance_period_locks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`lockedAt` timestamp NOT NULL DEFAULT (now()),
	`lockedBy` int NOT NULL,
	`reason` varchar(300),
	CONSTRAINT `finance_period_locks_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_period_locks_project_month_unique` UNIQUE(`projectId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `finance_voucher_reversals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`originalVoucherId` int NOT NULL,
	`reversalVoucherId` int NOT NULL,
	`reason` varchar(500) NOT NULL,
	`reversedAt` timestamp NOT NULL DEFAULT (now()),
	`reversedBy` int NOT NULL,
	CONSTRAINT `finance_voucher_reversals_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_voucher_reversals_original_unique` UNIQUE(`originalVoucherId`)
);
--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliation_items` ADD CONSTRAINT `finance_bank_reconciliation_items_reconciliationId_finance_bank_reconciliations_id_fk` FOREIGN KEY (`reconciliationId`) REFERENCES `finance_bank_reconciliations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliation_items` ADD CONSTRAINT `finance_bank_reconciliation_items_ledgerEntryId_finance_ledger_entries_id_fk` FOREIGN KEY (`ledgerEntryId`) REFERENCES `finance_ledger_entries`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_accountId_finance_chart_of_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_chart_of_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_reconciledBy_users_id_fk` FOREIGN KEY (`reconciledBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_accountTypeId_finance_account_types_id_fk` FOREIGN KEY (`accountTypeId`) REFERENCES `finance_account_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_period_locks` ADD CONSTRAINT `finance_period_locks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_period_locks` ADD CONSTRAINT `finance_period_locks_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_period_locks` ADD CONSTRAINT `finance_period_locks_lockedBy_users_id_fk` FOREIGN KEY (`lockedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_originalVoucherId_finance_vouchers_id_fk` FOREIGN KEY (`originalVoucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_reversalVoucherId_finance_vouchers_id_fk` FOREIGN KEY (`reversalVoucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_reversedBy_users_id_fk` FOREIGN KEY (`reversedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_bank_reconciliation_items_reconciliation_idx` ON `finance_bank_reconciliation_items` (`reconciliationId`);--> statement-breakpoint
CREATE INDEX `finance_bank_reconciliation_items_ledger_idx` ON `finance_bank_reconciliation_items` (`ledgerEntryId`);--> statement-breakpoint
CREATE INDEX `finance_bank_reconciliations_project_account_idx` ON `finance_bank_reconciliations` (`projectId`,`accountId`);--> statement-breakpoint
CREATE INDEX `finance_bank_reconciliations_status_idx` ON `finance_bank_reconciliations` (`status`);--> statement-breakpoint
CREATE INDEX `finance_chart_of_accounts_user_project_idx` ON `finance_chart_of_accounts` (`userId`,`projectId`);--> statement-breakpoint
CREATE INDEX `finance_chart_of_accounts_parent_idx` ON `finance_chart_of_accounts` (`parentId`);--> statement-breakpoint
CREATE INDEX `finance_chart_of_accounts_type_idx` ON `finance_chart_of_accounts` (`accountTypeId`);--> statement-breakpoint
CREATE INDEX `finance_period_locks_user_project_idx` ON `finance_period_locks` (`userId`,`projectId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_reversals_project_idx` ON `finance_voucher_reversals` (`projectId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_reversals_reversal_idx` ON `finance_voucher_reversals` (`reversalVoucherId`);