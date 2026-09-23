import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./_core/dbConnection", () => ({
  getDb: async () => mocks.db,
  databaseRequired: (db: unknown) => {
    if (!db) throw new Error("Database unavailable");
    return db;
  },
  closeDatabaseConnection: async () => {},
}));

import { deleteEmployee } from "./db";

type ChainResult = unknown[];

function makeFakeDb(selectResults: ChainResult[], calls: string[]) {
  const nextSelect = async () => selectResults.shift() ?? [];
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: nextSelect,
        }),
      }),
    }),
    delete: () => {
      calls.push("delete");
      return {
        where: async () => [{ affectedRows: 1 }],
      };
    },
    insert: () => ({
      values: async () => [{ insertId: 1 }],
    }),
  };
}

describe("deleteEmployee financial-history protection", () => {
  beforeEach(() => {
    mocks.db = null;
  });

  it("refuses to delete an employee that has salary payments", async () => {
    const calls: string[] = [];
    mocks.db = makeFakeDb(
      [[{ id: 7, userId: 1 }], [{ id: 9, name: "X", userId: 1 }], [{ id: 3 }]],
      calls
    );
    await expect(deleteEmployee(1, 7, 9)).rejects.toThrow(/বেতন বা অগ্রিম/);
    expect(calls).not.toContain("delete");
  });

  it("refuses to delete an employee that has advances", async () => {
    const calls: string[] = [];
    mocks.db = makeFakeDb(
      [
        [{ id: 7, userId: 1 }],
        [{ id: 9, name: "X", userId: 1 }],
        [],
        [{ id: 5 }],
      ],
      calls
    );
    await expect(deleteEmployee(1, 7, 9)).rejects.toThrow(/বেতন বা অগ্রিম/);
    expect(calls).not.toContain("delete");
  });

  it("deletes an employee with no financial history", async () => {
    const calls: string[] = [];
    mocks.db = makeFakeDb(
      [[{ id: 7, userId: 1 }], [{ id: 9, name: "X", userId: 1 }], [], []],
      calls
    );
    await expect(deleteEmployee(1, 7, 9)).resolves.toEqual({ success: true });
    expect(calls).toContain("delete");
  });

  it("reports a missing employee", async () => {
    const calls: string[] = [];
    mocks.db = makeFakeDb([[{ id: 7, userId: 1 }], []], calls);
    await expect(deleteEmployee(1, 7, 999)).rejects.toThrow(/পাওয়া যায়নি/);
    expect(calls).not.toContain("delete");
  });
});
