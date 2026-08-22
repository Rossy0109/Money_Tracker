CREATE TABLE `finance_recurring_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`accountId` int,
	`categoryId` int NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`paymentMethod` varchar(100) NOT NULL,
	`note` varchar(500),
	`frequency` enum('weekly','monthly') NOT NULL,
	`scheduleDay` int NOT NULL,
	`nextRunAt` timestamp NOT NULL,
	`lastGeneratedAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`scheduleCronTaskUid` varchar(65),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_recurring_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_recurring_schedule_cron_task_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
ALTER TABLE `finance_bills` ADD `reminderDaysBefore` int DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_bills` ADD `lastReminderAt` timestamp;--> statement-breakpoint
ALTER TABLE `finance_bills` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `finance_dues` ADD `dueAt` timestamp;--> statement-breakpoint
ALTER TABLE `finance_bills` ADD CONSTRAINT `finance_bills_schedule_cron_task_unique` UNIQUE(`scheduleCronTaskUid`);--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `finance_recurring_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `finance_recurring_transactions_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `finance_recurring_transactions_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `fin_rec_category_fk` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_recurring_user_project_next_idx` ON `finance_recurring_transactions` (`userId`,`projectId`,`isActive`,`nextRunAt`);--> statement-breakpoint
CREATE INDEX `finance_dues_user_project_due_idx` ON `finance_dues` (`userId`,`projectId`,`dueAt`);
