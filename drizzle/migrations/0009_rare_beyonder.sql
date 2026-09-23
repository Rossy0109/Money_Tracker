CREATE TABLE `finance_employee_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`employeeId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`repaidAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`disbursedDate` timestamp NOT NULL,
	`accountId` int,
	`voucherNo` varchar(80),
	`status` enum('open','settled') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_employee_advances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`phone` varchar(40),
	`email` varchar(320),
	`designation` varchar(120),
	`department` varchar(120),
	`joiningDate` timestamp,
	`baseSalary` decimal(15,2) NOT NULL DEFAULT '0.00',
	`status` enum('active','inactive','terminated') NOT NULL DEFAULT 'active',
	`paymentMethod` enum('cash','bank','mobile') NOT NULL DEFAULT 'cash',
	`bankAccountDetails` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`sku` varchar(80),
	`category` varchar(100),
	`unit` varchar(40) NOT NULL DEFAULT 'পিস',
	`purchasePrice` decimal(15,2) NOT NULL DEFAULT '0.00',
	`sellingPrice` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentStock` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lowStockThreshold` decimal(12,2) NOT NULL DEFAULT '5.00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unitPrice` decimal(15,2) NOT NULL,
	`vatRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`total` decimal(15,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `finance_invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`invoiceNumber` varchar(64) NOT NULL,
	`clientName` varchar(160) NOT NULL,
	`clientPhone` varchar(40),
	`clientEmail` varchar(320),
	`clientAddress` text,
	`clientBinTin` varchar(64),
	`issueDate` timestamp NOT NULL,
	`dueDate` timestamp NOT NULL,
	`subtotal` decimal(15,2) NOT NULL,
	`discountAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`vatAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`grandTotal` decimal(15,2) NOT NULL,
	`paidAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`status` enum('draft','unpaid','partially_paid','paid','overdue','cancelled') NOT NULL DEFAULT 'unpaid',
	`notesTerms` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_invoices_project_number_unique` UNIQUE(`projectId`,`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `finance_salary_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int NOT NULL,
	`employeeId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`baseSalary` decimal(15,2) NOT NULL,
	`bonusAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`allowanceAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`advanceDeduction` decimal(15,2) NOT NULL DEFAULT '0.00',
	`otherDeduction` decimal(15,2) NOT NULL DEFAULT '0.00',
	`netPayable` decimal(15,2) NOT NULL,
	`paidAmount` decimal(15,2) NOT NULL DEFAULT '0.00',
	`paymentDate` timestamp,
	`accountId` int,
	`voucherNo` varchar(80),
	`status` enum('pending','paid','partially_paid') NOT NULL DEFAULT 'pending',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_salary_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_salary_employee_month_unique` UNIQUE(`projectId`,`employeeId`,`monthKey`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('pending','active','suspended') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employee_advances` ADD CONSTRAINT `finance_employee_advances_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employees` ADD CONSTRAINT `finance_employees_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_employees` ADD CONSTRAINT `finance_employees_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_inventory_items` ADD CONSTRAINT `finance_inventory_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_inventory_items` ADD CONSTRAINT `finance_inventory_items_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_invoice_items` ADD CONSTRAINT `finance_invoice_items_invoiceId_finance_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `finance_invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_invoices` ADD CONSTRAINT `finance_invoices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_invoices` ADD CONSTRAINT `finance_invoices_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_projectId_finance_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_employeeId_finance_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `finance_employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `finance_salary_payments` ADD CONSTRAINT `finance_salary_payments_accountId_finance_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `finance_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `finance_employee_advances_project_employee_idx` ON `finance_employee_advances` (`projectId`,`employeeId`);--> statement-breakpoint
CREATE INDEX `finance_employee_advances_status_idx` ON `finance_employee_advances` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_employees_user_project_idx` ON `finance_employees` (`userId`,`projectId`);--> statement-breakpoint
CREATE INDEX `finance_employees_status_idx` ON `finance_employees` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_inventory_user_project_idx` ON `finance_inventory_items` (`userId`,`projectId`);--> statement-breakpoint
CREATE INDEX `finance_inventory_sku_idx` ON `finance_inventory_items` (`projectId`,`sku`);--> statement-breakpoint
CREATE INDEX `finance_invoice_items_invoice_idx` ON `finance_invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `finance_invoices_user_project_idx` ON `finance_invoices` (`userId`,`projectId`);--> statement-breakpoint
CREATE INDEX `finance_invoices_status_idx` ON `finance_invoices` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `finance_salary_project_month_idx` ON `finance_salary_payments` (`projectId`,`monthKey`);--> statement-breakpoint
CREATE INDEX `finance_salary_employee_idx` ON `finance_salary_payments` (`employeeId`);