import { drizzle } from "drizzle-orm/mysql2";

let _db: ReturnType<typeof drizzle> | null = null;
let _externalDb: ReturnType<typeof drizzle> | null = null;

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
      _db = drizzle(process.env.DATABASE_URL, {
        logger: false,
      });
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
}

export function databaseRequired<T>(db: T | null): T {
  if (!db) throw new Error("Database unavailable");
  return db;
}
