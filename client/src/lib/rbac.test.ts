import { describe, expect, it } from "vitest";
import {
  getDisplayRole,
  getUserPermissions,
  getUserRoles,
  hasAllPermissions,
  hasAnyPermission,
  hasAnyRole,
  hasPermission,
  hasRole,
  isAdminUser,
  isFinanceAdmin,
  isInputOnlyUser,
  type AuthGatingUser,
} from "./rbac";

/**
 * UI/server authorization alignment.
 *
 * The server `adminProcedure` gate (`isAdminRoleUser`) passes only
 * SUPER_ADMIN / SYSTEM_ADMIN roles, so `isAdminUser` must match exactly —
 * permission holders without those roles (e.g. ACCOUNTING_ADMIN with
 * audit.read) are denied server-side and must not see the admin surface.
 */
describe("isAdminUser mirrors the server admin gate", () => {
  it("grants admin UI to SUPER_ADMIN and SYSTEM_ADMIN roles", () => {
    expect(isAdminUser({ roles: ["SUPER_ADMIN"], permissions: [] })).toBe(true);
    expect(isAdminUser({ roles: ["SYSTEM_ADMIN"], permissions: [] })).toBe(
      true
    );
  });

  it("denies admin UI to permission holders without an admin role", () => {
    const accountingAdmin = {
      roles: ["ACCOUNTING_ADMIN"],
      permissions: [
        "accounting.read",
        "audit.read",
        "audit.export",
        "backup.view",
      ],
    };
    expect(isAdminUser(accountingAdmin)).toBe(false);
    expect(
      isAdminUser({ roles: ["MANAGER"], permissions: ["audit.read"] })
    ).toBe(false);
    expect(
      isAdminUser({ roles: ["VIEWER"], permissions: ["audit.read"] })
    ).toBe(false);
  });

  it("never grants admin UI from legacy users.role alone", () => {
    expect(isAdminUser({ role: "admin", roles: [], permissions: [] })).toBe(
      false
    );
    expect(isAdminUser({ role: "admin" })).toBe(false);
  });
});

describe("isInputOnlyUser", () => {
  it("restricts INPUT_OPERATOR role holders", () => {
    expect(
      isInputOnlyUser({ roles: ["INPUT_OPERATOR"], permissions: [] })
    ).toBe(true);
  });

  it("restricts create-only permission sets", () => {
    expect(
      isInputOnlyUser({
        roles: [],
        permissions: ["auth.login", "accounting.create"],
      })
    ).toBe(true);
    expect(
      isInputOnlyUser({ roles: ["VIEWER"], permissions: ["accounting.read"] })
    ).toBe(false);
  });

  it("lets attached RBAC data win over the legacy flag, fails closed without it", () => {
    expect(
      isInputOnlyUser({
        role: "input_only",
        roles: [],
        permissions: ["accounting.read"],
      })
    ).toBe(false);
    expect(
      isInputOnlyUser({ role: "input_only", roles: [], permissions: [] })
    ).toBe(true);
  });
});

describe("hasPermission / getDisplayRole", () => {
  it("checks attached permissions", () => {
    expect(hasPermission({ permissions: ["backup.view"] }, "backup.view")).toBe(
      true
    );
    expect(
      hasPermission({ permissions: ["backup.view"] }, "backup.create")
    ).toBe(false);
  });

  it("labels legacy roles without granting privilege", () => {
    expect(
      getDisplayRole({ role: "admin", roles: [], permissions: [] })
    ).toContain("Legacy");
  });
});

describe("accessors are null-safe", () => {
  it("returns empty arrays for null/undefined/empty users", () => {
    for (const candidate of [null, undefined, { roles: [], permissions: [] }]) {
      expect(getUserRoles(candidate)).toEqual([]);
      expect(getUserPermissions(candidate)).toEqual([]);
    }
  });

  it("ignores non-array roles/permissions payloads", () => {
    const bogus = {
      roles: "ADMIN",
      permissions: "read",
    } as unknown as AuthGatingUser;
    expect(getUserRoles(bogus)).toEqual([]);
    expect(getUserPermissions(bogus)).toEqual([]);
  });
});

describe("role predicates", () => {
  it("hasRole matches exactly", () => {
    expect(hasRole({ roles: ["MANAGER"] }, "MANAGER")).toBe(true);
    expect(hasRole({ roles: ["MANAGER"] }, "VIEWER")).toBe(false);
    expect(hasRole(null, "MANAGER")).toBe(false);
  });

  it("hasAnyRole uses OR logic and is false for an empty list", () => {
    expect(hasAnyRole({ roles: ["MANAGER"] }, ["VIEWER", "MANAGER"])).toBe(true);
    expect(hasAnyRole({ roles: ["MANAGER"] }, ["VIEWER"])).toBe(false);
    expect(hasAnyRole({ roles: ["MANAGER"] }, [])).toBe(false);
  });
});

describe("permission predicates", () => {
  const candidate = { permissions: ["budget.read", "budget.create"] };

  it("hasAnyPermission uses OR logic", () => {
    expect(hasAnyPermission(candidate, ["budget.delete", "budget.read"])).toBe(
      true
    );
    expect(hasAnyPermission(candidate, ["budget.delete"])).toBe(false);
    expect(hasAnyPermission(candidate, [])).toBe(false);
  });

  it("hasAllPermissions uses AND logic", () => {
    expect(hasAllPermissions(candidate, ["budget.read", "budget.create"])).toBe(
      true
    );
    expect(
      hasAllPermissions(candidate, ["budget.read", "budget.delete"])
    ).toBe(false);
    expect(hasAllPermissions(candidate, [])).toBe(true);
  });
});

describe("finance admin gating mirrors the server", () => {
  it("accepts super or accounting admin", () => {
    expect(isFinanceAdmin({ roles: ["SUPER_ADMIN"] })).toBe(true);
    expect(isFinanceAdmin({ roles: ["ACCOUNTING_ADMIN"] })).toBe(true);
    // Mirrors the server: SYSTEM_ADMIN is deliberately not a finance admin.
    expect(isFinanceAdmin({ roles: ["SYSTEM_ADMIN"] })).toBe(false);
    expect(isFinanceAdmin({ roles: ["HR_ADMIN"] })).toBe(false);
  });
});

describe("getDisplayRole labels", () => {
  it.each([
    ["SUPER_ADMIN", "সুইট অ্যাডমিন"],
    ["SYSTEM_ADMIN", "সিস্টেম অ্যাডমিন"],
    ["ACCOUNTING_ADMIN", "হিসাব অ্যাডমিন"],
    ["HR_ADMIN", "এইচআর অ্যাডমিন"],
    ["MANAGER", "ম্যানেজার"],
    ["INPUT_OPERATOR", "ইনপুট অপারেটর"],
    ["VIEWER", "দর্শক"],
  ])("maps %s to a non-empty label", role => {
    const label = getDisplayRole({ roles: [role] });
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toContain("Legacy");
  });

  it("prefers the most privileged role when several are held", () => {
    const label = getDisplayRole({
      roles: ["VIEWER", "SUPER_ADMIN"],
    });
    expect(label).toBe(getDisplayRole({ roles: ["SUPER_ADMIN"] }));
  });

  it("defaults to the plain user label", () => {
    expect(getDisplayRole({ roles: [] })).not.toContain("Legacy");
    expect(getDisplayRole(null)).not.toContain("Legacy");
  });
});
