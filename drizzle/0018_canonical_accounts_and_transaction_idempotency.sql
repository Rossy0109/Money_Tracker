ALTER TABLE `finance_accounts` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_voucher_debits` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_voucher_credits` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD COLUMN IF NOT EXISTS `chartOfAccountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD COLUMN IF NOT EXISTS `voucherId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD COLUMN IF NOT EXISTS `idempotencyKey` varchar(120) NULL;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD COLUMN IF NOT EXISTS `requestFingerprint` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD COLUMN IF NOT EXISTS `voucherId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD COLUMN IF NOT EXISTS `voucherId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD COLUMN IF NOT EXISTS `voucherId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_voucher_debits` MODIFY COLUMN `accountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_voucher_credits` MODIFY COLUMN `accountId` int NULL;
--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` MODIFY COLUMN `accountId` int NULL;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_debits` DROP FOREIGN KEY `finance_voucher_debits_accountId_finance_accounts_id_fk`', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_debits' AND constraint_name = 'finance_voucher_debits_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_credits` DROP FOREIGN KEY `finance_voucher_credits_accountId_finance_accounts_id_fk`', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_credits' AND constraint_name = 'finance_voucher_credits_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_ledger_entries` DROP FOREIGN KEY `finance_ledger_entries_accountId_finance_accounts_id_fk`', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_ledger_entries' AND constraint_name = 'finance_ledger_entries_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_debits` ADD CONSTRAINT `finance_voucher_debits_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_debits' AND constraint_name = 'finance_voucher_debits_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_credits` ADD CONSTRAINT `finance_voucher_credits_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_credits' AND constraint_name = 'finance_voucher_credits_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_ledger_entries` ADD CONSTRAINT `finance_ledger_entries_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_ledger_entries' AND constraint_name = 'finance_ledger_entries_accountId_finance_accounts_id_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
UPDATE `finance_accounts` AS fa
JOIN `finance_chart_of_accounts` AS coa
  ON coa.projectId = fa.projectId AND coa.code = CASE WHEN fa.type = 'cash' THEN '1110' ELSE '1120' END
SET fa.chartOfAccountId = coa.id
WHERE fa.chartOfAccountId IS NULL;
--> statement-breakpoint
UPDATE `finance_categories` AS fc
JOIN `finance_chart_of_accounts` AS coa
  ON coa.projectId = fc.projectId AND coa.code = CASE
    WHEN fc.type = 'income' THEN '4100'
    WHEN LOCATE('ভাড়া', fc.name) > 0 OR LOCATE('rent', LOWER(fc.name)) > 0 THEN '5120'
    WHEN LOCATE('ইউটিলিটি', fc.name) > 0 OR LOCATE('utilit', LOWER(fc.name)) > 0 THEN '5130'
    ELSE '5110'
  END
SET fc.chartOfAccountId = coa.id
WHERE fc.chartOfAccountId IS NULL;
--> statement-breakpoint
UPDATE `finance_voucher_debits` AS vd
JOIN `finance_accounts` AS fa ON fa.id = vd.accountId
SET vd.chartOfAccountId = fa.chartOfAccountId
WHERE vd.chartOfAccountId IS NULL AND fa.chartOfAccountId IS NOT NULL;
--> statement-breakpoint
UPDATE `finance_voucher_credits` AS vc
JOIN `finance_accounts` AS fa ON fa.id = vc.accountId
SET vc.chartOfAccountId = fa.chartOfAccountId
WHERE vc.chartOfAccountId IS NULL AND fa.chartOfAccountId IS NOT NULL;
--> statement-breakpoint
UPDATE `finance_ledger_entries` AS le
JOIN `finance_accounts` AS fa ON fa.id = le.accountId
SET le.chartOfAccountId = fa.chartOfAccountId
WHERE le.chartOfAccountId IS NULL AND fa.chartOfAccountId IS NOT NULL;
--> statement-breakpoint
UPDATE `finance_transactions` AS ft
JOIN `finance_accounts` AS fa ON fa.id = ft.accountId
SET ft.chartOfAccountId = fa.chartOfAccountId
WHERE ft.chartOfAccountId IS NULL AND fa.chartOfAccountId IS NOT NULL;
--> statement-breakpoint
UPDATE `finance_transactions` AS ft
JOIN `finance_vouchers` AS v
  ON v.projectId = ft.projectId AND v.userId = ft.userId AND v.voucherNo = ft.voucherNo
SET ft.voucherId = v.id
WHERE ft.voucherId IS NULL AND ft.voucherNo IS NOT NULL;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `finance_transactions_idempotency_unique` ON `finance_transactions` (`userId`, `projectId`, `idempotencyKey`)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_transactions' AND index_name = 'finance_transactions_idempotency_unique');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `finance_transactions_fingerprint_idx` ON `finance_transactions` (`requestFingerprint`)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_transactions' AND index_name = 'finance_transactions_fingerprint_idx');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `finance_ledger_coa_date_idx` ON `finance_ledger_entries` (`chartOfAccountId`, `postedAt`)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_ledger_entries' AND index_name = 'finance_ledger_coa_date_idx');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `finance_transactions_voucher_unique` ON `finance_transactions` (`voucherId`)', 'SELECT 1') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_transactions' AND index_name = 'finance_transactions_voucher_unique');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_accounts` ADD CONSTRAINT `fa_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_accounts' AND constraint_name = 'fa_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_categories` ADD CONSTRAINT `fc_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_categories' AND constraint_name = 'fc_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_debits` ADD CONSTRAINT `fvd_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_debits' AND constraint_name = 'fvd_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_voucher_credits` ADD CONSTRAINT `fvc_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_voucher_credits' AND constraint_name = 'fvc_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_ledger_entries` ADD CONSTRAINT `fle_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_ledger_entries' AND constraint_name = 'fle_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_transactions` ADD CONSTRAINT `ft_coa_fk` FOREIGN KEY (`chartOfAccountId`) REFERENCES `finance_chart_of_accounts` (`id`) ON DELETE restrict ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_transactions' AND constraint_name = 'ft_coa_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_transactions` ADD CONSTRAINT `ft_voucher_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_transactions' AND constraint_name = 'ft_voucher_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `fds_voucher_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_due_settlements' AND constraint_name = 'fds_voucher_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `fsp_voucher_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_salary_payments' AND constraint_name = 'fsp_voucher_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `fea_voucher_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers` (`id`) ON DELETE set null ON UPDATE no action', 'SELECT 1') FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND table_name = 'finance_employee_advances' AND constraint_name = 'fea_voucher_fk');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
