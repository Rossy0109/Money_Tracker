CREATE TABLE `failed_login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 1,
	`firstAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`lastAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`lockedUntil` timestamp,
	CONSTRAINT `failed_login_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `failed_login_attempts_identifier_ip_unique` UNIQUE(`identifier`,`ipAddress`)
);
--> statement-breakpoint
CREATE TABLE `login_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`loginMethod` varchar(64) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`userAgent` text,
	`success` boolean NOT NULL,
	`failureReason` varchar(255),
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionToken` varchar(255) NOT NULL,
	`refreshToken` varchar(255) NOT NULL,
	`userAgent` text,
	`ipAddress` varchar(45),
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_sessionToken_unique` UNIQUE(`sessionToken`),
	CONSTRAINT `user_sessions_refreshToken_unique` UNIQUE(`refreshToken`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `login_history` ADD CONSTRAINT `login_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `failed_login_attempts_locked_until_idx` ON `failed_login_attempts` (`lockedUntil`);--> statement-breakpoint
CREATE INDEX `login_history_user_id_idx` ON `login_history` (`userId`);--> statement-breakpoint
CREATE INDEX `login_history_attempted_at_idx` ON `login_history` (`attemptedAt`);--> statement-breakpoint
CREATE INDEX `login_history_success_idx` ON `login_history` (`success`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_id_idx` ON `user_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `user_sessions_session_token_idx` ON `user_sessions` (`sessionToken`);--> statement-breakpoint
CREATE INDEX `user_sessions_refresh_token_idx` ON `user_sessions` (`refreshToken`);--> statement-breakpoint
CREATE INDEX `user_sessions_expires_at_idx` ON `user_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `user_sessions_revoked_at_idx` ON `user_sessions` (`revokedAt`);