import { describe, expect, it } from "vitest";
import { canLoadAdminData } from "../client/src/lib/adminAccess";

const rbacSuperAdmin = {
  roles: ["SUPER_ADMIN"],
  permissions: ["settings.manage", "role.manage"],
};

const legacyOnlyAdmin = {
  role: "admin" as const,
  roles: [] as string[],
  permissions: [] as string[],
};

const regularUser = {
  role: "user" as const,
  roles: ["VIEWER"] as string[],
  permissions: ["accounting.read"] as string[],
};

describe("administrator dialog behavior", () => {
  it("loads admin panels only for RBAC admins after in-session password verification", () => {
    expect(
      canLoadAdminData({
        user: regularUser,
        verified: true,
        password: "verified",
      })
    ).toBe(false);
    expect(
      canLoadAdminData({
        user: rbacSuperAdmin,
        verified: false,
        password: "verified",
      })
    ).toBe(false);
    expect(
      canLoadAdminData({ user: rbacSuperAdmin, verified: true, password: "" })
    ).toBe(false);
    expect(
      canLoadAdminData({
        user: rbacSuperAdmin,
        verified: true,
        password: "verified",
      })
    ).toBe(true);
  });

  it("never unlocks admin data from legacy users.role=admin alone", () => {
    expect(
      canLoadAdminData({
        user: legacyOnlyAdmin,
        verified: true,
        password: "verified",
      })
    ).toBe(false);
  });

  it("denies unauthenticated callers", () => {
    expect(
      canLoadAdminData({ user: null, verified: true, password: "verified" })
    ).toBe(false);
    expect(
      canLoadAdminData({
        user: undefined,
        verified: true,
        password: "verified",
      })
    ).toBe(false);
  });
});
