import { eq, lt } from "drizzle-orm";
import { rateLimitCounters } from "../../drizzle/schema";
import { databaseRequired, getDb } from "../db";
import type { RateLimitRecord, RateLimitStore } from "./rateLimiter";

/**
 * Database-backed rate-limit store for the Vercel serverless deployment
 * (P2-S-1). Per-process memory counters undercount once requests spread
 * across lambdas, so the limiter's counters live in the shared database.
 * The Worker keeps its KV store and standalone Node keeps memory (one
 * long-lived process); only the Vercel entry swaps this store in.
 *
 * `get`/`set` are not one atomic increment (the RateLimitStore interface is
 * get-then-set), so concurrent requests can still undercount — the same
 * best-effort semantics the memory store has, just shared across instances.
 */
export function createDbRateLimitStore(): RateLimitStore {
  return {
    async get(key: string): Promise<RateLimitRecord | null> {
      const db = databaseRequired(await getDb());
      const [row] = await db
        .select()
        .from(rateLimitCounters)
        .where(eq(rateLimitCounters.key, key))
        .limit(1);
      if (!row) return null;
      if (Date.now() > row.resetAt) {
        // Expired window: drop the row so the caller starts a fresh one.
        await db
          .delete(rateLimitCounters)
          .where(eq(rateLimitCounters.key, key));
        return null;
      }
      return { count: row.count, resetAt: row.resetAt };
    },

    async set(key: string, record: RateLimitRecord): Promise<void> {
      const db = databaseRequired(await getDb());
      await db
        .insert(rateLimitCounters)
        .values({ key, count: record.count, resetAt: record.resetAt })
        .onDuplicateKeyUpdate({
          set: { count: record.count, resetAt: record.resetAt },
        });
      // Occasional sweep (~1 in 20 writes): keys nobody queries again would
      // otherwise accumulate forever in a serverless database.
      if (Math.random() < 0.05) {
        await db
          .delete(rateLimitCounters)
          .where(lt(rateLimitCounters.resetAt, Date.now()));
      }
    },

    async delete(key: string): Promise<void> {
      const db = databaseRequired(await getDb());
      await db.delete(rateLimitCounters).where(eq(rateLimitCounters.key, key));
    },
  };
}
