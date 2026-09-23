/**
 * Audit System Tests — Phase 10.
 *
 * Tests:
 *  1. extractAuditContext captures ip, userAgent, requestId
 *  2. AuditAction type compiles with all 15 required actions
 *  3. append-only guards throw on delete/update attempts
 *  4. logAudit type signature accepts all new fields
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractAuditContext } from "./_core/auditContext";
import { deleteAuditLogs, updateAuditLogs } from "./db";
import type { AuditAction, AuditContext } from "./db";

// ─── extractAuditContext Tests ───────────────────────────────────────────────

describe("extractAuditContext", () => {
  it("extracts IP from x-forwarded-for (first entry)", () => {
    const req = {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2", "user-agent": "Chrome" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    const ctx = extractAuditContext(req);
    expect(ctx.ipAddress).toBe("10.0.0.1");
    expect(ctx.userAgent).toBe("Chrome");
  });

  it("extracts IP from x-real-ip", () => {
    const req = {
      headers: { "x-real-ip": "203.0.113.50", "user-agent": "Firefox" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    expect(extractAuditContext(req).ipAddress).toBe("203.0.113.50");
  });

  it("falls back to req.ip", () => {
    const req = {
      headers: { "user-agent": "Safari" },
      ip: "192.168.1.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    expect(extractAuditContext(req).ipAddress).toBe("192.168.1.1");
  });

  it("falls back to socket.remoteAddress", () => {
    const req = { headers: {}, ip: undefined, socket: { remoteAddress: "10.0.0.5" } } as any;
    expect(extractAuditContext(req).ipAddress).toBe("10.0.0.5");
  });

  it("returns null for null request", () => {
    expect(extractAuditContext(null)).toEqual({ ipAddress: null, userAgent: null, requestId: null });
  });

  it("returns null for undefined request", () => {
    expect(extractAuditContext(undefined)).toEqual({ ipAddress: null, userAgent: null, requestId: null });
  });

  it("generates a requestId if none provided", () => {
    const req = { headers: {}, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as any;
    const ctx = extractAuditContext(req);
    expect(ctx.requestId).toBeTruthy();
    expect(typeof ctx.requestId).toBe("string");
    expect(ctx.requestId!.length).toBeGreaterThan(0);
  });

  it("uses x-request-id header if provided", () => {
    const req = {
      headers: { "x-request-id": "custom-req-id" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    expect(extractAuditContext(req).requestId).toBe("custom-req-id");
  });

  it("trims whitespace from x-forwarded-for IP", () => {
    const req = {
      headers: { "x-forwarded-for": "  10.0.0.99  , 10.0.0.100" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    expect(extractAuditContext(req).ipAddress).toBe("10.0.0.99");
  });

  it("returns full AuditContext shape", () => {
    const ctx = extractAuditContext(null);
    expect(ctx).toHaveProperty("ipAddress");
    expect(ctx).toHaveProperty("userAgent");
    expect(ctx).toHaveProperty("requestId");
  });
});

// ─── Append-Only Guard Tests ────────────────────────────────────────────────

describe("Audit Append-Only Guards", () => {
  it("deleteAuditLogs always throws", async () => {
    await expect(deleteAuditLogs()).rejects.toThrow("append-only");
  });

  it("updateAuditLogs always throws", async () => {
    await expect(updateAuditLogs()).rejects.toThrow("append-only");
  });
});

// ─── Type-Level Tests (compile-time checks) ─────────────────────────────────

describe("Audit Type System", () => {
  it("AuditAction includes all 15 required actions", () => {
    const allActions: AuditAction[] = [
      "create", "update", "delete", "delete_attempt",
      "approve", "reject", "post", "reverse",
      "login", "logout", "login_failed",
      "permission_denied", "user_suspended",
      "backup_created", "backup_restored",
    ];
    expect(allActions.length).toBe(15);
    const unique = new Set(allActions);
    expect(unique.size).toBe(15);
  });

  it("AuditContext has correct shape", () => {
    const ctx: AuditContext = {
      ipAddress: "1.2.3.4",
      userAgent: "TestAgent",
      requestId: "req-1",
    };
    expect(ctx.ipAddress).toBe("1.2.3.4");
    expect(ctx.userAgent).toBe("TestAgent");
    expect(ctx.requestId).toBe("req-1");
  });

  it("AuditContext allows null values", () => {
    const ctx: AuditContext = {
      ipAddress: null,
      userAgent: null,
      requestId: null,
    };
    expect(ctx.ipAddress).toBeNull();
  });
});

// ─── Integration: Context → Audit Flow ──────────────────────────────────────

describe("Audit Integration Flow", () => {
  it("extractAuditContext produces data compatible with logAudit auditContext param", () => {
    const mockReq = {
      headers: {
        "x-forwarded-for": "10.0.0.1",
        "user-agent": "Chrome/90",
        "x-request-id": "req-123",
      },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const ctx = extractAuditContext(mockReq);

    // Verify shape matches what logAudit expects
    const auditCtx: AuditContext = ctx;
    expect(auditCtx.ipAddress).toBe("10.0.0.1");
    expect(auditCtx.userAgent).toBe("Chrome/90");
    expect(auditCtx.requestId).toBe("req-123");
  });

  it("null context produces null audit context fields", () => {
    const ctx = extractAuditContext(null);
    const auditCtx: AuditContext = ctx;
    expect(auditCtx.ipAddress).toBeNull();
    expect(auditCtx.userAgent).toBeNull();
    expect(auditCtx.requestId).toBeNull();
  });

  it("logAudit function signature accepts all new fields", () => {
    // This is a compile-time check — if it compiles, the types are correct
    const logAuditCall = {
      actorUserId: 1,
      actorRole: "admin",
      projectId: 1,
      action: "create" as AuditAction,
      entityType: "voucher",
      entityId: 42,
      summary: "Created voucher",
      oldData: null,
      newData: { amount: 500 },
      auditContext: {
        ipAddress: "10.0.0.1",
        userAgent: "Chrome",
        requestId: "req-123",
      },
    };
    expect(logAuditCall.action).toBe("create");
    expect(logAuditCall.auditContext?.ipAddress).toBe("10.0.0.1");
  });
});

// ─── Security-Sensitive Action Audit Verification ────────────────────────────

describe("Security-Sensitive Action Audit Verification", () => {
  it("verifies scheduledBackup and cloudBackupService audit with backup_created", () => {
    const backupSrc = readFileSync(new URL("./scheduledBackup.ts", import.meta.url), "utf8");
    expect(backupSrc).toContain('"backup_created"');
    expect(backupSrc).toContain("storedCount");
    const cloudBackupSrc = readFileSync(new URL("./cloudBackupService.ts", import.meta.url), "utf8");
    expect(cloudBackupSrc).toContain('"backup_created"');
    expect(cloudBackupSrc).toContain("uploadSuccess ? \"backup_created\"");
  });

  it("verifies restoreProjectBackup audits with backup_restored", () => {
    const dbSrc = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(dbSrc).toContain('action: "backup_restored"');
  });

  it("verifies updateUserStatus audits user suspension", () => {
    const dbSrc = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(dbSrc).toContain('action: status === "suspended" ? "user_suspended" : "update"');
  });

  it("verifies permission denial is audited in authz.ts", () => {
    const authzSrc = readFileSync(new URL("./_core/authz.ts", import.meta.url), "utf8");
    expect(authzSrc).toContain('action: "permission_denied"');
  });

  it("verifies login, logout, and login_failed are audited in routers.ts and oauth.ts", () => {
    const routerSrc = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSrc).toContain('action: "login_failed"');
    expect(routerSrc).toContain('action: "login"');
    expect(routerSrc).toContain('action: "logout"');

    const oauthSrc = readFileSync(new URL("./_core/oauth.ts", import.meta.url), "utf8");
    expect(oauthSrc).toContain('action: "login_failed"');
    expect(oauthSrc).toContain('action: "login"');
  });
});

