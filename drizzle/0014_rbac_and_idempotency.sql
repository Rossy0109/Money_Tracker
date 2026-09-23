-- 0014: RBAC tables + persistent idempotency keys.
--
-- SAFETY: every statement is additive and idempotent. An already-migrated
-- database (e.g. the legacy `/api/debug/apply-rbac` route or a partial manual
-- apply) simply skips existing tables via `IF NOT EXISTS`. No existing data,
-- table, or constraint is dropped, truncated, or renamed.
--
-- These tables were missing from the previous migration journal and are
-- required by the error-safe-to-run RBAC + idempotency middleware.

CREATE TABLE IF NOT EXISTS `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`description` text,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_name_unique` UNIQUE(`name`),
	INDEX `permissions_category_idx` (`category`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`roleId` int NOT NULL,
	`assignedBy` int,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_roles_user_role_unique` UNIQUE(`userId`,`roleId`),
	CONSTRAINT `user_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `user_roles_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `user_roles_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
	INDEX `user_roles_user_id_idx` (`userId`),
	INDEX `user_roles_role_id_idx` (`roleId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roleId` int NOT NULL,
	`permissionId` int NOT NULL,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permissions_role_permission_unique` UNIQUE(`roleId`,`permissionId`),
	CONSTRAINT `role_permissions_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `role_permissions_permissionId_permissions_id_fk` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action,
	INDEX `role_permissions_role_id_idx` (`roleId`),
	INDEX `role_permissions_permission_id_idx` (`permissionId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `idempotency_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`idempotencyKey` varchar(255) NOT NULL,
	`route` varchar(200) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`responseStatus` int NOT NULL,
	`responseBody` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_keys_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `idempotency_keys_user_key_unique` UNIQUE(`userId`,`idempotencyKey`),
	INDEX `idempotency_keys_expires_idx` (`expiresAt`),
	INDEX `idempotency_keys_user_route_idx` (`userId`,`route`)
);
--> statement-breakpoint