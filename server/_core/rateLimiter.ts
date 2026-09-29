import { TRPCError } from "@trpc/server";

/**
 * Pluggable rate limit store.
 *
 * Node path: in-memory Map (per-process, best-effort).
 * Worker path: KV-backed store (distributed, multi-instance safe).
 */
export interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitRecord | null> | RateLimitRecord | null;
  set(
    key: string,
    record: RateLimitRecord
  ): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

class MemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, RateLimitRecord>();

  get(key: string): RateLimitRecord | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, record: RateLimitRecord): void {
    this.map.set(key, record);
  }

  delete(key: string): void {
    this.map.delete(key);
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function setRateLimitStore(s: RateLimitStore): void {
  store = s;
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}

/**
 * Resolve a stable client IP for rate-limit keys.
 */
export function getClientIp(
  req?: {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers: Record<string, unknown>;
  } | null
): string {
  if (req?.ip) return req.ip;
  const socketIp = req?.socket?.remoteAddress;
  if (socketIp) return socketIp;
  const xff = req?.headers?.["x-forwarded-for"];
  const firstHop = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return firstHop || "unknown-ip";
}

/**
 * Checks rate limits by key (e.g., IP address or user identifier).
 * Throws TRPCError with code TOO_MANY_REQUESTS when limit is exceeded.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<{ remaining: number; resetAt: number }> {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.ISOLATED_E2E_DATABASE === "true"
  ) {
    return { remaining: options.max, resetAt: Date.now() + options.windowMs };
  }

  const storeKey = `${options.keyPrefix || "rl"}:${key}`;
  const now = Date.now();
  const record = await store.get(storeKey);

  if (!record || now > record.resetAt) {
    await store.set(storeKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { remaining: options.max - 1, resetAt: now + options.windowMs };
  }

  if (record.count >= options.max) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        options.message ||
        `খুব বেশি চেষ্টার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে। ${retryAfterSec} সেকেন্ড পর আবার চেষ্টা করুন।`,
    });
  }

  record.count += 1;
  await store.set(storeKey, record);
  return { remaining: options.max - record.count, resetAt: record.resetAt };
}

/**
 * Reset rate limit counter for a specific key (e.g., on successful login).
 */
export async function resetRateLimit(
  key: string,
  keyPrefix = "rl"
): Promise<void> {
  await store.delete(`${keyPrefix}:${key}`);
}
