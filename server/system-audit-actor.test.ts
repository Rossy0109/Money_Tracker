/**
 * The reserved system audit actor.
 *
 * `audit_logs.actorUserId` is a non-nullable foreign key to `users.id`, so any
 * audit row written by a background job (RBAC seeding, login attempts for
 * unknown users, scheduled backups) must reference a user that really exists.
 * Inventing an id such as `0` or `1` made a brand-new database fail to boot:
 * the RBAC seed's audit insert violated the foreign key and the server refused
 * to start.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  insertedValues: undefined as Record<string, unknown> | undefined,
  usedUpsert: false,
}));

vi.mock("./_core/dbConnection", () => ({
  getDb: async () => ({
    select: state.select,
    insert: state.insert,
  }),
  databaseRequired: (db: unknown) => db,
  closeDatabaseConnection: async () => {},
}));

import { systemActorUserId } from "./audit";

function selectReturning(rows: unknown[][]) {
  return vi.fn(() => {
    const next = rows.shift() ?? [];
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => chain;
    chain.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(next).then(resolve, reject);
    return chain;
  });
}

describe("systemActorUserId", () => {
  beforeEach(() => {
    state.select.mockReset();
    state.insert.mockReset();
    state.insertedValues = undefined;
    state.usedUpsert = false;
    state.insert.mockReturnValue({
      values: (values: Record<string, unknown>) => ({
        onDuplicateKeyUpdate: async () => {
          state.usedUpsert = true;
          state.insertedValues = values;
          return [{ insertId: 7 }];
        },
      }),
    });
  });

  it("reuses the existing system account without inserting", async () => {
    state.select.mockImplementation(selectReturning([[{ id: 42 }]]));

    await expect(systemActorUserId()).resolves.toBe(42);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("provisions the system account when it is missing, then returns its id", async () => {
    state.select.mockImplementation(selectReturning([[], [{ id: 7 }]]));

    await expect(systemActorUserId()).resolves.toBe(7);
    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(state.insertedValues).toMatchObject({
      openId: "system-actor",
      role: "admin",
      status: "active",
    });
  });

  it("is idempotent when two callers race on provisioning", async () => {
    // First select sees nothing, the second sees the row the insert created.
    state.select.mockImplementation(selectReturning([[], [{ id: 9 }]]));

    await expect(systemActorUserId()).resolves.toBe(9);
    // The insert is an upsert, so a losing racer still ends up with a valid id.
    expect(state.usedUpsert).toBe(true);
  });

  it("fails loudly rather than returning a dangling id", async () => {
    state.select.mockImplementation(selectReturning([[], []]));

    await expect(systemActorUserId()).rejects.toThrow(
      "System audit actor could not be provisioned"
    );
  });
});
