/**
 * Database query timing.
 *
 * Drizzle's `logger` option is called *before* the driver awaits the result,
 * so it can show SQL but never a duration. The timing lives here instead:
 * `instrumentPool` wraps the promise-style `query`/`execute` methods mysql2
 * exposes on the pool and on every connection it hands out (transactions run
 * on a checked-out connection), which covers every round-trip exactly once.
 */

import logger from "./logger";

export const DEFAULT_SLOW_QUERY_MS = 250;
export const MAX_RECENT_SLOW_QUERIES = 20;
const SQL_MAX_LENGTH = 400;

export interface SlowQuerySample {
  sql: string;
  durationMs: number;
  at: string;
}

export interface QueryTimingStats {
  totalQueries: number;
  slowQueries: number;
  slowQueryThresholdMs: number;
  recentSlowQueries: SlowQuerySample[];
}

let totalQueries = 0;
let slowQueries = 0;
const recentSlowQueries: SlowQuerySample[] = [];

export function slowQueryThresholdMs(): number {
  const raw = Number(process.env.SLOW_QUERY_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOW_QUERY_MS;
}

function sqlText(input: unknown): string {
  const sql =
    typeof input === "string"
      ? input
      : ((input as { sql?: unknown } | null)?.sql ?? null);
  if (typeof sql !== "string") return "[unknown query]";
  return sql.replace(/\s+/g, " ").trim().slice(0, SQL_MAX_LENGTH);
}

export function recordQuery(sqlInput: unknown, durationMs: number): void {
  totalQueries += 1;
  if (durationMs < slowQueryThresholdMs()) return;
  slowQueries += 1;
  const sample: SlowQuerySample = {
    sql: sqlText(sqlInput),
    durationMs: Math.round(durationMs * 100) / 100,
    at: new Date().toISOString(),
  };
  recentSlowQueries.push(sample);
  while (recentSlowQueries.length > MAX_RECENT_SLOW_QUERIES) {
    recentSlowQueries.shift();
  }
  logger.warn({ sql: sample.sql, durationMs: sample.durationMs }, "Slow query");
}

export function getQueryTimingStats(): QueryTimingStats {
  return {
    totalQueries,
    slowQueries,
    slowQueryThresholdMs: slowQueryThresholdMs(),
    recentSlowQueries: [...recentSlowQueries],
  };
}

/** Test seam: forget the counters collected so far. */
export function resetQueryTimingStats(): void {
  totalQueries = 0;
  slowQueries = 0;
  recentSlowQueries.length = 0;
}

interface TimedTarget {
  [key: string]: unknown;
}

/** Shadow an instance method with a timed wrapper, preserving `this`. */
function wrapTimed(target: TimedTarget, method: string): void {
  const original = target[method];
  if (typeof original !== "function") return;
  const call = original as (...args: unknown[]) => unknown;
  target[method] = function (this: unknown, ...args: unknown[]) {
    const start = performance.now();
    let result: unknown;
    try {
      result = call.apply(this, args);
    } catch (error) {
      recordQuery(args[0], performance.now() - start);
      throw error;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).then(
        value => {
          recordQuery(args[0], performance.now() - start);
          return value;
        },
        error => {
          recordQuery(args[0], performance.now() - start);
          throw error;
        }
      );
    }
    return result;
  };
}

/**
 * Time every promise-style query issued through `pool` and through each
 * connection it returns.
 */
export function instrumentPool(pool: unknown): void {
  if (!pool || typeof pool !== "object") return;
  const target = pool as TimedTarget;
  wrapTimed(target, "query");
  wrapTimed(target, "execute");

  const originalGetConnection = target.getConnection;
  if (typeof originalGetConnection !== "function") return;
  const getConnection = originalGetConnection as (
    ...args: unknown[]
  ) => unknown;
  target.getConnection = function (this: unknown, ...args: unknown[]) {
    const result = getConnection.apply(this, args);
    if (!result || typeof (result as Promise<unknown>).then !== "function") {
      return result;
    }
    return (result as Promise<unknown>).then(connection => {
      if (connection && typeof connection === "object") {
        wrapTimed(connection as TimedTarget, "query");
        wrapTimed(connection as TimedTarget, "execute");
      }
      return connection;
    });
  };
}
