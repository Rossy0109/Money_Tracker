import { drizzle } from "drizzle-orm/mysql2";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Use connection string directly; drizzle handles pooling internally with SSL for TiDB
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
  await client?.end?.();
}

export function databaseRequired<T>(db: T | null): T {
  if (!db) throw new Error("Database unavailable");
  return db;
}
