CREATE TABLE `finance_ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucherId` int NOT NULL,
	`accountId` int NOT NULL,
	`entryType` enum('debit','credit') NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`runningBalance` decimal(15,2) NOT NULL,
	`postedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_voucher_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucherId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`action` enum('create','post','cancel','reverse') NOT NULL,
	`snapshot` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_voucher_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_voucher_credits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucherId` int NOT NULL,
	`accountId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`narration` varchar(300),
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `finance_voucher_credits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_voucher_debits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucherId` int NOT NULL,
	`accountId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`narration` varchar(300),
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `finance_voucher_debits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_voucher_references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`voucherId` int NOT NULL,
	`refType` enum('cheque','bill','invoice','challan','other') NOT NULL,
	`refNumber` varchar(120) NOT NULL,
	`refDate` timestamp,
	`relatedEntityType` varchar(50),
	`relatedEntityId` int,
	CONSTRAINT `finance_voucher_references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_vouchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`voucherNo` varchar(80) NOT NULL,
	`date` timestamp NOT NULL,
	`narration` varchar(500),
	`totalDebit` decimal(15,2) NOT NULL DEFAULT '0.00',
	`totalCredit` decimal(15,2) NOT NULL DEFAULT '0.00',
	`status` enum('draft','posted','cancelled') NOT NULL DEFAULT 'posted',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_vouchers_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_vouchers_project_voucher_unique` UNIQUE(`projectId`,`voucherNo`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','input_only') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` ADD CONSTRAINT `finance_ledger_entries_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` ADD CONSTRAINT `finance_ledger_entries_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_audit` ADD CONSTRAINT `finance_voucher_audit_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_audit` ADD CONSTRAINT `finance_voucher_audit_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_credits` ADD CONSTRAINT `finance_voucher_credits_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_credits` ADD CONSTRAINT `finance_voucher_credits_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_debits` ADD CONSTRAINT `finance_voucher_debits_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_debits` ADD CONSTRAINT `finance_voucher_debits_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_references` ADD CONSTRAINT `finance_voucher_references_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_ledger_account_date_idx` ON `finance_ledger_entries` (`accountId`,`postedAt`);--> statement-breakpoint
CREATE INDEX `finance_ledger_voucher_idx` ON `finance_ledger_entries` (`voucherId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_audit_voucher_idx` ON `finance_voucher_audit` (`voucherId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_audit_actor_idx` ON `finance_voucher_audit` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_credits_voucher_idx` ON `finance_voucher_credits` (`voucherId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_credits_account_idx` ON `finance_voucher_credits` (`accountId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_debits_voucher_idx` ON `finance_voucher_debits` (`voucherId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_debits_account_idx` ON `finance_voucher_debits` (`accountId`);--> statement-breakpoint
CREATE INDEX `finance_voucher_references_voucher_idx` ON `finance_voucher_references` (`voucherId`);--> statement-breakpoint
CREATE INDEX `finance_vouchers_user_project_date_idx` ON `finance_vouchers` (`userId`,`projectId`,`date`);