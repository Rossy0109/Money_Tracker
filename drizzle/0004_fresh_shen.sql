CREATE TABLE `finance_voucher_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`prefix` varchar(24) NOT NULL DEFAULT 'V',
	`startNumber` int NOT NULL DEFAULT 1,
	`endNumber` int NOT NULL DEFAULT 999999,
	`nextNumber` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_voucher_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_voucher_settings_user_project_unique` UNIQUE(`userId`,`projectId`)
);
--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` ADD CONSTRAINT `finance_voucher_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` ADD CONSTRAINT `finance_voucher_settings_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;