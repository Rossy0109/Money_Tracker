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
    prefix: "V",
    startNumber: 1,
    endNumber: 999999,
    nextNumber: 1,
    occurredAt: new Date("2026-08-19T12:00:00.000Z"),
  };
  const client = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [record], orderBy: async () => [record] }) }) })),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          onDuplicateKeyUpdate: async () => [{ insertId: 501 }],
          then: (resolve: (value: Array<{ insertId: number }>) => unknown) =>
            Promise.resolve([{ insertId: 501 }]).then(resolve),
        };
      },
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) })),
    delete: vi.fn(() => ({ where: async () => [{ affectedRows: 1 }] })),
  };
  Object.assign(client, {
    transaction: vi.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client)),
  });
  return { client, inserts };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

import { auditLogs } from "../drizzle/schema";
import { createTransaction, deleteTransaction, updateBill, updateVoucherSettings } from "./db";

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

  it("rejects invalid voucher ranges before attempting any database change", async () => {
    await expect(
      updateVoucherSettings(42, {
        projectId: 88,
        prefix: "V",
        startNumber: 0,
        endNumber: 10,
      })
    ).rejects.toThrow("ভাউচার রেঞ্জ সঠিক নয়");
    await expect(
      updateVoucherSettings(42, {
        projectId: 88,
        prefix: "V",
        startNumber: 20,
        endNumber: 10,
      })
    ).rejects.toThrow("ভাউচার রেঞ্জ সঠিক নয়");
  });
});
