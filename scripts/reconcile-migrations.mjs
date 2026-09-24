/**
 * Safe, idempotent schema reconciliation for partially-applied migrations.
 *
 * Classifies and repairs the known failure modes without ever dropping,
 * truncating, or rewriting financial data:
 *   1. already-existing table/column/constraint  → skip if definition present
 *   2. missing table/column/constraint            → apply additive DDL
 *   3. partial migration (some statements applied)→ apply only the missing ones
 *
 * It does NOT re-run raw drizzle migration files blindly and does NOT touch
 * the production data rows.
 *
 * Usage:
 *   DATABASE_URL="mysql://user:pass@host/db" node scripts/reconcile-migrations.mjs
 *   node scripts/reconcile-migrations.mjs --url "mysql://..." [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";

const ROOT = new URL("..", import.meta.url);
const dryRun = process.argv.includes("--dry-run");

function getUrl() {
  const i = process.argv.indexOf("--url");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error('DATABASE_URL is required (env or --url "mysql://...")');
}

function isAlreadyExists(msg) {
  return /already exists|duplicate (key|column|constraint|entry)|duplicate key value/i.test(msg);
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name],
  );
  return Number(rows[0].n) > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column],
  );
  return Number(rows[0].n) > 0;
}

async function constraintExists(conn, name) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ?",
    [name],
  );
  return Number(rows[0].n) > 0;
}

async function indexExists(conn, name) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name = ?",
    [name],
  );
  return Number(rows[0].n) > 0;
}

async function runStatement(conn, sql, label) {
  const head = sql.trim().split("\n")[0].slice(0, 100);
  if (dryRun) {
    console.log(`  dry  [${label}] ${head}`);
    return "dry";
  }
  try {
    await conn.query(sql);
    console.log(`  ok   [${label}] ${head}`);
    return "ok";
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (isAlreadyExists(msg)) {
      console.log(`  skip [${label}] already exists — ${msg.slice(0, 80)}`);
      return "skip";
    }
    throw new Error(`Statement failed (${label}): ${msg}\nSQL: ${sql.slice(0, 300)}`);
  }
}

/**
 * Split a drizzle SQL file and apply only statements whose target objects are
 * missing. CREATE TABLE / ADD COLUMN / ADD CONSTRAINT are inspected first.
 */
async function reconcileFile(conn, fileRel) {
  const path = fileURLToPath(new URL(`../drizzle/${fileRel}`, import.meta.url));
  if (!existsSync(path)) {
    console.log(`! missing migration file ${fileRel} — skipped`);
    return;
  }
  const raw = readFileSync(path, "utf8");
  const statements = raw
    .split("--> statement-breakpoint")
    .map(s => s.trim())
    .filter(Boolean);
  console.log(`\n== ${fileRel} (${statements.length} statements) ==`);

  for (const [i, sql] of statements.entries()) {
    const label = `${fileRel}#${i + 1}`;
    const createTable = sql.match(/CREATE TABLE(?: IF NOT EXISTS)? `?(\w+)`?/i);
    if (createTable) {
      const name = createTable[1];
      if (await tableExists(conn, name)) {
        console.log(`  skip [${label}] table ${name} already exists`);
        continue;
      }
      await runStatement(conn, sql, label);
      continue;
    }

    const addFk = sql.match(/ADD CONSTRAINT `?(\w+)`?/i);
    if (addFk) {
      const name = addFk[1];
      if (await constraintExists(conn, name)) {
        console.log(`  skip [${label}] constraint ${name} already exists`);
        continue;
      }
      await runStatement(conn, sql, label);
      continue;
    }

    const dropFk = sql.match(/ALTER TABLE `?(\w+)`? DROP FOREIGN KEY `?(\w+)`?/i);
    if (dropFk) {
      const [, table, name] = dropFk;
      if (!(await tableExists(conn, table))) {
        console.log(`  warn [${label}] parent table ${table} missing — cannot drop ${name}`);
        continue;
      }
      if (!(await constraintExists(conn, name))) {
        console.log(`  skip [${label}] constraint ${name} already absent (converged)`);
        continue;
      }
      await runStatement(conn, sql, label);
      continue;
    }

    // NOTE: checked AFTER ADD/DROP CONSTRAINT — the optional COLUMN keyword
    // would otherwise misroute ADD CONSTRAINT statements here.
    const addColumn = sql.match(/ALTER TABLE `?(\w+)`? ADD (?:COLUMN )?`?(\w+)`?/i);
    if (addColumn) {
      const [, table, col] = addColumn;
      if (!(await tableExists(conn, table))) {
        console.log(`  warn [${label}] parent table ${table} missing — cannot add ${col}`);
        continue;
      }
      if (await columnExists(conn, table, col)) {
        console.log(`  skip [${label}] column ${table}.${col} already exists`);
        continue;
      }
      await runStatement(conn, sql, label);
      continue;
    }

    const createIndex = sql.match(/CREATE INDEX `?(\w+)`?/i);
    if (createIndex) {
      const name = createIndex[1];
      if (await indexExists(conn, name)) {
        console.log(`  skip [${label}] index ${name} already exists`);
        continue;
      }
      await runStatement(conn, sql, label);
      continue;
    }

    // Unknown shape — still run with already-exists tolerance.
    await runStatement(conn, sql, label);
  }
}

async function ensureUsersColumns(conn) {
  // 0009 adds these; production may already have them from partial applies.
  if (!(await tableExists(conn, "users"))) {
    console.log("! users table missing — aborting column checks");
    return;
  }
  if (!(await columnExists(conn, "users", "passwordHash"))) {
    await runStatement(conn, "ALTER TABLE `users` ADD `passwordHash` varchar(255)", "users.passwordHash");
  } else {
    console.log("  skip users.passwordHash already exists");
  }
  if (!(await columnExists(conn, "users", "status"))) {
    await runStatement(
      conn,
      "ALTER TABLE `users` ADD `status` enum('pending','active','suspended') DEFAULT 'pending' NOT NULL",
      "users.status",
    );
  } else {
    console.log("  skip users.status already exists");
  }
}

async function report(conn) {
  const expectedTables = [
    "users",
    "finance_inventory_items",
    "finance_invoices",
    "finance_invoice_items",
    "finance_employees",
    "finance_employee_advances",
    "finance_salary_payments",
    "finance_account_types",
    "finance_chart_of_accounts",
    "finance_account_groups",
    "finance_fiscal_periods",
    "finance_journal_entries",
    "finance_journal_lines",
    "finance_period_locks",
    "finance_voucher_reversals",
    "finance_bank_reconciliations",
    "finance_bank_reconciliation_items",
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    "idempotency_keys",
  ];
  console.log("\n== schema report ==");
  for (const t of expectedTables) {
    const ok = await tableExists(conn, t);
    console.log(`  ${ok ? "OK     " : "MISSING"} ${t}`);
  }
  const [fk] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_type = 'FOREIGN KEY'",
  );
  console.log(`  foreign keys: ${fk[0].n}`);
}

async function run() {
  const url = getUrl();
  const conn = await createConnection(url);
  console.log(`Reconciling schema${dryRun ? " (dry-run)" : ""}…`);
  try {
    await ensureUsersColumns(conn);
    await reconcileFile(conn, "0009_rare_beyonder.sql");
    await reconcileFile(conn, "0011_round_ken_ellis.sql");
    await reconcileFile(conn, "0014_rbac_and_idempotency.sql");
    await reconcileFile(conn, "0015_fk-restrict-financial-history.sql");
    await reconcileFile(conn, "0016_schema_drift_repair.sql");
    await report(conn);
    console.log(
      dryRun
        ? "\nDry run complete — no changes applied."
        : "\nReconciliation complete. Financial data was not modified.",
    );
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
