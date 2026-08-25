CREATE TABLE `finance_private_storage_objects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`projectId` int,
	`householdId` int,
	`storageKey` varchar(512) NOT NULL,
	`kind` enum('backup','export') NOT NULL,
	`scope` enum('owner','household') NOT NULL,
	`contentType` varchar(160) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`sizeBytes` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_private_storage_objects_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_private_storage_key_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_private_storage_owner_created_idx` ON `finance_private_storage_objects` (`ownerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `finance_private_storage_project_created_idx` ON `finance_private_storage_objects` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `finance_private_storage_household_created_idx` ON `finance_private_storage_objects` (`householdId`,`createdAt`);