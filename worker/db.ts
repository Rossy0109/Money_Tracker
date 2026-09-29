import { drizzle } from "drizzle-orm/mysql2";
import { connect } from "cloudflare:sockets";
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

/**
 * Detects the Workers runtime.
 *
 * `nodejs_compat` defines `process.env` inside Workers, and `connect` is only
 * reachable via `import { connect } from "cloudflare:sockets"` (never as a
 * global), so neither can be used as the signal. Workerd advertises
 * `navigator.userAgent === "Cloudflare-Workers"`; Node's navigator reports
 * `Node.js/...`, so the check is unambiguous in both runtimes.
 */
export function isWorkersRuntime(): boolean {
  const userAgent = (globalThis as { navigator?: { userAgent?: string } })
    .navigator?.userAgent;
  if (typeof userAgent === "string") {
    return userAgent.includes("Cloudflare-Workers");
  }
  // Fallback for runtimes without `navigator` (e.g. workerd during bundling).
  return (
    typeof (globalThis as { caches?: unknown }).caches !== "undefined" &&
    typeof process !== "undefined"
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
