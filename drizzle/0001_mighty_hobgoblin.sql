CREATE TABLE `finance_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('cash','bank','mobile') NOT NULL,
	`openingBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_bills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`dueAt` timestamp NOT NULL,
	`isPaid` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_bills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_budgets_user_category_month_unique` UNIQUE(`userId`,`categoryId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `finance_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_categories_user_name_type_unique` UNIQUE(`userId`,`name`,`type`)
);
--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int,
	`categoryId` int NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`paymentMethod` varchar(100) NOT NULL,
	`note` varchar(500),
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_bills` ADD CONSTRAINT `finance_bills_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_categoryId_finance_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_categoryId_finance_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_accounts_user_idx` ON `finance_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `finance_bills_user_due_idx` ON `finance_bills` (`userId`,`dueAt`);--> statement-breakpoint
CREATE INDEX `finance_budgets_user_month_idx` ON `finance_budgets` (`userId`,`monthKey`);--> statement-breakpoint
CREATE INDEX `finance_categories_user_idx` ON `finance_categories` (`userId`);--> statement-breakpoint
CREATE INDEX `finance_transactions_user_date_idx` ON `finance_transactions` (`userId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `finance_transactions_user_type_idx` ON `finance_transactions` (`userId`,`type`);--> statement-breakpoint
CREATE INDEX `finance_transactions_account_idx` ON `finance_transactions` (`accountId`);