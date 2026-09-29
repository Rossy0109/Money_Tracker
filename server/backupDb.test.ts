import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock("./db", () => ({
  databaseRequired: (db: unknown) => db,
  assertOwnedProject: vi.fn(async () => {}),
  getDb: vi.fn(async () => mockDb),
}));

const terminal = (rows: unknown[]) => ({
  orderBy: () => ({ limit: () => Promise.resolve(rows) }),
});
const mockDb = {
  select: vi.fn(() => {
    const rows = state.queue.shift() ?? [];
    return {
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(rows), terminal(rows as unknown[])),
      }),
    };
  }),
};

import { getDb } from "./db";
import {
  backupStatusSummary,
  countProjectRecords,
  getDriveConnection,
  lastBackupForKind,
  saveHealthSnapshot,
} from "./backupDb";

beforeEach(() => {
  state.queue.length = 0;
  vi.clearAllMocks();
});

describe("backupDb stubs", () => {
  it("saveHealthSnapshot is a backward-compatible no-op", async () => {
    await expect(
      saveHealthSnapshot({ probeId: "x", status: "ok" })
    ).resolves.toBeUndefined();
  });

  it("getDriveConnection returns null", async () => {
    await expect(getDriveConnection(1)).resolves.toBeNull();
  });

  it("backupStatusSummary reports zero pending/failed", async () => {
    await expect(backupStatusSummary(1)).resolves.toEqual({
      pending: 0,
      failed: 0,
    });
  });
});

describe("lastBackupForKind", () => {
  it("returns null when no backup row exists", async () => {
    state.queue.push([]);
    await expect(lastBackupForKind(1, "database")).resolves.toBeNull();
    expect(getDb).toHaveBeenCalled();
  });

  it("extracts filename and object record counts", async () => {
    state.queue.push([
      {
        id: 7,
        summary:
          "Cloud backup executed (s3): project-backup-2024-01-01-abc123.enc.json (SHA-256: deadbeef)",
        newData: { recordCounts: { transactions: 3 } },
        createdAt: new Date("2024-01-02T00:00:00Z"),
      },
    ]);
    const result = await lastBackupForKind(1, "database");
    expect(result).toMatchObject({
      backupId: "7",
      fileName: "project-backup-2024-01-01-abc123.enc.json",
      recordCountsJson: JSON.stringify({ transactions: 3 }),
    });
    expect(result?.verifiedAt).toEqual(new Date("2024-01-02T00:00:00Z"));
  });

  it("parses stringified record counts and tolerates corrupt JSON", async () => {
    state.queue.push([
      {
        id: 8,
        summary: "done",
        newData: JSON.stringify({ recordCounts: { accounts: 2 } }),
        createdAt: new Date(),
      },
    ]);
    expect((await lastBackupForKind(1, "database"))?.recordCountsJson).toBe(
      JSON.stringify({ accounts: 2 })
    );

    state.queue.push([
      { id: 9, summary: "done", newData: "{corrupt", createdAt: new Date() },
    ]);
    const corrupt = await lastBackupForKind(1, "database");
    expect(corrupt?.backupId).toBe("9");
    expect(corrupt?.recordCountsJson).toBeNull();
    expect(corrupt?.fileName).toBeNull();
  });
});

describe("countProjectRecords", () => {
  it("counts an empty project as all zeros", async () => {
    state.queue.push(
      [],
      [],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }]
    );
    const counts = await countProjectRecords(1, 2);
    expect(counts).toEqual({
      transactions: 0,
      accounts: 0,
      categories: 0,
      budgets: 0,
      bills: 0,
      dues: 0,
      vouchers: 0,
      chartOfAccounts: 0,
      voucherDebits: 0,
      voucherCredits: 0,
      ledgerEntries: 0,
      journalEntries: 0,
      journalLines: 0,
    });
  });

  it("aggregates voucher and journal children", async () => {
    state.queue.push(
      [{ id: 1 }, { id: 2 }],
      [{ id: 9 }],
      [{ count: 4 }],
      [{ count: 3 }],
      [{ count: 2 }],
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 1 }],
      [{ count: 7 }],
      [{ count: 6 }],
      [{ count: 5 }]
    );
    const counts = await countProjectRecords(1, 2);
    expect(counts.vouchers).toBe(2);
    expect(counts.journalEntries).toBe(1);
    expect(counts.journalLines).toBe(4);
    expect(counts.voucherDebits).toBe(7);
    expect(counts.voucherCredits).toBe(6);
    expect(counts.transactions).toBe(3);
  });
});
