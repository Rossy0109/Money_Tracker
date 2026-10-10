import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  selectRows: [] as unknown[][],
  deleteCalls: 0,
  roleId: 100,
  permissionId: 500,
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
  databaseRequired: (db: unknown) => db,
  logAudit: vi.fn().mockResolvedValue(undefined),
  systemActorUserId: vi.fn().mockResolvedValue(1),
}));

import { getDb, logAudit } from "../db";
import { seedDefaultRBAC } from "./seed-rbac";
import { ROLE_NAMES } from "@shared/rbac";

/** Fluent stub resolving to `rows` while exposing the drizzle builder chain. */
function chainFor(rows: unknown): any {
  const promise: any = Promise.resolve(rows);
  for (const method of [
    "from",
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

type Row = Record<string, unknown>;

/** Classify an inserted row by its shape — drizzle table objects carry no name. */
function rowsOfKind(kind: "permission" | "role" | "grant"): Row[] {
  return dbState.inserts.filter(row => {
    if (kind === "permission") return "category" in row && "displayName" in row;
    if (kind === "role") return "isSystem" in row;
    return "roleId" in row && "permissionId" in row;
  });
}

function makeDb() {
  return {
    insert: () => {
      const promise: any = chainFor([{ affectedRows: 1 }]);
      promise.values = (values: Row) => {
        dbState.inserts.push(values);
        return promise;
      };
      return promise;
    },
    select: () => {
      const rows =
        dbState.selectRows.length > 1
          ? dbState.selectRows.shift()!
          : (dbState.selectRows[0] ?? []);
      return chainFor(rows);
    },
    delete: () => {
      dbState.deleteCalls += 1;
      return chainFor([]);
    },
  };
}

beforeEach(() => {
  dbState.inserts = [];
  dbState.selectRows = [[]];
  dbState.deleteCalls = 0;
  dbState.roleId = 100;
  dbState.permissionId = 500;
  vi.mocked(logAudit).mockClear();
  vi.mocked(getDb).mockResolvedValue(makeDb() as any);
});

describe("seedDefaultRBAC", () => {
  it("upserts the permission catalog from the shared RBAC definition", async () => {
    await seedDefaultRBAC();

    const permissions = rowsOfKind("permission");
    expect(permissions.length).toBeGreaterThan(10);
    const sample = permissions[0] as {
      name: string;
      displayName: string;
      category: string;
    };
    // "accounting.read" → "Accounting Read", with a catalog category.
    expect(sample.name).toContain(".");
    expect(sample.displayName).toContain(" ");
    expect(sample.category).toBeTruthy();
  });

  it("upserts every role and marks only super/system admins as system roles", async () => {
    await seedDefaultRBAC();

    const roles = rowsOfKind("role");
    const byName = new Map(roles.map(r => [String(r.name), r.isSystem]));
    for (const roleName of Object.values(ROLE_NAMES)) {
      expect(byName.has(roleName)).toBe(true);
    }
    expect(byName.get(ROLE_NAMES.SUPER_ADMIN)).toBe(true);
    expect(byName.get(ROLE_NAMES.SYSTEM_ADMIN)).toBe(true);
    expect(byName.get(ROLE_NAMES.MANAGER)).toBe(false);
    expect(byName.get(ROLE_NAMES.VIEWER)).toBe(false);
  });

  it("is strictly additive — never deletes", async () => {
    await seedDefaultRBAC();
    expect(dbState.deleteCalls).toBe(0);
  });

  it("writes a single audit entry when the catalog changed", async () => {
    await seedDefaultRBAC();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({
      action: "create",
      entityType: "rbac_seed",
    });
  });

  it("creates role→permission grants when roles and permissions resolve", async () => {
    dbState.selectRows = [[{ id: dbState.roleId }], [{ id: dbState.permissionId }]];
    await seedDefaultRBAC();

    const grants = rowsOfKind("grant");
    expect(grants.length).toBeGreaterThan(0);
    expect(grants[0]).toMatchObject({
      roleId: dbState.roleId,
      permissionId: dbState.permissionId,
    });
  });

  it("skips grants when a role id cannot be resolved", async () => {
    dbState.selectRows = [[]];
    await seedDefaultRBAC();
    expect(rowsOfKind("grant")).toHaveLength(0);
  });

  it("skips a grant when the permission row is missing", async () => {
    dbState.selectRows = [[{ id: dbState.roleId }], []];
    await seedDefaultRBAC();
    expect(rowsOfKind("grant")).toHaveLength(0);
  });
});