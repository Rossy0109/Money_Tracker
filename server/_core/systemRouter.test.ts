import { describe, expect, it, vi } from "vitest";

// runHealthChecks touches Drive, backups, integrity and DB probes — mock it so
// this test exercises only the router's own wiring (auth + RBAC + response shape).
vi.mock("../healthChecks", () => ({
  runHealthChecks: vi.fn().mockResolvedValue({
    database: "ok",
    auth: "ok",
    storage: "not_configured",
    vercel: "unknown",
  }),
}));

// RBAC is authoritative for permissionProcedure — mock the permission
// layer so healthReport's gate is exercised without a live DB.
vi.mock("./rbac", () => ({
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
  hasAnyPermission: vi.fn().mockResolvedValue(true),
  hasAllPermissions: vi.fn().mockResolvedValue(true),
  hasRole: vi.fn().mockResolvedValue(true),
  getUserPermissions: vi.fn().mockResolvedValue(["settings.view"]),
  getUserRoles: vi.fn().mockResolvedValue(["user"]),
  isAdminRoleUser: vi.fn().mockResolvedValue(false),
}));

import { runHealthChecks } from "../healthChecks";
import { appRouter } from "../routers";

const userContext = {
  user: {
    id: 42,
    openId: "user-42",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
} as any;

describe("system.health", () => {
  it("returns ok for a valid timestamp", async () => {
    const caller = appRouter.createCaller(userContext);
    const result = await caller.system.health({ timestamp: 1700000000000 });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a negative timestamp", async () => {
    const caller = appRouter.createCaller(userContext);
    await expect(
      caller.system.health({ timestamp: -1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("system.healthReport", () => {
  it("builds the report for the signed-in caller", async () => {
    const caller = appRouter.createCaller(userContext);
    const result = await caller.system.healthReport();
    expect(runHealthChecks).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({
      database: "ok",
      auth: "ok",
      storage: "not_configured",
      vercel: "unknown",
    });
  });

  it("refuses an unauthenticated caller", async () => {
    const caller = appRouter.createCaller({ ...userContext, user: null });
    await expect(caller.system.healthReport()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
