import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const record = {
    id: 501,
    userId: 42,
    projectId: 88,
    categoryId: 7,
    accountId: 3,
    type: "expense",
    amount: "1500.00",
    paymentMethod: "bKash",
    note: null,
    occurredAt: new Date("2026-08-19T12:00:00.000Z"),
  };
  const client = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [record], orderBy: async () => [record] }) }) })),
    insert: vi.fn((table: unknown) => ({ values: async (values: unknown) => { inserts.push({ table, values }); return [{ insertId: 501 }]; } })),
    update: vi.fn(() => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) })),
    delete: vi.fn(() => ({ where: async () => [{ affectedRows: 1 }] })),
  };
  return { client, inserts };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

import { auditLogs } from "../drizzle/schema";
import { createTransaction, deleteTransaction, updateBill } from "./db";

describe("audit write integration", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    process.env.DATABASE_URL = "mysql://audit-test";
  });

  it("persists immutable audit records when finance data is created, updated, or deleted", async () => {
    await createTransaction(42, { projectId: 88, categoryId: 7, accountId: 3, type: "expense", amount: 1500, paymentMethod: "bKash", occurredAt: new Date("2026-08-19T12:00:00.000Z") });
    await updateBill(42, 88, 12, { title: "Utility", amount: 500, dueAt: new Date("2026-08-31T12:00:00.000Z"), isPaid: false });
    await deleteTransaction(42, 88, 501);

    const auditEntries = state.inserts.filter(entry => entry.table === auditLogs).map(entry => entry.values);
    expect(auditEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorUserId: 42, projectId: 88, action: "create", entityType: "transaction", entityId: 501 }),
      expect.objectContaining({ actorUserId: 42, projectId: 88, action: "update", entityType: "bill", entityId: 12 }),
      expect.objectContaining({ actorUserId: 42, projectId: 88, action: "delete", entityType: "transaction", entityId: 501 }),
    ]));
  });
});
