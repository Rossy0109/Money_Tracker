import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { extractAuditContext } from "./auditContext";

function req(init: {
  headers?: Record<string, string>;
  ip?: string;
  remoteAddress?: string;
}): Request {
  return {
    headers: init.headers ?? {},
    ip: init.ip,
    socket: init.remoteAddress ? { remoteAddress: init.remoteAddress } : {},
  } as unknown as Request;
}

describe("extractAuditContext", () => {
  it("returns nulls without a request", () => {
    expect(extractAuditContext()).toEqual({
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
    expect(extractAuditContext(null)).toEqual({
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
  });

  it("prefers the first forwarded IP, then fallbacks", () => {
    expect(
      extractAuditContext(
        req({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })
      ).ipAddress
    ).toBe("1.2.3.4");
    expect(
      extractAuditContext(req({ headers: { "x-real-ip": "9.9.9.9" } }))
        .ipAddress
    ).toBe("9.9.9.9");
    expect(extractAuditContext(req({ ip: "10.0.0.1" })).ipAddress).toBe(
      "10.0.0.1"
    );
    expect(
      extractAuditContext(req({ remoteAddress: "192.168.0.2" })).ipAddress
    ).toBe("192.168.0.2");
  });

  it("passes through user-agent and request-id", () => {
    const ctx = extractAuditContext(
      req({ headers: { "user-agent": "agent/1", "x-request-id": "req-1" } })
    );
    expect(ctx.userAgent).toBe("agent/1");
    expect(ctx.requestId).toBe("req-1");
  });

  it("generates a request id when missing", () => {
    const ctx = extractAuditContext(req({}));
    expect(ctx.userAgent).toBeNull();
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.requestId!.length).toBeGreaterThan(0);
  });
});
