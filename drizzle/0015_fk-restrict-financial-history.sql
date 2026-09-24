ALTER TABLE `finance_accounts` DROP FOREIGN KEY `finance_accounts_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_accounts` DROP FOREIGN KEY `finance_accounts_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_accounts` ADD CONSTRAINT `finance_accounts_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` DROP FOREIGN KEY `finance_bank_reconciliations_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` DROP FOREIGN KEY `finance_bank_reconciliations_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_bank_reconciliations` ADD CONSTRAINT `finance_bank_reconciliations_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_bills` DROP FOREIGN KEY `finance_bills_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_bills` ADD CONSTRAINT `finance_bills_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_bills` DROP FOREIGN KEY `finance_bills_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_bills` ADD CONSTRAINT `finance_bills_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_budgets` DROP FOREIGN KEY `finance_budgets_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_budgets` DROP FOREIGN KEY `finance_budgets_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_budgets` DROP FOREIGN KEY `finance_budgets_categoryId_finance_categories_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_budgets` ADD CONSTRAINT `finance_budgets_categoryId_finance_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_categories` DROP FOREIGN KEY `finance_categories_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_categories` DROP FOREIGN KEY `finance_categories_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` DROP FOREIGN KEY `finance_chart_of_accounts_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` DROP FOREIGN KEY `finance_chart_of_accounts_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` DROP FOREIGN KEY `finance_due_settlements_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` DROP FOREIGN KEY `finance_due_settlements_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` DROP FOREIGN KEY `finance_due_settlements_dueId_finance_dues_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_dueId_finance_dues_id_fk` FOREIGN KEY (`dueId`) REFERENCES `finance_dues`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_dues` DROP FOREIGN KEY `finance_dues_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_dues` ADD CONSTRAINT `finance_dues_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_dues` DROP FOREIGN KEY `finance_dues_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_dues` ADD CONSTRAINT `finance_dues_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` DROP FOREIGN KEY `finance_employee_advances_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` DROP FOREIGN KEY `finance_employee_advances_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` DROP FOREIGN KEY `finance_employee_advances_employeeId_finance_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_employees` DROP FOREIGN KEY `finance_employees_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employees` ADD CONSTRAINT `finance_employees_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_employees` DROP FOREIGN KEY `finance_employees_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employees` ADD CONSTRAINT `finance_employees_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_household_members` DROP FOREIGN KEY `finance_household_members_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_household_members` DROP FOREIGN KEY `finance_household_members_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_households` DROP FOREIGN KEY `finance_households_ownerUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_households` ADD CONSTRAINT `finance_households_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_inventory_items` DROP FOREIGN KEY `finance_inventory_items_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_inventory_items` ADD CONSTRAINT `finance_inventory_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_inventory_items` DROP FOREIGN KEY `finance_inventory_items_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_inventory_items` ADD CONSTRAINT `finance_inventory_items_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_invoices` DROP FOREIGN KEY `finance_invoices_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_invoices` ADD CONSTRAINT `finance_invoices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_invoices` DROP FOREIGN KEY `finance_invoices_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_invoices` ADD CONSTRAINT `finance_invoices_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` DROP FOREIGN KEY `finance_ledger_entries_voucherId_finance_vouchers_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_ledger_entries` ADD CONSTRAINT `finance_ledger_entries_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_period_locks` DROP FOREIGN KEY `finance_period_locks_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_period_locks` ADD CONSTRAINT `finance_period_locks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_period_locks` DROP FOREIGN KEY `finance_period_locks_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_period_locks` ADD CONSTRAINT `finance_period_locks_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `fin_priv_storage_owner_user_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `fin_priv_storage_owner_user_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `fin_priv_storage_project_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `fin_priv_storage_project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `fin_priv_storage_household_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `fin_priv_storage_household_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_projects` DROP FOREIGN KEY `finance_projects_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_projects` ADD CONSTRAINT `finance_projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` DROP FOREIGN KEY `finance_recurring_transactions_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `finance_recurring_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` DROP FOREIGN KEY `finance_recurring_transactions_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_recurring_transactions` ADD CONSTRAINT `finance_recurring_transactions_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` DROP FOREIGN KEY `finance_salary_payments_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` DROP FOREIGN KEY `finance_salary_payments_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` DROP FOREIGN KEY `finance_salary_payments_employeeId_finance_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` DROP FOREIGN KEY `finance_shared_budgets_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` ADD CONSTRAINT `finance_shared_budgets_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` DROP FOREIGN KEY `finance_shared_expenses_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` DROP FOREIGN KEY `finance_shared_expenses_budgetId_finance_shared_budgets_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_budgetId_finance_shared_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `finance_shared_budgets`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_transactions` DROP FOREIGN KEY `finance_transactions_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_transactions` DROP FOREIGN KEY `finance_transactions_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_audit` DROP FOREIGN KEY `finance_voucher_audit_voucherId_finance_vouchers_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_audit` ADD CONSTRAINT `finance_voucher_audit_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_references` DROP FOREIGN KEY `finance_voucher_references_voucherId_finance_vouchers_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_references` ADD CONSTRAINT `finance_voucher_references_voucherId_finance_vouchers_id_fk` FOREIGN KEY (`voucherId`) REFERENCES `finance_vouchers`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` DROP FOREIGN KEY `finance_voucher_reversals_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` DROP FOREIGN KEY `finance_voucher_reversals_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_reversals` ADD CONSTRAINT `finance_voucher_reversals_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` DROP FOREIGN KEY `finance_voucher_settings_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` ADD CONSTRAINT `finance_voucher_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` DROP FOREIGN KEY `finance_voucher_settings_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_voucher_settings` ADD CONSTRAINT `finance_voucher_settings_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
