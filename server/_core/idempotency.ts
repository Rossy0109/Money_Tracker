/**
 * Idempotency — Persistent duplicate-request prevention.
 *
 * Protects against: double-click, network retry, browser retry,
 * API retry, server retry, duplicate payment submission.
 *
 * Flow:
 *  1. Client sends mutation with `idempotencyKey` in input.
 *  2. Middleware hashes the key + userId + route → checks idempotency_keys table.
 *  3. If found and not expired → return cached response (no re-execution).
 *  4. If not found → execute handler, store result, return it.
 *  5. If handler throws → nothing stored, client can retry with same key.
 *
 * Design:
 *  - Unique constraint (userId, idempotencyKey) prevents cross-user collision.
 *  - requestHash (SHA-256 of input body) detects replay with different payload.
 *  - TTL-based expiry allows garbage collection (24h default).
 *  - Atomic INSERT ... ON DUPLICATE KEY for race-condition safety.
 */

import { eq, and, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { databaseRequired, getDb } from "../db";
import { idempotencyKeys } from "../../drizzle/schema";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface IdempotencyResult {
  /** Whether this is a cached (duplicate) request */
  isReplay: boolean;
  /** The cached response status if replay, null otherwise */
  status: number | null;
  /** The cached response body if replay, null otherwise */
  body: string | null;
}

/**
 * Hash the request body for payload fingerprinting.
 * Detects cases where the same idempotency key is sent with different data.
 */
export function hashRequest(payload: unknown): string {
  const safe = payload ?? {};
  const serialized = JSON.stringify(safe, Object.keys(safe as any).sort());
  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Check whether an idempotency key already exists for this user+route.
 * Returns the cached result if found and not expired.
 */
export async function checkIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
  requestHash: string,
): Promise<IdempotencyResult> {
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        eq(idempotencyKeys.route, route),
      )
    )
    .limit(1);

  if (existing) {
    // Check if expired
    if (existing.expiresAt && new Date(existing.expiresAt) > new Date()) {
      // Same payload fingerprint?
      if (existing.requestHash === requestHash) {
        return {
          isReplay: true,
          status: existing.responseStatus,
          body: existing.responseBody,
        };
      }
      // Same key but different payload → conflict
      throw new Error(
        `ইডেমপোটেন্সি কী "${idempotencyKey}" ইতিমধ্যে ব্যবহৃত হয়েছে কিন্তু ভিন্ন ডেটা পাঠানো হয়েছে।`
      );
    }
    // Expired — clean up and proceed
    await db
      .delete(idempotencyKeys)
      .where(eq(idempotencyKeys.id, existing.id));
  }

  return { isReplay: false, status: null, body: null };
}

/**
 * Store a successful idempotency result for future replay detection.
 */
export async function storeIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
  requestHash: string,
  responseStatus: number,
  responseBody: unknown,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const db = databaseRequired(await getDb());
  const expiresAt = new Date(Date.now() + ttlMs);

  await db
    .insert(idempotencyKeys)
    .values({
      userId,
      idempotencyKey,
      route,
      requestHash,
      responseStatus,
      responseBody: typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        responseStatus,
        responseBody: typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
        expiresAt,
      },
    });
}

/**
 * Remove an idempotency key (e.g., after a failed operation that should be retriable).
 */
export async function clearIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
): Promise<void> {
  const db = databaseRequired(await getDb());
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        eq(idempotencyKeys.route, route),
      )
    );
}

/**
 * Purge expired idempotency keys. Call periodically (e.g., cron job).
 */
export async function purgeExpiredIdempotencyKeys(): Promise<number> {
  const db = databaseRequired(await getDb());
  const result = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, new Date()));
  return (result as any).affectedRows ?? 0;
}
