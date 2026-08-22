CREATE TABLE `finance_household_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`userId` int,
	`inviteeEmail` varchar(320) NOT NULL,
	`displayName` varchar(120),
	`role` enum('editor','viewer') NOT NULL DEFAULT 'viewer',
	`status` enum('pending','active','declined','revoked') NOT NULL DEFAULT 'pending',
	`invitedByUserId` int NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_household_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_household_member_email_unique` UNIQUE(`householdId`,`inviteeEmail`),
	CONSTRAINT `finance_household_member_user_unique` UNIQUE(`householdId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `finance_households` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_households_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_households_owner_name_unique` UNIQUE(`ownerUserId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `finance_shared_budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_shared_budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_shared_budgets_household_label_month_unique` UNIQUE(`householdId`,`label`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `finance_shared_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`householdId` int NOT NULL,
	`budgetId` int NOT NULL,
	`contributorUserId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`note` varchar(500),
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_shared_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_households` ADD CONSTRAINT `finance_households_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` ADD CONSTRAINT `finance_shared_budgets_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` ADD CONSTRAINT `finance_shared_budgets_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_budgetId_finance_shared_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `finance_shared_budgets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_contributorUserId_users_id_fk` FOREIGN KEY (`contributorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_household_members_user_status_idx` ON `finance_household_members` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_household_members_household_status_idx` ON `finance_household_members` (`householdId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_households_owner_idx` ON `finance_households` (`ownerUserId`);--> statement-breakpoint
CREATE INDEX `finance_shared_budgets_household_month_idx` ON `finance_shared_budgets` (`householdId`,`monthKey`);--> statement-breakpoint
CREATE INDEX `finance_shared_expenses_household_date_idx` ON `finance_shared_expenses` (`householdId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `finance_shared_expenses_budget_idx` ON `finance_shared_expenses` (`budgetId`);--> statement-breakpoint
CREATE INDEX `finance_shared_expenses_contributor_idx` ON `finance_shared_expenses` (`contributorUserId`);