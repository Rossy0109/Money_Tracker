import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "./_core/rateLimiter";

describe("Authentication rate limiter", () => {
  it("allows requests under the rate limit threshold", () => {
    const key = "test-ip-1";
    resetRateLimit(key, "auth-test");

    // Temporarily bypass test mode check
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const res1 = checkRateLimit(key, { windowMs: 60000, max: 3, keyPrefix: "auth-test" });
      expect(res1.remaining).toBe(2);

      const res2 = checkRateLimit(key, { windowMs: 60000, max: 3, keyPrefix: "auth-test" });
      expect(res2.remaining).toBe(1);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("throws TRPCError TOO_MANY_REQUESTS when rate limit is exceeded", () => {
    const key = "test-ip-2";
    resetRateLimit(key, "auth-test-2");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      checkRateLimit(key, { windowMs: 60000, max: 2, keyPrefix: "auth-test-2" });
      checkRateLimit(key, { windowMs: 60000, max: 2, keyPrefix: "auth-test-2" });

      expect(() => {
        checkRateLimit(key, { windowMs: 60000, max: 2, keyPrefix: "auth-test-2" });
      }).toThrow(/খুব বেশি চেষ্টার কারণে/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("resets rate limit counter on resetRateLimit call", () => {
    const key = "test-ip-3";
    resetRateLimit(key, "auth-test-3");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      checkRateLimit(key, { windowMs: 60000, max: 1, keyPrefix: "auth-test-3" });
      resetRateLimit(key, "auth-test-3");

      const res = checkRateLimit(key, { windowMs: 60000, max: 1, keyPrefix: "auth-test-3" });
      expect(res.remaining).toBe(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
