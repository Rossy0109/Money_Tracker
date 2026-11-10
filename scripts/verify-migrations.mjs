import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createConnection } from "mysql2/promise";
import { getIsolatedE2EDatabaseUrl } from "./e2e-database.mjs";

const source = getIsolatedE2EDatabaseUrl();
const sourceUrl = source.toString();
const sourceDatabase = source.pathname.replace(/^\//, "");
if (!sourceDatabase || !["127.0.0.1", "localhost"].includes(source.hostname)) {
  throw new Error(
    "Migration verification requires a local disposable MariaDB connection"
  );
}

const testDatabase = `money_tracker_migration_${Date.now().toString(36)}_${process.pid}`;
if (!/^money_tracker_migration_[a-z0-9_]{8,50}$/.test(testDatabase)) {
  throw new Error("Unsafe migration verification database name");
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`
          )
        );
    });
  });
}

const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
let created = false;

/**
 * Every table/column the journal's SQL files create must exist after the
 * production reconciler runs. Derived from `drizzle/` directly so a new
 * migration cannot be silently left out of `reconcile-migrations.mjs` — that
 * exact drift left production without `finance_project_members` (0023) and
 * `rate_limit_counters` (0024) while every gate stayed green.
 */
function expectedObjectsFromJournal() {
  const journal = JSON.parse(
    readFileSync(
      new URL("../drizzle/meta/_journal.json", import.meta.url),
      "utf8"
    )
  );
  const tables = new Set();
  const columns = new Map();
  const NON_COLUMN_ADD =
    /^(CONSTRAINT|FOREIGN|PRIMARY|UNIQUE|INDEX|KEY|FULLTEXT|SPATIAL|CHECK|PARTITION)$/i;

  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
  for (const entry of entries) {
    const sql = readFileSync(
      new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
      "utf8"
    );
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`?(\w+)`?/gi)) {
      tables.add(m[1]);
    }
    for (const m of sql.matchAll(/DROP TABLE (?:IF EXISTS )?`?(\w+)`?/gi)) {
      tables.delete(m[1]);
    }
    for (const m of sql.matchAll(
      /ALTER TABLE `?(\w+)`? ADD (?:COLUMN )?(?:IF NOT EXISTS )?`?(\w+)`?/gi
    )) {
      if (NON_COLUMN_ADD.test(m[2])) continue;
      if (!columns.has(m[1])) columns.set(m[1], new Set());
      columns.get(m[1]).add(m[2]);
    }
  }
  return { tables: [...tables], columns };
}

async function verifyCanonicalSchema(url) {
  const connection = await createConnection(url);
  try {
    const requiredColumns = [
      ["finance_accounts", "chartOfAccountId"],
      ["finance_categories", "chartOfAccountId"],
      ["finance_transactions", "chartOfAccountId"],
      ["finance_transactions", "voucherId"],
      ["finance_transactions", "idempotencyKey"],
      ["finance_transactions", "requestFingerprint"],
      ["finance_voucher_debits", "chartOfAccountId"],
      ["finance_voucher_credits", "chartOfAccountId"],
      ["finance_ledger_entries", "chartOfAccountId"],
      ["finance_due_settlements", "voucherId"],
      ["finance_salary_payments", "voucherId"],
      ["finance_employee_advances", "voucherId"],
    ];
    const predicates = requiredColumns
      .map(() => "(table_name = ? AND column_name = ?)")
      .join(" OR ");
    const [columns] = await connection.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND (${predicates})`,
      requiredColumns.flat()
    );
    if (columns.length !== requiredColumns.length) {
      throw new Error(
        "Canonical accounting migration verification found missing columns"
      );
    }
    const [indexes] = await connection.query(
      "SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'finance_transactions' AND index_name = 'finance_transactions_idempotency_unique'"
    );
    if (indexes.length < 1)
      throw new Error("Transaction idempotency index verification failed");

    const { tables: expectedTables, columns: expectedColumns } =
      expectedObjectsFromJournal();
    const [dbTables] = await connection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    const presentTables = new Set(dbTables.map(r => r.table_name));
    const missingTables = expectedTables.filter(t => !presentTables.has(t));
    if (missingTables.length > 0) {
      throw new Error(
        `Migration rehearsal is missing journal tables: ${missingTables.join(", ")}`
      );
    }

    const [dbColumns] = await connection.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()"
    );
    const presentColumns = new Set(
      dbColumns.map(r => `${r.table_name}.${r.column_name}`)
    );
    const missingColumns = [];
    for (const [table, cols] of expectedColumns) {
      for (const column of cols) {
        if (!presentColumns.has(`${table}.${column}`)) {
          missingColumns.push(`${table}.${column}`);
        }
      }
    }
    if (missingColumns.length > 0) {
      throw new Error(
        `Migration rehearsal is missing journal columns: ${missingColumns.join(", ")}`
      );
    }
  } finally {
    await connection.end();
  }
}

try {
  const admin = await createConnection(sourceUrl);
  try {
    await admin.query(`CREATE DATABASE \`${testDatabase}\``);
    created = true;
  } finally {
    admin.destroy();
  }

  await run(
    "node",
    ["scripts/reconcile-migrations.mjs", "--url", testUrl.toString()],
    process.env
  );
  await verifyCanonicalSchema(testUrl.toString());
  console.log(`Migration rehearsal passed: ${testDatabase}`);
} finally {
  if (created) {
    const admin = await createConnection(sourceUrl);
    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
      console.log(`Migration rehearsal database removed: ${testDatabase}`);
    } finally {
      admin.destroy();
    }
  }
}
