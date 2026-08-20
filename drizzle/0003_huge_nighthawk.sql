CREATE TABLE `finance_due_settlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`dueId` int NOT NULL,
	`accountId` int,
	`amount` decimal(15,2) NOT NULL,
	`voucherNo` varchar(80),
	`note` varchar(500),
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_due_settlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_dues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`type` enum('debt','receivable') NOT NULL,
	`counterparty` varchar(180) NOT NULL,
	`originalAmount` decimal(15,2) NOT NULL,
	`outstandingAmount` decimal(15,2) NOT NULL,
	`voucherNo` varchar(80),
	`reason` varchar(180),
	`note` varchar(500),
	`openedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_dues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `voucherNo` varchar(80);--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `reason` varchar(180);--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_dueId_finance_dues_id_fk` FOREIGN KEY (`dueId`) REFERENCES `finance_dues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_dues` ADD CONSTRAINT `finance_dues_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_dues` ADD CONSTRAINT `finance_dues_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_due_settlements_user_project_date_idx` ON `finance_due_settlements` (`userId`,`projectId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `finance_due_settlements_due_idx` ON `finance_due_settlements` (`dueId`);--> statement-breakpoint
CREATE INDEX `finance_due_settlements_account_idx` ON `finance_due_settlements` (`accountId`);--> statement-breakpoint
CREATE INDEX `finance_dues_user_project_type_idx` ON `finance_dues` (`userId`,`projectId`,`type`);--> statement-breakpoint
CREATE INDEX `finance_dues_user_project_opened_idx` ON `finance_dues` (`userId`,`projectId`,`openedAt`);