import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<{ name: string }>,
  select: vi.fn(),
}));

vi.mock("./_core/dbConnection", () => ({
  databaseRequired: <T>(db: T | null) => db,
  getDb: vi.fn(async () => ({ select: state.select })),
}));

import {
  clearRBACCache,
  getUserPermissions,
  getUserRoles,
  initializeRBAC,
} from "./_core/rbac";

describe("RBAC database reads", () => {
  beforeEach(async () => {
    state.rows = [];
    state.select.mockReset();
    state.select.mockImplementation(() => {
      const query: any = {
        from: () => query,
        innerJoin: () => query,
        where: async () => state.rows,
      };
      return query;
    });
    await initializeRBAC();
  });

  it("reads permissions and roles fresh on every authorization lookup", async () => {
    state.rows = [{ name: "accounting.read" }];
    expect(await getUserPermissions(7)).toEqual(["accounting.read"]);

    state.rows = [{ name: "voucher.read" }];
    expect(await getUserPermissions(7)).toEqual(["voucher.read"]);

    state.rows = [{ name: "VIEWER" }];
    expect(await getUserRoles(7)).toEqual(["VIEWER"]);

    state.rows = [{ name: "MANAGER" }];
    expect(await getUserRoles(7)).toEqual(["MANAGER"]);
    expect(state.select).toHaveBeenCalledTimes(4);
    expect(clearRBACCache()).toBeUndefined();
  });
});
