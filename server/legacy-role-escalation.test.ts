import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Legacy users.role must never grant admin privilege on its own.
 * RBAC (user_roles / role_permissions) is the only authority.
 */

const rbacMock = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
  hasRole: vi.fn(),
  getUserPermissions: vi.fn(),
  getUserRoles: vi.fn(),
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
  isAdminRoleUser: vi.fn(),
}));

vi.mock("./_core/rbac", () => rbacMock);

const financeDb = vi.hoisted(() => ({
  listUsersForAdmin: vi.fn(),
  listProjectsForAdmin: vi.fn(),
  listAuditLogsPage: vi.fn(),
  listAuditLogsForExport: vi.fn(),
  getAuditLogActivity: vi.fn(),
  updateUserStatus: vi.fn(),
  logAudit: vi.fn(),
  getOverview: vi.fn(),
}));

vi.mock("./db", () => financeDb);

import { appRouter } from "./routers";

const legacyAdminBase = {
  id: 77,
  openId: "legacy-admin",
  email: "legacy@example.com",
  name: "Legacy Admin",
  loginMethod: "google",
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const legacyAdminUser = { ...legacyAdminBase, role: "admin" as const };

type TestUser = typeof legacyAdminUser | (typeof legacyAdminBase & { role: "input_only" });

function ctxWithUser(user: TestUser | null) {
  return {
    user,
    adminElevation: null,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
  } as any;
}

describe("legacy users.role cannot escalate privileges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deny-by-default RBAC: this user holds no admin RBAC role.
    rbacMock.isAdminRoleUser.mockResolvedValue(false);
    rbacMock.hasPermission.mockResolvedValue(false);
    rbacMock.hasAnyPermission.mockResolvedValue(false);
    rbacMock.hasAllPermissions.mockResolvedValue(false);
    rbacMock.hasRole.mockResolvedValue(false);
    rbacMock.getUserPermissions.mockResolvedValue([]);
    rbacMock.getUserRoles.mockResolvedValue([]);
    financeDb.listUsersForAdmin.mockResolvedValue([]);
    financeDb.listProjectsForAdmin.mockResolvedValue([]);
    financeDb.listAuditLogsPage.mockResolvedValue({ logs: [], page: 1, pageSize: 25 });
    financeDb.listAuditLogsForExport.mockResolvedValue([]);
    financeDb.getAuditLogActivity.mockResolvedValue({});
    financeDb.updateUserStatus.mockResolvedValue({});
  });

  it("admin.users is FORBIDDEN when only legacy role=admin", async () => {
    const caller = appRouter.createCaller(ctxWithUser(legacyAdminUser));
    await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rbacMock.isAdminRoleUser).toHaveBeenCalledWith(77);
    expect(financeDb.listUsersForAdmin).not.toHaveBeenCalled();
  });

  it("admin.verifyAccess is FORBIDDEN when only legacy role=admin", async () => {
    const caller = appRouter.createCaller(ctxWithUser(legacyAdminUser));
    await expect(
      caller.admin.verifyAccess({ password: "any-password" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin.elevationStatus is FORBIDDEN when only legacy role=admin", async () => {
    const caller = appRouter.createCaller(ctxWithUser(legacyAdminUser));
    await expect(caller.admin.elevationStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin.auditLogs is FORBIDDEN when only legacy role=admin", async () => {
    const caller = appRouter.createCaller(ctxWithUser(legacyAdminUser));
    await expect(caller.admin.auditLogs({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("RBAC SUPER_ADMIN still passes admin gate", async () => {
    rbacMock.isAdminRoleUser.mockResolvedValue(true);
    financeDb.listUsersForAdmin.mockResolvedValue([{ id: 1 }]);
    const now = Date.now();
    const caller = appRouter.createCaller({
      ...ctxWithUser(legacyAdminUser),
      adminElevation: {
        userId: 77,
        openId: "legacy-admin",
        role: "admin" as const,
        issuedAt: now,
        expiresAt: now + 15 * 60 * 1000,
      },
    });
    await expect(caller.admin.users()).resolves.toBeDefined();
  });

  it("legacy input_only role cannot read finance.overview", async () => {
    const inputOnly = {
      ...legacyAdminUser,
      id: 42,
      openId: "legacy-input",
      role: "input_only" as const,
    };
    const caller = appRouter.createCaller(ctxWithUser(inputOnly));
    await expect(caller.finance.overview({ projectId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
