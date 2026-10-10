import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  revokeSessionByToken: vi.fn().mockResolvedValue(undefined),
  revokeAllSessionsExcept: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined),
  setUserPassword: vi.fn().mockResolvedValue(undefined),
  systemActorUserId: vi.fn().mockResolvedValue(0),
  validatePasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_core/sdk", () => ({
  sdk: { createSessionToken: vi.fn().mockResolvedValue("session-token") },
}));

vi.mock("../_core/passwordAuth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
  verifyPasswordConstantTime: vi.fn().mockResolvedValue(true),
}));

vi.mock("../_core/rateLimiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
  resetRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("203.0.113.7"),
}));

vi.mock("../_core/rbac", () => ({
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
  hasAnyPermission: vi.fn().mockResolvedValue(true),
  hasAllPermissions: vi.fn().mockResolvedValue(true),
  hasRole: vi.fn().mockResolvedValue(true),
  getUserPermissions: vi.fn().mockResolvedValue(["accounting.read"]),
  getUserRoles: vi.fn().mockResolvedValue(["MANAGER"]),
  isAdminRoleUser: vi.fn().mockResolvedValue(false),
}));

import {
  revokeSessionByToken,
  revokeAllSessionsExcept,
  setUserPassword,
  logAudit,
  validatePasswordResetToken,
} from "../db";
import {
  getUserPermissions,
  getUserRoles,
  hasAnyPermission,
} from "../_core/rbac";
import { hashPassword } from "../_core/passwordAuth";
import { appRouter } from "../routers";

const user = {
  id: 7,
  openId: "auth-router-open",
  email: "user@example.com",
  name: "User",
  loginMethod: "google" as const,
  role: "user" as const,
  status: "active" as const,
  passwordHash: "super-secret-hash",
  resetToken: "reset-secret",
  resetTokenExpiresAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    user,
    req: { protocol: "https", headers: {}, ip: "203.0.113.7" },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserRoles).mockResolvedValue(["MANAGER"]);
  vi.mocked(getUserPermissions).mockResolvedValue(["accounting.read"]);
  vi.mocked(hashPassword).mockResolvedValue("hashed");
});

describe("auth.me", () => {
  it("returns null for an anonymous caller", async () => {
    const caller = appRouter.createCaller(context({ user: null }));
    await expect(caller.auth.me()).resolves.toBeNull();
  });

  it("never leaks password or reset secrets", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("resetToken");
    expect(result).not.toHaveProperty("resetTokenExpiresAt");
    expect(result).toMatchObject({
      id: 7,
      email: "user@example.com",
      roles: ["MANAGER"],
      permissions: ["accounting.read"],
    });
  });

  it("degrades to empty RBAC lists instead of throwing", async () => {
    vi.mocked(getUserRoles).mockRejectedValue(new Error("rbac down"));
    const caller = appRouter.createCaller(context());
    const result = await caller.auth.me();
    expect(result).toMatchObject({ id: 7, roles: [], permissions: [] });
  });
});

describe("auth.logout", () => {
  it("revokes the session token carried in the cookie", async () => {
    const caller = appRouter.createCaller(
      context({
        req: { protocol: "https", headers: { cookie: "app_session_id=tok-123" } },
      })
    );
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(revokeSessionByToken).toHaveBeenCalledWith("tok-123");
  });

  it("succeeds without a cookie and clears it regardless", async () => {
    const res = { clearCookie: vi.fn(), cookie: vi.fn() };
    const caller = appRouter.createCaller(context({ res }));
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(revokeSessionByToken).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });
});

describe("auth.setPassword", () => {
  it("hashes and stores the new password for an input operator", async () => {
    const caller = appRouter.createCaller(context());
    const result = await caller.auth.setPassword({ password: "secret123" });
    expect(result).toMatchObject({ success: true });
    expect(hashPassword).toHaveBeenCalledWith("secret123");
    expect(setUserPassword).toHaveBeenCalledWith("auth-router-open", "hashed");
  });

  it("rejects a password shorter than 6 characters", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.auth.setPassword({ password: "123" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("revokes other recorded sessions while keeping the caller's live token", async () => {
    const caller = appRouter.createCaller(
      context({
        req: {
          protocol: "https",
          headers: { cookie: "app_session_id=current-tok" },
        },
      })
    );
    const result = await caller.auth.setPassword({ password: "secret123" });
    expect(result).toMatchObject({ success: true });
    expect(revokeAllSessionsExcept).toHaveBeenCalledWith(7, "current-tok");
  });

  it("revokes every recorded session when the caller's token cannot be identified", async () => {
    const caller = appRouter.createCaller(context());
    await caller.auth.setPassword({ password: "secret123" });
    expect(revokeAllSessionsExcept).toHaveBeenCalledWith(7, "");
  });

  it("emits a permission_denied audit when the user has no create permission", async () => {
    vi.mocked(hasAnyPermission).mockResolvedValue(false);
    const caller = appRouter.createCaller(context());
    await expect(
      caller.auth.setPassword({ password: "secret123" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(setUserPassword).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "permission_denied",
        entityType: "rbac_permission",
      })
    );
  });
});

describe("auth.resetPassword", () => {
  it("rate-limits password resets before validating the token", async () => {
    vi.mocked(validatePasswordResetToken).mockResolvedValue({
      valid: false,
      user: null,
    });
    const caller = appRouter.createCaller(context());
    await expect(
      caller.auth.resetPassword({
        token: "reset-token",
        password: "NewPassw0rd!",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(validatePasswordResetToken).toHaveBeenCalledWith("reset-token");
    const checkRateLimit = (await import("../_core/rateLimiter")).checkRateLimit;
    expect(checkRateLimit).toHaveBeenCalledWith(
      "203.0.113.7",
      expect.objectContaining({ keyPrefix: "auth-reset-password", max: 5 })
    );
  });
});