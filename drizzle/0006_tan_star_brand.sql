ALTER TABLE `finance_transactions` ADD `recurringTemplateId` int;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `recurringRunKey` varchar(16);--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_transactions_recurring_run_unique` UNIQUE(`recurringTemplateId`,`recurringRunKey`);--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD CONSTRAINT `finance_tx_recurring_template_fk` FOREIGN KEY (`recurringTemplateId`) REFERENCES `finance_recurring_transactions`(`id`) ON DELETE set null ON UPDATE no action;
