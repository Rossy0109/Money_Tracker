/**
 * Idempotency — Persistent duplicate-request prevention.
 *
 * Protects against: double-click, network retry, browser retry,
 * API retry, server retry, duplicate payment submission.
 *
 * Flow (INSERT-first reservation):
 *  1. Client sends mutation with `idempotencyKey` in input.
 *  2. Middleware claims the key with an atomic INSERT (pending state).
 *  3. Claim won → execute handler, finalize with response body.
 *  4. Claim lost → same payload + completed → replay cached response.
 *     same payload + in-flight → conflict (another request running).
 *     different payload → conflict.
 *  5. Handler throws → claim released so client can retry with same key.
 *
 * Design:
 *  - Unique constraint (userId, idempotencyKey) is the race lock (INSERT-first).
 *  - requestHash (stable deep SHA-256) detects replay with different payload.
 *  - TTL-based expiry allows garbage collection (24h default).
 */

import { eq, and, lt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { databaseRequired, getDb } from "../db";
import { idempotencyKeys } from "../../drizzle/schema";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** responseStatus reserved for an in-flight claim (not yet completed). */
export const PENDING_RESPONSE_STATUS = 0;

export interface IdempotencyResult {
  /** Whether this is a cached (duplicate) request */
  isReplay: boolean;
  /** The cached response status if replay, null otherwise */
  status: number | null;
  /** The cached response body if replay, null otherwise */
  body: string | null;
}

export type IdempotencyClaim =
  | { outcome: "claimed" }
  | { outcome: "replay"; status: number; body: string }
  | { outcome: "in_progress" }
  | { outcome: "conflict"; message: string };

/** Stable deep stringify: sorted object keys, arrays preserved. */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  );
  return `{${parts.join(",")}}`;
}

/**
 * Hash the request body for payload fingerprinting (order-independent, nested-safe).
 * Detects cases where the same idempotency key is sent with different data.
 */
export function hashRequest(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/**
 * Atomically claim an idempotency key (INSERT-first).
 * Returns whether this caller owns the key for execution.
 */
export async function claimIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
  requestHash: string,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<IdempotencyClaim> {
  const db = databaseRequired(await getDb());
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    await db.insert(idempotencyKeys).values({
      userId,
      idempotencyKey,
      route,
      requestHash,
      responseStatus: PENDING_RESPONSE_STATUS,
      responseBody: "",
      expiresAt,
    });
    return { outcome: "claimed" };
  } catch {
    // Duplicate key — someone else claimed (or a completed record exists).
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
          eq(idempotencyKeys.route, route)
        )
      )
      .limit(1);

    if (!existing) {
      // Claim vanished (expired purge race) — retry once as a fresh claim.
      try {
        await db.insert(idempotencyKeys).values({
          userId,
          idempotencyKey,
          route,
          requestHash,
          responseStatus: PENDING_RESPONSE_STATUS,
          responseBody: "",
          expiresAt,
        });
        return { outcome: "claimed" };
      } catch {
        return {
          outcome: "conflict",
          message: `ইডেমপোটেন্সি কী "${idempotencyKey}" একই সাথে ব্যবহৃত হচ্ছে।`,
        };
      }
    }

    if (existing.expiresAt && new Date(existing.expiresAt) <= new Date()) {
      // Expired — delete and claim fresh.
      await db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.id, existing.id));
      return claimIdempotency(
        userId,
        idempotencyKey,
        route,
        requestHash,
        ttlMs
      );
    }

    if (existing.requestHash !== requestHash) {
      return {
        outcome: "conflict",
        message: `ইডেমপোটেন্সি কী "${idempotencyKey}" ইতিমধ্যে ব্যবহৃত হয়েছে কিন্তু ভিন্ন ডেটা পাঠানো হয়েছে।`,
      };
    }

    if (existing.responseStatus === PENDING_RESPONSE_STATUS) {
      return { outcome: "in_progress" };
    }

    return {
      outcome: "replay",
      status: existing.responseStatus,
      body: existing.responseBody,
    };
  }
}

/**
 * Finalize a claimed key with the successful handler response.
 */
export async function completeIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
  responseStatus: number,
  responseBody: unknown,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const db = databaseRequired(await getDb());
  const body =
    typeof responseBody === "string"
      ? responseBody
      : JSON.stringify(responseBody);
  const expiresAt = new Date(Date.now() + ttlMs);

  await db
    .update(idempotencyKeys)
    .set({ responseStatus, responseBody: body, expiresAt })
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        eq(idempotencyKeys.route, route)
      )
    );
}

/**
 * Check whether an idempotency key already exists for this user+route.
 * Returns the cached result if found and not expired.
 */
export async function checkIdempotency(
  userId: number,
  idempotencyKey: string,
  route: string,
  requestHash: string
): Promise<IdempotencyResult> {
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        eq(idempotencyKeys.route, route)
      )
    )
    .limit(1);

  if (existing) {
    // Check if expired
    if (existing.expiresAt && new Date(existing.expiresAt) > new Date()) {
      // Same payload fingerprint?
      if (existing.requestHash === requestHash) {
        if (existing.responseStatus === PENDING_RESPONSE_STATUS) {
          return { isReplay: false, status: null, body: null };
        }
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
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
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
  ttlMs: number = DEFAULT_TTL_MS
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
      responseBody:
        typeof responseBody === "string"
          ? responseBody
          : JSON.stringify(responseBody),
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        responseStatus,
        responseBody:
          typeof responseBody === "string"
            ? responseBody
            : JSON.stringify(responseBody),
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
  route: string
): Promise<void> {
  const db = databaseRequired(await getDb());
  await db
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        eq(idempotencyKeys.route, route)
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
  const affected = (result as { affectedRows?: number }).affectedRows;
  return affected ?? 0;
}
