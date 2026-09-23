ALTER TABLE `finance_account_groups` DROP FOREIGN KEY `finance_account_groups_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_account_groups` DROP FOREIGN KEY `finance_account_groups_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` DROP FOREIGN KEY `finance_chart_of_accounts_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` DROP FOREIGN KEY `finance_chart_of_accounts_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_due_settlements` DROP FOREIGN KEY `finance_due_settlements_dueId_finance_dues_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_employee_advances` DROP FOREIGN KEY `finance_employee_advances_employeeId_finance_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_fiscal_periods` DROP FOREIGN KEY `finance_fiscal_periods_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_fiscal_periods` DROP FOREIGN KEY `finance_fiscal_periods_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_household_members` DROP FOREIGN KEY `finance_household_members_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_household_members` DROP FOREIGN KEY `finance_household_members_userId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_households` DROP FOREIGN KEY `finance_households_ownerUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `finance_private_storage_objects_ownerUserId_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `finance_private_storage_objects_projectId_finance_projects_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` DROP FOREIGN KEY `finance_private_storage_objects_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_salary_payments` DROP FOREIGN KEY `finance_salary_payments_employeeId_finance_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` DROP FOREIGN KEY `finance_shared_budgets_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` DROP FOREIGN KEY `finance_shared_expenses_householdId_finance_households_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` DROP FOREIGN KEY `finance_shared_expenses_budgetId_finance_shared_budgets_id_fk`;
--> statement-breakpoint
ALTER TABLE `finance_account_groups` ADD CONSTRAINT `finance_account_groups_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_account_groups` ADD CONSTRAINT `finance_account_groups_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_chart_of_accounts` ADD CONSTRAINT `finance_chart_of_accounts_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_due_settlements` ADD CONSTRAINT `finance_due_settlements_dueId_finance_dues_id_fk` FOREIGN KEY (`dueId`) REFERENCES `finance_dues`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_fiscal_periods` ADD CONSTRAINT `finance_fiscal_periods_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_fiscal_periods` ADD CONSTRAINT `finance_fiscal_periods_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_household_members` ADD CONSTRAINT `finance_household_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_households` ADD CONSTRAINT `finance_households_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_private_storage_objects` ADD CONSTRAINT `finance_private_storage_objects_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_budgets` ADD CONSTRAINT `finance_shared_budgets_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_householdId_finance_households_id_fk` FOREIGN KEY (`householdId`) REFERENCES `finance_households`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_shared_expenses` ADD CONSTRAINT `finance_shared_expenses_budgetId_finance_shared_budgets_id_fk` FOREIGN KEY (`budgetId`) REFERENCES `finance_shared_budgets`(`id`) ON DELETE restrict ON UPDATE no action;