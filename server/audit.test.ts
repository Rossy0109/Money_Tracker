import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/dbConnection", () => ({
  getDb: vi.fn(),
  databaseRequired: (db: unknown) => {
    if (!db) throw new Error("Database unavailable");
    return db;
  },
  closeDatabaseConnection: vi.fn(),
}));

import { getDb } from "./_core/dbConnection";
import {
  deleteAuditLogs,
  getAuditLogActivity,
  listAuditLogs,
  listAuditLogsForExport,
  listAuditLogsPage,
  logAudit,
  systemActorUserId,
  updateAuditLogs,
} from "./audit";

/** Fluent stub that resolves to `rows` while exposing the drizzle builder chain. */
function chainFor(rows: unknown): any {
  const promise: any = Promise.resolve(rows);
  for (const method of [
    "from",
    "leftJoin",
    "innerJoin",
    "where",
    "limit",
    "offset",
    "orderBy",
    "groupBy",
    "values",
    "onDuplicateKeyUpdate",
    "set",
  ]) {
    promise[method] = () => promise;
  }
  return promise;
}

let inserts: unknown[] = [];
/** Queue of row-sets returned by successive select() calls. */
let selectQueue: unknown[][] = [];
let lastInsert: any = null;

function nextSelect(): any {
  const rows = selectQueue.length > 1 ? selectQueue.shift()! : (selectQueue[0] ?? []);
  return chainFor(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  inserts = [];
  selectQueue = [[]];
  lastInsert = null;
  vi.mocked(getDb).mockResolvedValue({
    select: () => nextSelect(),
    insert: () => {
      const promise: any = chainFor([{ affectedRows: 1 }]);
      promise.values = (values: unknown) => {
        inserts.push(values);
        lastInsert = values;
        return promise;
      };
      return promise;
    },
  } as any);
});

describe("systemActorUserId", () => {
  it("returns the existing reserved account id without inserting", async () => {
    selectQueue = [[{ id: 99 }]];
    await expect(systemActorUserId()).resolves.toBe(99);
    expect(inserts).toHaveLength(0);
  });

  it("provisions the reserved account when it is missing", async () => {
    selectQueue = [[], [{ id: 100 }]];
    await expect(systemActorUserId()).resolves.toBe(100);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      openId: "system-actor",
      loginMethod: "system",
      role: "admin",
      status: "active",
    });
  });

  it("throws when the reserved account cannot be provisioned", async () => {
    selectQueue = [[], []];
    await expect(systemActorUserId()).rejects.toThrow(
      "System audit actor could not be provisioned"
    );
  });
});

describe("logAudit", () => {
  it("defaults actorRole, projectId and entityId when omitted", async () => {
    await logAudit({
      actorUserId: 7,
      action: "create",
      entityType: "transaction",
      summary: "created",
    });
    expect(lastInsert).toMatchObject({
      actorUserId: 7,
      actorRole: "user",
      projectId: null,
      entityId: null,
      oldData: null,
      newData: null,
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
  });

  it("serializes old/new payloads and request context", async () => {
    await logAudit({
      actorUserId: 7,
      actorRole: "admin",
      projectId: 3,
      action: "update",
      entityType: "voucher",
      entityId: 12,
      summary: "updated",
      oldData: { amount: 10 },
      newData: { amount: 20 },
      auditContext: {
        ipAddress: "203.0.113.9",
        userAgent: "vitest",
        requestId: "req-1",
      },
    });
    expect(lastInsert).toMatchObject({
      actorRole: "admin",
      projectId: 3,
      entityId: 12,
      oldData: JSON.stringify({ amount: 10 }),
      newData: JSON.stringify({ amount: 20 }),
      ipAddress: "203.0.113.9",
      userAgent: "vitest",
      requestId: "req-1",
    });
  });
});

describe("append-only invariant", () => {
  it("refuses to delete audit logs", async () => {
    await expect(deleteAuditLogs()).rejects.toThrow(/append-only/);
  });

  it("refuses to update audit logs", async () => {
    await expect(updateAuditLogs()).rejects.toThrow(/append-only/);
  });
});

describe("audit log queries", () => {
  it("paginates and reports total pages", async () => {
    selectQueue = [
      [{ id: 1 }, { id: 2 }],
      [{ total: 5 }],
    ];
    const page = await listAuditLogsPage({ page: 2, pageSize: 2 });
    expect(page.logs).toHaveLength(2);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(2);
    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
  });

  it("reports at least one page when there are no rows", async () => {
    selectQueue = [[], [{ total: 0 }]];
    const page = await listAuditLogsPage({ page: 1, pageSize: 10 });
    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(1);
  });

  it("listAuditLogs unwraps the first page", async () => {
    selectQueue = [[{ id: 9 }], [{ total: 1 }]];
    await expect(listAuditLogs()).resolves.toEqual([{ id: 9 }]);
  });

  it("returns export rows directly", async () => {
    selectQueue = [[{ id: 4, summary: "row" }]];
    await expect(listAuditLogsForExport()).resolves.toEqual([
      { id: 4, summary: "row" },
    ]);
  });

  it("aggregates activity counts", async () => {
    selectQueue = [[{ action: "login", count: 3 }]];
    await expect(getAuditLogActivity()).resolves.toEqual([
      { action: "login", count: 3 },
    ]);
  });

  it("tolerates a missing count row", async () => {
    selectQueue = [[], []];
    const page = await listAuditLogsPage({ page: 1, pageSize: 25 });
    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(1);
  });
});