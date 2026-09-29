import { describe, expect, it } from "vitest";
import {
  INPUT_OPERATOR_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_NAMES,
  categoryForPermission,
  getAllPermissions,
  getPermissionsForRole,
  roleHasPermission,
} from "./permissions";

describe("permission lookups (via server adapter)", () => {
  it("lists every permission exactly once", () => {
    const all = getAllPermissions();
    expect(all).toHaveLength(46);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("voucher.post");
  });

  it("returns [] for unknown roles", () => {
    expect(getPermissionsForRole("NOPE")).toEqual([]);
  });

  it("grants SUPER_ADMIN the full set", () => {
    const all = getAllPermissions();
    for (const permission of all) {
      expect(roleHasPermission("SUPER_ADMIN", permission)).toBe(true);
    }
  });

  it("enforces the input-operator contract", () => {
    expect(getPermissionsForRole("INPUT_OPERATOR")).toEqual([
      ...INPUT_OPERATOR_PERMISSIONS,
    ]);
    expect(roleHasPermission("INPUT_OPERATOR", "voucher.create")).toBe(true);
    expect(roleHasPermission("INPUT_OPERATOR", "voucher.read")).toBe(false);
    expect(roleHasPermission("VIEWER", "voucher.create")).toBe(false);
    expect(roleHasPermission("UNKNOWN", "voucher.create")).toBe(false);
  });

  it("covers every named role", () => {
    for (const role of Object.keys(ROLE_NAMES)) {
      expect(getPermissionsForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("maps permissions to categories", () => {
    expect(categoryForPermission("voucher.post")).toBe("voucher");
    expect(categoryForPermission("auth.login")).toBe("auth");
    expect(categoryForPermission("nope.unknown")).toBe("other");
    for (const list of Object.values(PERMISSION_GROUPS)) {
      for (const permission of list as readonly string[]) {
        expect(categoryForPermission(permission)).not.toBe("other");
      }
    }
  });
});
