/**
 * Safe, idempotent applier for the RBAC schema (0014_rbac_and_idempotency).
 *
 * This is the replacement for the retired `/api/debug/apply-rbac` HTTP route:
 * it performs the same work (plus legacy-table repair) but can only be invoked
 * by an operator with DATABASE_URL, never over the public API.
 *
 * It NEVER drops, truncates, or renames anything. Every statement is additive
 * (`CREATE TABLE IF NOT EXISTS`) and skips gracefully when the target already
 * exists. For databases that previously created `roles` / `permissions` via the
 * legacy debug route (missing the `updatedAt` column), it adds the missing
 * column after an information_schema check.
 *
 * Usage:
 *   DATABASE_URL="mysql://user:pass@host/db" node scripts/apply-rbac-schema.mjs
 *   node scripts/apply-rbac-schema.mjs --url "mysql://user:pass@host/db"
 *
 * After a successful run, execute `pnpm db:push` once so the drizzle journal
 * records 0014 (the guarded statements will simply skip; the entry is recorded
 * so subsequent `drizzle-kit migrate` runs apply nothing leftover).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";

const MIGRATION_FILE = fileURLToPath(
  new URL("../drizzle/0014_rbac_and_idempotency.sql", import.meta.url)
);

function getDatabaseUrl() {
  const argIndex = process.argv.indexOf("--url");
  const fromArg = argIndex !== -1 ? process.argv[argIndex + 1] : undefined;
  if (fromArg) return fromArg;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error(
    'DATABASE_URL is required (set the env var or pass --url "mysql://user:pass@host/db")'
  );
}

async function run() {
  const databaseUrl = getDatabaseUrl();
  const connection = await createConnection(databaseUrl);

  try {
    const statements = readFileSync(MIGRATION_FILE, "utf8")
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);

    console.log(
      `Applying ${statements.length} additive statements from ${MIGRATION_FILE}`
    );
    for (const [index, statement] of statements.entries()) {
      try {
        await connection.query(statement);
        console.log(
          `  ok   [${index + 1}/${statements.length}] ${firstLine(statement)}`
        );
      } catch (error) {
        const msg = String(error?.message ?? error);
        if (isAlreadyExistsError(msg)) {
          console.log(
            `  skip [${index + 1}/${statements.length}] target already exists`
          );
        } else {
          throw new Error(
            `Statement ${index + 1} failed: ${msg}\nSQL: ${statement}`
          );
        }
      }
    }

    // Legacy DBs created `roles` / `permissions` without `updatedAt`.
    // Add it back after an information_schema check (no-op when present).
    for (const table of ["roles", "permissions"]) {
      await ensureColumn(connection, table, "updatedAt");
    }

    await reportState(connection);
  } finally {
    await connection.end();
  }
}

async function ensureColumn(connection, table, column) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
    [table, column]
  );
  const exists = Number(rows[0]?.n ?? 0) > 0;
  const tableExists = await tableExistsIn(connection, table);
  if (!tableExists) return;

  if (exists) {
    console.log(`  ok   ${table}.${column} already present`);
    return;
  }
  await connection.query(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP`
  );
  console.log(`  add  ${table}.${column}`);
}

async function tableExistsIn(connection, table) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function reportState(connection) {
  const [tables] = await connection.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('roles','permissions','user_roles','role_permissions','idempotency_keys') ORDER BY table_name"
  );
  const present = tables.map(t => t.TABLE_NAME);
  console.log("RBAC tables present:", present.join(", "));
}

function isAlreadyExistsError(message) {
  return (
    message.includes("Duplicate column name") ||
    message.includes("already exists") ||
    message.includes("Duplicate key name") ||
    message.includes("ER_TABLE_EXISTS_ERROR") ||
    message.includes("ER_DUP_KEYNAME") ||
    message.includes("ER_DUP_ENTRY") ||
    message.includes("ER_DUP_FIELDNAME")
  );
}

function firstLine(statement) {
  return (
    statement
      .split("\n")
      .find(line => line.trim().startsWith("CREATE"))
      ?.trim() || "statement"
  );
}

run().catch(error => {
  console.error("apply-rbac-schema failed:", error.message ?? error);
  process.exit(1);
});
