import { describe, expect, it } from "vitest";
import { getClientIp } from "./_core/rateLimiter";

describe("rate-limit client IP extraction", () => {
  it("prefers Express req.ip (trust-proxy computed)", () => {
    const ip = getClientIp({
      ip: "203.0.113.10",
      socket: { remoteAddress: "10.0.0.1" } as any,
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(ip).toBe("203.0.113.10");
  });

  it("does not key on a spoofable multi-hop X-Forwarded-For list", () => {
    // When req.ip is missing, only the first hop is used — never the full list
    // (which an attacker could rotate to mint fresh rate-limit buckets).
    const ip = getClientIp({
      ip: undefined,
      socket: { remoteAddress: "10.0.0.1" } as any,
      headers: { "x-forwarded-for": "attacker-1, attacker-2, attacker-3" },
    });
    // socket remoteAddress preferred over raw header when req.ip absent
    expect(ip).toBe("10.0.0.1");
  });

  it("falls back to first XFF hop only when no ip/socket", () => {
    const ip = getClientIp({
      ip: undefined,
      socket: {} as any,
      headers: { "x-forwarded-for": "  198.51.100.7 , 10.0.0.1" },
    });
    expect(ip).toBe("198.51.100.7");
  });

  it("returns unknown-ip for empty request", () => {
    expect(getClientIp(null)).toBe("unknown-ip");
    expect(getClientIp(undefined)).toBe("unknown-ip");
  });
});
