CREATE TABLE `rate_limit_counters` (
	`key` varchar(191) NOT NULL,
	`count` int NOT NULL,
	`resetAt` bigint NOT NULL,
	CONSTRAINT `rate_limit_counters_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_counters_reset_at_idx` ON `rate_limit_counters` (`resetAt`);