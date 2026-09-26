import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: number; role: "admin" | "input_only" | "user" }>,
  select: vi.fn(),
  assignRole: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("./db", () => ({
  databaseRequired: <T>(db: T | null) => db,
  getDb: vi.fn(async () => ({ select: state.select })),
  logAudit: state.logAudit,
  systemActorUserId: vi.fn(async () => 999),
}));

vi.mock("./_core/rbac", () => ({
  assignRole: state.assignRole,
}));

import { migrateExistingUsersToRBAC } from "./_core/migrate-existing-users-rbac";

describe("RBAC user migration", () => {
  beforeEach(() => {
    state.users = [];
    state.select.mockReset().mockReturnValue({
      from: vi.fn(async () => state.users),
    });
    state.assignRole.mockReset();
    state.logAudit.mockReset().mockResolvedValue(undefined);
  });

  it("counts and audits only newly inserted user-role assignments", async () => {
    state.users = [
      { id: 1, role: "admin" },
      { id: 2, role: "input_only" },
      { id: 3, role: "user" },
    ];
    state.assignRole
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await migrateExistingUsersToRBAC();

    expect(state.assignRole).toHaveBeenNthCalledWith(1, 1, "SUPER_ADMIN", 1);
    expect(state.assignRole).toHaveBeenNthCalledWith(2, 2, "INPUT_OPERATOR", 2);
    expect(state.assignRole).toHaveBeenNthCalledWith(3, 3, "VIEWER", 3);
    expect(state.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        // The system actor is a real user row: audit_logs.actorUserId is a
        // non-nullable foreign key, so a magic id would be rejected.
        actorUserId: 999,
        entityType: "rbac_migration",
        summary: "Migrated 2/3 existing users to RBAC roles",
      })
    );
  });

  it("does not audit an idempotent rerun with no inserted assignments", async () => {
    state.users = [{ id: 1, role: "user" }];
    state.assignRole.mockResolvedValue(false);

    await migrateExistingUsersToRBAC();

    expect(state.assignRole).toHaveBeenCalledTimes(1);
    expect(state.logAudit).not.toHaveBeenCalled();
  });
});
