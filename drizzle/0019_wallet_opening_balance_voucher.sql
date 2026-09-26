ALTER TABLE `finance_accounts` ADD COLUMN IF NOT EXISTS `openingBalanceVoucherId` int NULL;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_openingBalanceVoucherId_finance_vouchers_id_fk` FOREIGN KEY (`openingBalanceVoucherId`) REFERENCES `finance_vouchers` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_accounts' AND constraint_name = 'finance_accounts_openingBalanceVoucherId_finance_vouchers_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `finance_accounts_opening_voucher_idx` ON `finance_accounts` (`openingBalanceVoucherId`);
