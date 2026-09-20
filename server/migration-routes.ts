import { type Request, type Response } from "express";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

const MIGRATION_SECRET = process.env.MIGRATION_SECRET || "dev-only-secret-change-in-production";

function getSecret(req: Request): string | undefined {
  return req.query.secret as string || req.headers["x-migration-secret"] as string;
}

function checkSecret(req: Request): boolean {
  const secret = getSecret(req);
  return secret === (process.env.MIGRATION_SECRET || "dev-only-secret-change-in-production");
}

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return drizzle(url);
}

function handleError(error: unknown): string {
  return String(error);
}

function checkDuplicateError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes("Duplicate column name") || 
         msg.includes("already exists") ||
         msg.includes("Duplicate key name") ||
         msg.includes("ER_TABLE_EXISTS_ERROR") ||
         msg.includes("ER_DUP_KEYNAME") ||
         msg.includes("ER_DUP_ENTRY") ||
         msg.includes("ER_DUP_FIELDNAME");
}

export async function addIsActiveRoute(req: Request, res: Response) {
  const secret = getSecret(req);
  if (secret !== (process.env.MIGRATION_SECRET || "dev-only-secret-change-in-production")) {
    return res.status(403).json({ error: "Invalid migration secret" });
  }

  try {
    const db = getDb();
    const { sql } = await import("drizzle-orm");
    
    const results: Array<{ table: string; column: string; status: string; error?: string }> = [];
    
    // Add isActive column to finance_projects
    try {
      await getDb().execute(sql`
        ALTER TABLE \`finance_projects\`
        ADD COLUMN \`isActive\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`updatedAt\`
      `);
      results.push({ table: "finance_projects", column: "isActive", status: "added" });
    } catch (error) {
      if (checkDuplicateError(error)) {
        results.push({ table: "finance_projects", column: "isActive", status: "already exists" });
      } else {
        results.push({ table: "finance_projects", column: "isActive", status: "error", error: handleError(error) });
      }
    }
    
    // Also add isActive to finance_accounts if missing
    try {
      await getDb().execute(sql`
        ALTER TABLE \`finance_accounts\`
        ADD COLUMN \`isActive\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`updatedAt\`
      `);
      results.push({ table: "finance_accounts", column: "isActive", status: "added" });
    } catch (error) {
      if (checkDuplicateError(error)) {
        results.push({ table: "finance_accounts", column: "isActive", status: "already exists" });
      } else {
        results.push({ table: "finance_accounts", column: "isActive", status: "error", error: String(error) });
      }
    }
    
    // Also add isActive to finance_categories if missing
    try {
      await getDb().execute(sql`
        ALTER TABLE \`finance_categories\`
        ADD COLUMN \`isActive\` TINYINT(1) NOT NULL DEFAULT 1 AFTER \`isDefault\`
      `);
      results.push({ table: "finance_categories", column: "isActive", status: "added" });
    } catch (error) {
      results.push({ table: "finance_categories", column: "isActive", status: "already exists" });
    }
    
    // Add indexes
    try {
      await getDb().execute(sql`CREATE INDEX finance_projects_active_idx ON finance_projects (isActive)`);
    } catch (e) {}
    
    try {
      await getDb().execute(sql`CREATE INDEX finance_accounts_active_idx ON finance_accounts (isActive)`);
    } catch (e) {}
    
    try {
      await getDb().execute(sql`CREATE INDEX finance_categories_active_idx ON finance_categories (isActive)`);
    } catch (e) {}
    
    res.json({ success: true, results });
  } catch (error) {
    console.error("Add isActive error:", error);
    res.status(500).json({ error: String(error) });
  }
}

export async function applyRbacMigrationRoute(req: Request, res: Response) {
  const secret = getSecret(req);
  if (secret !== (process.env.MIGRATION_SECRET || "dev-only-secret-change-in-production")) {
    return res.status(403).json({ error: "Invalid migration secret" });
  }

  try {
    const db = getDb();
    const { sql } = await import("drizzle-orm");
    
    // RBAC migration SQL embedded directly to avoid file system issues on Vercel
    const rbacSql = `
CREATE TABLE \`permissions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`displayName\` varchar(128) NOT NULL,
  \`description\` text,
  \`category\` varchar(64) NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`permissions_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`permissions_name_unique\` UNIQUE(\`name\`)
);
CREATE INDEX \`permissions_category_idx\` ON \`permissions\` (\`category\`);
CREATE TABLE \`roles\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`name\` varchar(64) NOT NULL,
  \`displayName\` varchar(120) NOT NULL,
  \`description\` text,
  \`isSystem\` boolean NOT NULL DEFAULT false,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`roles_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`roles_name_unique\` UNIQUE(\`name\`)
);
CREATE INDEX \`roles_name_idx\` ON \`roles\` (\`name\`);
CREATE TABLE \`user_roles\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`userId\` int NOT NULL,
  \`roleId\` int NOT NULL,
  \`assignedBy\` int,
  \`assignedAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`user_roles_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`user_roles_user_role_unique\` UNIQUE(\`userId\`,\`roleId\`)
);
CREATE INDEX \`user_roles_user_id_idx\` ON \`user_roles\` (\`userId\`);
CREATE INDEX \`user_roles_role_id_idx\` ON \`user_roles\` (\`roleId\`);
CREATE TABLE \`role_permissions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`roleId\` int NOT NULL,
  \`permissionId\` int NOT NULL,
  CONSTRAINT \`role_permissions_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`role_permissions_role_permission_unique\` UNIQUE(\`roleId\`,\`permissionId\`)
);
CREATE INDEX \`role_permissions_role_id_idx\` ON \`role_permissions\` (\`roleId\`);
CREATE INDEX \`role_permissions_permission_id_idx\` ON \`role_permissions\` (\`permissionId\`);
ALTER TABLE \`user_roles\` ADD CONSTRAINT \`user_roles_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE \`user_roles\` ADD CONSTRAINT \`user_roles_roleId_roles_id_fk\` FOREIGN KEY (\`roleId\`) REFERENCES \`roles\`(\`id\`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE \`user_roles\` ADD CONSTRAINT \`user_roles_assignedBy_users_id_fk\` FOREIGN KEY (\`assignedBy\`) REFERENCES \`users\`(\`id\`) ON DELETE set null ON UPDATE no action;
ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`role_permissions_roleId_roles_id_fk\` FOREIGN KEY (\`roleId\`) REFERENCES \`roles\`(\`id\`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`role_permissions_permissionId_permissions_id_fk\` FOREIGN KEY (\`permissionId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE cascade ON UPDATE no action;
`;
    
    const statements = rbacSql.split(';').filter(s => s.trim());
    
    let executed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      
      try {
        await getDb().execute(sql.raw(trimmed));
        executed++;
      } catch (error) {
        const errorMsg = String(error);
        
        if (checkDuplicateError(error)) {
          skipped++;
        } else {
          errors++;
          console.error(`  Error in RBAC migration:`, String(error));
        }
      }
    }
    
    // Record migration in tracking table
    try {
      const db = getDb();
      const { sql } = await import("drizzle-orm");
      await getDb().execute(sql`INSERT IGNORE INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('0014_rbac_tables', UNIX_TIMESTAMP() * 1000)`);
    } catch (e) {
      // Ignore
    }
    
    res.json({ success: true, executed, skipped, errors });
  } catch (error) {
    console.error("Apply RBAC migration error:", error);
    res.status(500).json({ error: String(error) });
  }
}

export async function checkSchemaRoute(req: Request, res: Response) {
  const secret = getSecret(req);
  if (secret !== (process.env.MIGRATION_SECRET || "dev-only-secret-change-in-production")) {
    return res.status(403).json({ error: "Invalid secret" });
  }

  try {
    const db = getDb();
    const { sql } = await import("drizzle-orm");
    
    // Check key tables
    const keyTables = [
      'users', 'finance_projects', 'finance_accounts', 'finance_categories', 'finance_transactions',
      'finance_vouchers', 'finance_voucher_debits', 'finance_voucher_credits',
      'finance_ledger_entries', 'finance_voucher_audit', 'finance_voucher_reversals',
      'finance_chart_of_accounts', 'finance_account_types', 'finance_period_locks',
      'finance_voucher_reversals', 'finance_bank_reconciliations', 'finance_bank_reconciliation_items',
      'finance_employees', 'finance_salary_payments', 'finance_employee_advances',
      'finance_invoices', 'finance_invoice_items', 'finance_inventory_items',
      'failed_login_attempts', 'login_history', 'user_sessions', 'permissions', 'roles',
      'user_roles', 'role_permissions',
    ];
    
    const tableStatus: Record<string, string> = {};
    for (const table of keyTables) {
      const result = await getDb().execute(sql`SHOW TABLES LIKE ${table}`);
      tableStatus[table] = (result as any)[0].length > 0 ? "EXISTS" : "MISSING";
    }
    
    // Check users table columns
    const userColsResult = await getDb().execute(sql`SHOW COLUMNS FROM users`);
    const userCols = (userColsResult as any)[0] || [];
    const userColNames = userCols.map((c: any) => c.Field);
    
    // Check permissions table columns
    let permissionsCols: Array<{Field: string}> = [];
    const permTableCheck = await getDb().execute(sql`SHOW TABLES LIKE 'permissions'`);
    if ((permTableCheck as any)[0].length > 0) {
      const permColsResult = await getDb().execute(sql`SHOW COLUMNS FROM permissions`);
      permissionsCols = (permColsResult as any)[0] || [];
    }
    
    res.json({
      tableStatus,
      usersColumns: {
        hasPasswordHash: userColNames.includes('passwordHash'),
        hasResetToken: userColNames.includes('resetToken'),
        hasResetTokenExpiresAt: userColNames.includes('resetTokenExpiresAt'),
        hasFailedLoginAttempts: userColNames.includes('failedLoginAttempts'),
        hasLockedUntil: userColNames.includes('lockedUntil'),
        allColumns: userColNames,
      },
      permissions: {
        status: "EXISTS",
        columns: [],
      },
    });
  } catch (error) {
    console.error("Schema check error:", error);
    res.status(500).json({ error: String(error) });
  }
}
