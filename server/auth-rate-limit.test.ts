import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "./_core/rateLimiter";

describe("Authentication rate limiter", () => {
  it("allows requests under the rate limit threshold", async () => {
    const key = "test-ip-1";
    await resetRateLimit(key, "auth-test");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const res1 = await checkRateLimit(key, {
        windowMs: 60000,
        max: 3,
        keyPrefix: "auth-test",
      });
      expect(res1.remaining).toBe(2);

      const res2 = await checkRateLimit(key, {
        windowMs: 60000,
        max: 3,
        keyPrefix: "auth-test",
      });
      expect(res2.remaining).toBe(1);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("throws TRPCError TOO_MANY_REQUESTS when rate limit is exceeded", async () => {
    const key = "test-ip-2";
    await resetRateLimit(key, "auth-test-2");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      await checkRateLimit(key, {
        windowMs: 60000,
        max: 2,
        keyPrefix: "auth-test-2",
      });
      await checkRateLimit(key, {
        windowMs: 60000,
        max: 2,
        keyPrefix: "auth-test-2",
      });

      await expect(
        checkRateLimit(key, {
          windowMs: 60000,
          max: 2,
          keyPrefix: "auth-test-2",
        })
      ).rejects.toThrow(/খুব বেশি চেষ্টার কারণে/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("resets rate limit counter on resetRateLimit call", async () => {
    const key = "test-ip-3";
    await resetRateLimit(key, "auth-test-3");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      await checkRateLimit(key, {
        windowMs: 60000,
        max: 1,
        keyPrefix: "auth-test-3",
      });
      await resetRateLimit(key, "auth-test-3");

      const res = await checkRateLimit(key, {
        windowMs: 60000,
        max: 1,
        keyPrefix: "auth-test-3",
      });
      expect(res.remaining).toBe(0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("locks out admin verification attempts exceeding 5 failed tries", async () => {
    const key = "admin-1:127.0.0.1";
    await resetRateLimit(key, "admin-verify");

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      for (let i = 0; i < 5; i++) {
        await checkRateLimit(key, {
          windowMs: 15 * 60 * 1000,
          max: 5,
          keyPrefix: "admin-verify",
        });
      }

      await expect(
        checkRateLimit(key, {
          windowMs: 15 * 60 * 1000,
          max: 5,
          keyPrefix: "admin-verify",
        })
      ).rejects.toThrow(/সাময়িকভাবে বন্ধ রাখা হয়েছে/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
