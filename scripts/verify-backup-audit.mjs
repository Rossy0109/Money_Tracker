#!/usr/bin/env node
/**
 * Verify the scheduled backup actually stored its payload.
 *
 * The backup endpoint can return HTTP 200 while individual uploads fail —
 * upload errors are counted, never thrown. executeScheduledBackup() always
 * writes exactly one audit_logs row: `cloud_backup` only when every project
 * stored AND passed its integrity re-export check, otherwise
 * `cloud_backup_failed`. This script exits non-zero unless the newest row
 * inside the window is a full success, so the daily-backup workflow fails
 * loudly instead of celebrating a 200 that stored nothing.
 *
 * Requires DATABASE_URL (production) and VERIFY_WINDOW_MINUTES (default 30).
 * Exit codes: 0 verified, 1 verification failed, 2 configuration error.
 */
import { createConnection } from "mysql2/promise";

/**
 * Mirror of server/_core/dbConnection.ts parseDatabaseUrl. mysql2's own
 * URI parser mangles TiDB's `?ssl={"rejectUnauthorized":true}` param and
 * silently falls back to localhost — never pass the raw URL to mysql2.
 */
function parseDatabaseUrl(url) {
  let u = url.trim();
  if (/^jdbc:mysql:/i.test(u)) u = u.replace(/^jdbc:/i, "");
  const parsed = new URL(u);
  if (parsed.protocol !== "mysql:") {
    throw new Error(`Unsupported DATABASE_URL scheme: ${parsed.protocol}`);
  }

  const params = new Map();
  for (const [k, v] of parsed.searchParams) {
    const key = k.toLowerCase();
    if (!params.has(key)) params.set(key, v);
  }
  const get = (k) => (params.has(k) ? params.get(k) : null);

  let ssl;
  const mode = get("ssl-mode") ?? get("sslmode");
  const useSsl = get("usessl") ?? get("requiressl");
  if (useSsl !== null && mode === null) {
    if (/^(true|1|yes|on|preferred)$/i.test(useSsl)) ssl = { rejectUnauthorized: false };
  } else if (mode !== null) {
    if (/^required$|^preferred$/i.test(mode)) ssl = { rejectUnauthorized: false };
    else if (/^verify_ca$|^verify_identity$/i.test(mode)) ssl = { rejectUnauthorized: true };
  }
  const rawSsl = get("ssl");
  if (rawSsl !== null && ssl === undefined) {
    if (/^(true|1|yes|on|required)$/i.test(rawSsl)) ssl = { rejectUnauthorized: true };
    else if (!/^(false|0|no|off|disabled)$/i.test(rawSsl)) {
      try {
        ssl = JSON.parse(rawSsl);
      } catch {
        /* ignore malformed ssl JSON */
      }
    }
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || undefined,
    ssl,
    connectTimeout: 20000,
  };
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[verify-backup-audit] DATABASE_URL is required");
  process.exit(2);
}

const windowMinutes = Number(process.env.VERIFY_WINDOW_MINUTES || "30");
if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 1440) {
  console.error(
    `[verify-backup-audit] Invalid VERIFY_WINDOW_MINUTES: ${process.env.VERIFY_WINDOW_MINUTES}`
  );
  process.exit(2);
}

function fail(message) {
  console.error(`[verify-backup-audit] FAIL: ${message}`);
  process.exit(1);
}

let connection;
try {
  connection = await createConnection(parseDatabaseUrl(dbUrl));
} catch (error) {
  console.error(`[verify-backup-audit] Cannot connect to database: ${error.message}`);
  process.exit(2);
}

try {
  const [history] = await connection.query(
    `SELECT id, entityType, summary, createdAt
       FROM audit_logs
      WHERE entityType IN ('cloud_backup', 'cloud_backup_failed')
      ORDER BY id DESC
      LIMIT 5`
  );

  console.log("[verify-backup-audit] latest backup audit rows:");
  if (history.length === 0) {
    console.log("  (none — no backup has ever been audited)");
  }
  for (const row of history) {
    const at = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
    console.log(`  #${row.id} ${at} ${row.entityType}: ${row.summary}`);
  }

  // NOW() is the same clock that wrote createdAt (defaultNow), so the window
  // is timezone-safe — no UTC conversion anywhere.
  const [recent] = await connection.query(
    `SELECT id, entityType, summary, createdAt
       FROM audit_logs
      WHERE entityType IN ('cloud_backup', 'cloud_backup_failed')
        AND createdAt >= DATE_SUB(NOW(), INTERVAL ${windowMinutes} MINUTE)
      ORDER BY id DESC
      LIMIT 1`
  );

  const row = recent[0];
  if (!row) {
    fail(
      `no backup audit row in the last ${windowMinutes} minutes — ` +
        `the trigger did not record a run (or the audit write failed)`
    );
  }
  if (row.entityType !== "cloud_backup") {
    fail(`newest audit row #${row.id} is ${row.entityType}: ${row.summary}`);
  }

  const match = /(\d+) projects?, (\d+) stored, (\d+) verified, (\d+) failed integrity/.exec(
    row.summary || ""
  );
  if (!match) {
    fail(`cannot parse backup summary: ${row.summary}`);
  }
  const projects = Number(match[1]);
  const stored = Number(match[2]);
  const verified = Number(match[3]);
  const failed = Number(match[4]);
  if (projects < 1) {
    fail(`no projects were backed up — active users or projects missing: ${row.summary}`);
  }
  if (stored !== projects || verified !== projects || failed !== 0) {
    fail(`incomplete backup (stored/verified must equal projects): ${row.summary}`);
  }

  console.log(
    `[verify-backup-audit] OK: audit row #${row.id} proves storage + integrity — ${row.summary}`
  );
} finally {
  try {
    await connection.end();
  } catch {
    /* connection may already be closed */
  }
}
