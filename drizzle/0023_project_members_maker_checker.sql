CREATE TABLE `finance_project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int,
	`inviteeEmail` varchar(320) NOT NULL,
	`displayName` varchar(120),
	`role` enum('maker','checker') NOT NULL DEFAULT 'maker',
	`status` enum('pending','active','declined','revoked') NOT NULL DEFAULT 'pending',
	`invitedByUserId` int NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_project_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_project_member_email_unique` UNIQUE(`projectId`,`inviteeEmail`),
	CONSTRAINT `finance_project_member_user_unique` UNIQUE(`projectId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `finance_project_members` ADD CONSTRAINT `finance_project_members_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_project_members` ADD CONSTRAINT `finance_project_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_project_members` ADD CONSTRAINT `finance_project_members_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_project_members_user_status_idx` ON `finance_project_members` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_project_members_project_status_idx` ON `finance_project_members` (`projectId`,`status`);--> statement-breakpoint
ALTER TABLE `finance_vouchers` ADD CONSTRAINT `finance_vouchers_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;