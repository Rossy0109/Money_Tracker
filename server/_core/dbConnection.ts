import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import { instrumentPool } from "./queryTiming";

let _db: ReturnType<typeof drizzle> | null = null;
let _externalDb: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

/**
 * Parse a DATABASE_URL (mysql:// or jdbc:mysql://) and return mysql2 pool config.
 * Handles sslMode/ssl-mode/useSSL params and jdbc: prefix.
 *
 * Exported for reuse: mysql2's own URI-string parser (legacy url.parse) mangles
 * URLs with unencoded query params (e.g. TiDB's ?ssl={"rejectUnauthorized":true}),
 * silently falling back to localhost. Always parse with this (WHATWG URL) and
 * pass explicit options to mysql2 instead of the raw string.
 */
export function parseDatabaseUrl(url: string) {
  let u = url.trim();
  if (/^jdbc:mysql:/i.test(u)) u = u.replace(/^jdbc:/i, "");
  const parsed = new URL(u);
  if (parsed.protocol !== "mysql:") {
    throw new Error(`Unsupported DATABASE_URL scheme: ${parsed.protocol}`);
  }

  // Case-insensitive param lookup
  const params = new Map();
  for (const [k, v] of parsed.searchParams) {
    if (!params.has(k.toLowerCase())) params.set(k.toLowerCase(), v);
  }
  const get = (k: string) => (params.has(k) ? params.get(k) : null);

  // SSL config from sslMode/ssl-mode/useSSL/requireSSL
  let ssl: Pool["config"]["ssl"] = undefined;
  const mode = get("ssl-mode") ?? get("sslmode");
  const useSsl = get("usessl") ?? get("requiressl");
  if (useSsl !== null && mode === null) {
    if (/^(true|1|yes|on|preferred)$/i.test(useSsl)) ssl = { rejectUnauthorized: false };
    else if (/^(false|0|no|off)$/i.test(useSsl)) ssl = undefined;
  } else if (mode !== null) {
    if (/^disabled$/i.test(mode)) ssl = undefined;
    else if (/^required$|^preferred$/i.test(mode)) ssl = { rejectUnauthorized: false };
    else if (/^verify_ca$|^verify_identity$/i.test(mode)) ssl = { rejectUnauthorized: true };
  }
  const rawSsl = get("ssl");
  if (rawSsl !== null && ssl === undefined) {
    if (/^(true|1|yes|on|required)$/i.test(rawSsl)) ssl = { rejectUnauthorized: true };
    else if (/^(false|0|no|off|disabled)$/i.test(rawSsl)) ssl = undefined;
    else {
      try { ssl = JSON.parse(rawSsl); } catch { /* ignore */ }
    }
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || undefined,
    ssl,
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

/**
 * Inject a Drizzle instance for the current runtime.
 *
 * The Node/Express path never calls this — it uses the lazy singleton from
 * DATABASE_URL. The Worker path calls `setDbHandle()` at startup with a
 * Drizzle instance connected via the `connect()` outbound TCP adapter.
 * Tests call it with a throwaway database handle.
 */
export function setDbHandle(db: ReturnType<typeof drizzle> | null): void {
  _externalDb = db;
  _db = null;
}

export async function getDb() {
  if (_externalDb) return _externalDb;
  if (!_db && process.env.DATABASE_URL) {
    try {
      const config = parseDatabaseUrl(process.env.DATABASE_URL);
      _pool = createPool(config);
      instrumentPool(_pool);
      _db = drizzle(_pool, { logger: false }) as unknown as ReturnType<typeof drizzle>;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Releases the optional mysql pool for disposable test databases and graceful shutdown paths. */
export async function closeDatabaseConnection() {
  const client = _db?.$client as { end?: () => Promise<void> } | undefined;
  _db = null;
  _externalDb = null;
  await client?.end?.();
  if (_pool) {
    try {
      await _pool.end();
    } catch (err: unknown) {
      // Pool may already be closed by test teardown; ignore "closed state" errors
      if (err instanceof Error && /closed state/i.test(err.message)) {
        // ignore
      } else {
        throw err;
      }
    }
    _pool = null;
  }
}

export function databaseRequired<T>(db: T | null): T {
  if (!db) throw new Error("Database unavailable");
  return db;
}
