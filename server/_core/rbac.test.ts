import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dbConnection", () => ({
  getDb: vi.fn(),
  databaseRequired: (db: unknown) => {
    if (!db) throw new Error("Database unavailable");
    return db;
  },
  closeDatabaseConnection: vi.fn(),
}));

import { getDb } from "./dbConnection";
import {
  ROLE_NAMES,
  assignRole,
  clearRBACCache,
  getUserPermissions,
  getUserRoles,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
  initializeRBAC,
  isAccountingAdmin,
  isAdminRoleUser,
  isFinanceAdmin,
  isHRAdmin,
  isInputOperator,
  isManager,
  isSuperAdmin,
  isSystemAdmin,
  isViewer,
  markRBACReady,
  markRBACUnavailable,
  removeRole,
} from "./rbac";

/**
 * Fluent stub that resolves to `rows` while still exposing the drizzle
 * builder methods the module chains together.
 */
function chainFor(rows: unknown): any {
  const promise: any = Promise.resolve(rows);
  for (const method of [
    "from",
    "innerJoin",
    "where",
    "limit",
    "values",
    "onDuplicateKeyUpdate",
    "set",
  ]) {
    promise[method] = () => promise;
  }
  return promise;
}

let selectRows: unknown[] = [];
let insertRows: unknown[] = [{ affectedRows: 1 }];

beforeEach(() => {
  vi.clearAllMocks();
  selectRows = [];
  insertRows = [{ affectedRows: 1 }];
  markRBACReady();
  vi.mocked(getDb).mockResolvedValue({
    select: () => chainFor(selectRows),
    insert: () => chainFor(insertRows),
    delete: () => chainFor([{ affectedRows: 1 }]),
  } as any);
});

describe("rbac readiness", () => {
  it("fails closed while RBAC is marked unavailable", async () => {
    markRBACUnavailable();
    await expect(getUserPermissions(1)).rejects.toThrow(
      "RBAC initialization unavailable"
    );
    await expect(getUserRoles(1)).rejects.toThrow(
      "RBAC initialization unavailable"
    );
    markRBACReady();
    await expect(getUserPermissions(1)).resolves.toEqual([]);
  });

  it("initializeRBAC marks the system ready", async () => {
    markRBACUnavailable();
    await initializeRBAC();
    await expect(getUserPermissions(1)).resolves.toEqual([]);
  });

  it("clearRBACCache is a safe no-op", () => {
    expect(clearRBACCache()).toBeUndefined();
  });
});

describe("permission lookups", () => {
  it("deduplicates and sorts permissions", async () => {
    selectRows = [{ name: "b.read" }, { name: "a.read" }, { name: "b.read" }];
    await expect(getUserPermissions(7)).resolves.toEqual(["a.read", "b.read"]);
  });

  it("hasPermission matches a single permission", async () => {
    selectRows = [{ name: "accounting.read" }];
    await expect(hasPermission(7, "accounting.read")).resolves.toBe(true);
    await expect(hasPermission(7, "accounting.create")).resolves.toBe(false);
  });

  it("hasAnyPermission uses OR logic", async () => {
    selectRows = [{ name: "accounting.read" }];
    await expect(
      hasAnyPermission(7, ["accounting.create", "accounting.read"])
    ).resolves.toBe(true);
    await expect(
      hasAnyPermission(7, ["accounting.create", "budget.read"])
    ).resolves.toBe(false);
    await expect(hasAnyPermission(7, [])).resolves.toBe(false);
  });

  it("hasAllPermissions uses AND logic", async () => {
    selectRows = [{ name: "accounting.read" }, { name: "budget.read" }];
    await expect(
      hasAllPermissions(7, ["accounting.read", "budget.read"])
    ).resolves.toBe(true);
    await expect(
      hasAllPermissions(7, ["accounting.read", "budget.create"])
    ).resolves.toBe(false);
    await expect(hasAllPermissions(7, [])).resolves.toBe(true);
  });
});

describe("role lookups", () => {
  it("deduplicates and sorts roles", async () => {
    selectRows = [{ name: "VIEWER" }, { name: "MANAGER" }, { name: "VIEWER" }];
    await expect(getUserRoles(7)).resolves.toEqual(["MANAGER", "VIEWER"]);
  });

  it("hasRole matches a single role", async () => {
    selectRows = [{ name: ROLE_NAMES.MANAGER }];
    await expect(hasRole(7, ROLE_NAMES.MANAGER)).resolves.toBe(true);
    await expect(hasRole(7, ROLE_NAMES.VIEWER)).resolves.toBe(false);
  });
});

describe("role assignment", () => {
  it("assigns a role and reports a single affected row", async () => {
    selectRows = [{ id: 3 }];
    insertRows = [{ affectedRows: 1 }];
    await expect(assignRole(7, ROLE_NAMES.VIEWER, 1)).resolves.toBe(true);
  });

  it("reports false when nothing was affected", async () => {
    selectRows = [{ id: 3 }];
    insertRows = [{ affectedRows: 0 }];
    await expect(assignRole(7, ROLE_NAMES.VIEWER, 1)).resolves.toBe(false);
  });

  it("throws when the role does not exist", async () => {
    selectRows = [];
    await expect(assignRole(7, "NO_SUCH_ROLE", 1)).rejects.toThrow(
      "Role not found: NO_SUCH_ROLE"
    );
  });

  it("removes a role and throws when it does not exist", async () => {
    selectRows = [{ id: 3 }];
    await expect(removeRole(7, ROLE_NAMES.VIEWER)).resolves.toBeUndefined();
    selectRows = [];
    await expect(removeRole(7, "NO_SUCH_ROLE")).rejects.toThrow(
      "Role not found: NO_SUCH_ROLE"
    );
  });
});

describe("role predicates", () => {
  it.each([
    ["isSuperAdmin", isSuperAdmin, ROLE_NAMES.SUPER_ADMIN],
    ["isSystemAdmin", isSystemAdmin, ROLE_NAMES.SYSTEM_ADMIN],
    ["isAccountingAdmin", isAccountingAdmin, ROLE_NAMES.ACCOUNTING_ADMIN],
    ["isHRAdmin", isHRAdmin, ROLE_NAMES.HR_ADMIN],
    ["isManager", isManager, ROLE_NAMES.MANAGER],
    ["isInputOperator", isInputOperator, ROLE_NAMES.INPUT_OPERATOR],
    ["isViewer", isViewer, ROLE_NAMES.VIEWER],
  ])("%s is true only when the role is held", async (_name, predicate, role) => {
    selectRows = [{ name: role }];
    await expect(predicate(7)).resolves.toBe(true);
    selectRows = [];
    await expect(predicate(7)).resolves.toBe(false);
  });

  it("isFinanceAdmin accepts super or accounting admin", async () => {
    selectRows = [{ name: ROLE_NAMES.SUPER_ADMIN }];
    await expect(isFinanceAdmin(7)).resolves.toBe(true);
    selectRows = [{ name: ROLE_NAMES.ACCOUNTING_ADMIN }];
    await expect(isFinanceAdmin(7)).resolves.toBe(true);
    // SYSTEM_ADMIN is deliberately NOT a finance admin.
    selectRows = [{ name: ROLE_NAMES.SYSTEM_ADMIN }];
    await expect(isFinanceAdmin(7)).resolves.toBe(false);
  });

  it("isAdminRoleUser accepts super or system admin", async () => {
    selectRows = [{ name: ROLE_NAMES.SUPER_ADMIN }];
    await expect(isAdminRoleUser(7)).resolves.toBe(true);
    selectRows = [{ name: ROLE_NAMES.SYSTEM_ADMIN }];
    await expect(isAdminRoleUser(7)).resolves.toBe(true);
    selectRows = [{ name: ROLE_NAMES.MANAGER }];
    await expect(isAdminRoleUser(7)).resolves.toBe(false);
  });
});