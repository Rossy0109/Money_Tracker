-- Migration 0014: RBAC Tables
-- Creates permissions, roles, user_roles, role_permissions tables

CREATE TABLE `permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `displayName` varchar(128) NOT NULL,
  `description` text,
  `category` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `permissions_name_unique` UNIQUE(`name`)
);

CREATE INDEX `permissions_category_idx` ON `permissions` (`category`);

CREATE TABLE `roles` (
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

CREATE INDEX `roles_name_idx` ON `roles` (`name`);

CREATE TABLE `user_roles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `roleId` int NOT NULL,
  `assignedBy` int,
  `assignedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `user_roles_id` PRIMARY KEY(`id`),
  CONSTRAINT `user_roles_user_role_unique` UNIQUE(`userId`,`roleId`)
);

CREATE INDEX `user_roles_user_id_idx` ON `user_roles` (`userId`);
CREATE INDEX `user_roles_role_id_idx` ON `user_roles` (`roleId`);

CREATE TABLE `role_permissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `roleId` int NOT NULL,
  `permissionId` int NOT NULL,
  CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `role_permissions_role_permission_unique` UNIQUE(`roleId`,`permissionId`)
);

CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`roleId`);
CREATE INDEX `role_permissions_permission_id_idx` ON `role_permissions` (`permissionId`);

ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_roleId_roles_id_fk` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permissionId_permissions_id_fk` FOREIGN KEY (`permissionId`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;
