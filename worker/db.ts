import { drizzle } from "drizzle-orm/mysql2";
import { WorkerSocketStream } from "./socketStream";

/**
 * Create a Drizzle instance for the Worker runtime.
 *
 * In production (Workers), uses the `connect()` outbound TCP API to create
 * a socket to the MySQL/TiDB server, wrapped in a stream adapter for mysql2.
 *
 * In local development and tests (Node), uses a direct mysql2 connection
 * via DATABASE_URL.
 */

interface WorkerDbEnv {
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_NAME?: string;
}

function isWorkersRuntime(): boolean {
  return (
    typeof process === "undefined" ||
    !process.versions?.node ||
    typeof (globalThis as Record<string, unknown>).connect === "function"
  );
}

function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export function createWorkerDb(env: WorkerDbEnv) {
  if (isWorkersRuntime() && env.DATABASE_URL) {
    const { host, port } = parseDatabaseUrl(env.DATABASE_URL);
    const socket = connect(`${host}:${port}`, {
      allowHalfOpen: false,
    });
    const stream = new WorkerSocketStream(socket);
    return drizzle({ stream } as never, { logger: false });
  }

  const url = env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("DATABASE_URL is required for the Worker database");
  }
  return drizzle(url, { logger: false });
}
