import { TRPCError } from "@trpc/server";
import type { Request } from "express";

/**
 * Per-process (in-memory) rate limiter.
 *
 * Limitations for multi-instance deployments: counters are local to this
 * Node process, so N instances each allow up to `max` independently. Auth
 * hardening does NOT rely on this alone:
 *   - DB-backed account lockout (failed_login_attempts) is multi-instance safe
 *     and is enforced on every password login.
 *   - express-rate-limit (app.ts) provides an additional IP-based layer.
 * If you need strict cross-instance limits, back this store with Redis/DB.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((record, key) => {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000).unref?.();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}

/**
 * Resolve a stable client IP for rate-limit keys.
 *
 * Prefer Express `req.ip` (computed with `trust proxy` so only the trusted
 * hop's X-Forwarded-For entry is used). Never key on the raw X-Forwarded-For
 * header: clients can spoof it to mint fresh rate-limit buckets.
 */
export function getClientIp(req?: Pick<Request, "ip" | "socket" | "headers"> | null): string {
  if (req?.ip) return req.ip;
  const socketIp = req?.socket?.remoteAddress;
  if (socketIp) return socketIp;
  // Last resort only — still take a single hop, not the full spoofable list.
  const xff = req?.headers?.["x-forwarded-for"];
  const firstHop = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
  return firstHop || "unknown-ip";
}

/**
 * Checks rate limits by key (e.g., IP address or user identifier).
 * Throws TRPCError with code TOO_MANY_REQUESTS when limit is exceeded.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { remaining: number; resetAt: number } {
  // Skip rate limiting in testing environments
  if (process.env.NODE_ENV === "test" || process.env.ISOLATED_E2E_DATABASE === "true") {
    return { remaining: options.max, resetAt: Date.now() + options.windowMs };
  }

  const storeKey = `${options.keyPrefix || "rl"}:${key}`;
  const now = Date.now();
  const record = rateLimitStore.get(storeKey);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(storeKey, {
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
        `খুব বেশি চেষ্টার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে। ${retryAfterSec} সেকেন্ড পর আবার চেষ্টা করুন।`,
    });
  }

  record.count += 1;
  return { remaining: options.max - record.count, resetAt: record.resetAt };
}

/**
 * Reset rate limit counter for a specific key (e.g., on successful login).
 */
export function resetRateLimit(key: string, keyPrefix = "rl"): void {
  rateLimitStore.delete(`${keyPrefix}:${key}`);
}
