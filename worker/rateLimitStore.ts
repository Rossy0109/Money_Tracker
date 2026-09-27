import type { RateLimitStore, RateLimitRecord } from "../server/_core/rateLimiter";

/**
 * KV-backed rate limit store for Cloudflare Workers.
 *
 * Uses the KV binding for distributed, multi-instance safe rate limiting.
 * Each key is stored as JSON with a TTL matching the rate limit window.
 */
export function createKVRateLimitStore(kv: {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}): RateLimitStore {
  return {
    async get(key: string): Promise<RateLimitRecord | null> {
      const raw = await kv.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RateLimitRecord;
      } catch {
        return null;
      }
    },

    async set(key: string, record: RateLimitRecord): Promise<void> {
      const ttl = Math.ceil((record.resetAt - Date.now()) / 1000);
      await kv.put(key, JSON.stringify(record), {
        expirationTtl: Math.max(ttl, 1),
      });
    },

    async delete(key: string): Promise<void> {
      await kv.delete(key);
    },
  };
}
