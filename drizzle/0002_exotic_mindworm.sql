CREATE TABLE `finance_projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `finance_projects_id` PRIMARY KEY(`id`),
  CONSTRAINT `finance_projects_user_name_unique` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actorUserId` int NOT NULL,
  `projectId` int,
  `action` enum('create','update','delete') NOT NULL,
  `entityType` varchar(80) NOT NULL,
  `entityId` int,
  `summary` varchar(300) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `finance_projects` (`userId`, `name`)
SELECT `id`, 'Face Two Button' FROM `users`
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD `projectId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_bills` ADD `projectId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD `projectId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD `projectId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `projectId` int NULL;
--> statement-breakpoint
UPDATE `finance_accounts` AS r JOIN `finance_projects` AS p ON p.`userId` = r.`userId` AND p.`name` = 'Face Two Button' SET r.`projectId` = p.`id`;
--> statement-breakpoint
UPDATE `finance_bills` AS r JOIN `finance_projects` AS p ON p.`userId` = r.`userId` AND p.`name` = 'Face Two Button' SET r.`projectId` = p.`id`;
--> statement-breakpoint
UPDATE `finance_budgets` AS r JOIN `finance_projects` AS p ON p.`userId` = r.`userId` AND p.`name` = 'Face Two Button' SET r.`projectId` = p.`id`;
--> statement-breakpoint
UPDATE `finance_categories` AS r JOIN `finance_projects` AS p ON p.`userId` = r.`userId` AND p.`name` = 'Face Two Button' SET r.`projectId` = p.`id`;
--> statement-breakpoint
UPDATE `finance_transactions` AS r JOIN `finance_projects` AS p ON p.`userId` = r.`userId` AND p.`name` = 'Face Two Button' SET r.`projectId` = p.`id`;
--> statement-breakpoint
ALTER TABLE `finance_accounts` MODIFY `projectId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_bills` MODIFY `projectId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_budgets` MODIFY `projectId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_categories` MODIFY `projectId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` MODIFY `projectId` int NOT NULL;
--> statement-breakpoint
CREATE INDEX `finance_accounts_user_project_idx` ON `finance_accounts` (`userId`,`projectId`);
--> statement-breakpoint
CREATE INDEX `finance_bills_user_project_due_idx` ON `finance_bills` (`userId`,`projectId`,`dueAt`);
--> statement-breakpoint
CREATE INDEX `finance_budgets_user_project_month_idx` ON `finance_budgets` (`userId`,`projectId`,`monthKey`);
--> statement-breakpoint
CREATE INDEX `finance_categories_user_project_idx` ON `finance_categories` (`userId`,`projectId`);
--> statement-breakpoint
CREATE INDEX `finance_transactions_user_project_date_idx` ON `finance_transactions` (`userId`,`projectId`,`occurredAt`);
--> statement-breakpoint
CREATE INDEX `finance_transactions_user_project_type_idx` ON `finance_transactions` (`userId`,`projectId`,`type`);
--> statement-breakpoint
ALTER TABLE `finance_budgets` DROP INDEX `finance_budgets_user_category_month_unique`;
--> statement-breakpoint
ALTER TABLE `finance_categories` DROP INDEX `finance_categories_user_name_type_unique`;
--> statement-breakpoint
DROP INDEX `finance_accounts_user_idx` ON `finance_accounts`;
--> statement-breakpoint
DROP INDEX `finance_bills_user_due_idx` ON `finance_bills`;
--> statement-breakpoint
DROP INDEX `finance_budgets_user_month_idx` ON `finance_budgets`;
--> statement-breakpoint
DROP INDEX `finance_categories_user_idx` ON `finance_categories`;
--> statement-breakpoint
DROP INDEX `finance_transactions_user_date_idx` ON `finance_transactions`;
--> statement-breakpoint
DROP INDEX `finance_transactions_user_type_idx` ON `finance_transactions`;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_user_project_category_month_unique` UNIQUE(`userId`,`projectId`,`categoryId`,`monthKey`);
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_user_project_name_type_unique` UNIQUE(`userId`,`projectId`,`name`,`type`);
--> statement-breakpoint
ALTER TABLE `finance_projects` ADD CONSTRAINT `finance_projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_bills` ADD CONSTRAINT `finance_bills_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `finance_projects_user_idx` ON `finance_projects` (`userId`);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorUserId`);
--> statement-breakpoint
CREATE INDEX `audit_logs_project_idx` ON `audit_logs` (`projectId`);
--> statement-breakpoint
