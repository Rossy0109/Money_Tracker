CREATE TABLE `finance_firm_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL DEFAULT '',
	`tagline` varchar(240) NOT NULL DEFAULT '',
	`phone` varchar(40) NOT NULL DEFAULT '',
	`email` varchar(320) NOT NULL DEFAULT '',
	`address` varchar(500) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_firm_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_firm_profiles_user_project_unique` UNIQUE(`userId`,`projectId`)
);
--> statement-breakpoint
ALTER TABLE `finance_firm_profiles` ADD CONSTRAINT `finance_firm_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_firm_profiles` ADD CONSTRAINT `finance_firm_profiles_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_firm_profiles_project_idx` ON `finance_firm_profiles` (`projectId`);