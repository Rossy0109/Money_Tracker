CREATE TABLE `drive_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rootFolderName` varchar(255) NOT NULL DEFAULT 'Money_Tracker',
	`rootFolderId` varchar(255),
	`scope` varchar(512),
	`accessTokenEnc` text,
	`refreshTokenEnc` text,
	`tokenExpiresAt` timestamp,
	`lastVerifiedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drive_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `drive_connections_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `drive_connections` ADD CONSTRAINT `drive_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;