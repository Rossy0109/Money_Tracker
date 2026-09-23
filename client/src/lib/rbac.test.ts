import { describe, expect, it } from "vitest";
import {
  getDisplayRole,
  hasPermission,
  isAdminUser,
  isInputOnlyUser,
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
