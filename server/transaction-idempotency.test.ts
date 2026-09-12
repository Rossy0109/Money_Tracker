import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: any }> = [];
  const baseRecord = {
    id: 88,
    userId: 42,
    projectId: 88,
    categoryId: 7,
    accountId: 3,
    name: "Default",
    type: "expense",
    amount: "450.00",
    paymentMethod: "Cash",
    prefix: "V",
    startNumber: 1,
    endNumber: 999999,
    nextNumber: 1,
    occurredAt: new Date("2026-08-19T12:00:00.000Z"),
  };

  const client = {
    select: vi.fn((_fields?: any) => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => {
            const tableName =
              table?._?.name || table?.[Symbol.for("drizzle:Name")] || "";
            if (tableName === "finance_transactions") {
              return [];
            }
            return [baseRecord];
          },
          orderBy: async () => [baseRecord],
        }),
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: any) => {
        inserts.push({ table, values });
        return {
          onDuplicateKeyUpdate: async () => [
            { insertId: 777, affectedRows: 1 },
          ],
          then: (
            resolve: (
              value: Array<{ insertId: number; affectedRows: number }>
            ) => unknown
          ) =>
            Promise.resolve([{ insertId: 777, affectedRows: 1 }]).then(resolve),
        };
      },
    })),
    update: vi.fn(() => ({
      set: () => ({ where: async () => [{ affectedRows: 1 }] }),
    })),
    delete: vi.fn(() => ({ where: async () => [{ affectedRows: 1 }] })),
  };
  Object.assign(client, {
    transaction: vi.fn(
      async (callback: (tx: typeof client) => Promise<unknown>) =>
        callback(client)
    ),
  });
  return { client, inserts };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

import { createTransaction } from "./db";

describe("Transaction Idempotency Verification", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    process.env.DATABASE_URL = "mysql://idempotency-test";
  });

  it("creates a transaction on first submission with idempotency key", async () => {
    const txId = await createTransaction(42, {
      projectId: 88,
      categoryId: 7,
      type: "expense",
      amount: 450,
      paymentMethod: "Cash",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      idempotencyKey: "client-req-uuid-test-1",
    });

    expect(txId).toBeDefined();
    expect(state.inserts.length).toBeGreaterThan(0);
  });

  it("returns cached transaction ID on repeated submission with same idempotency key without duplicate insert", async () => {
    const id1 = await createTransaction(42, {
      projectId: 88,
      categoryId: 7,
      type: "expense",
      amount: 450,
      paymentMethod: "Cash",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      idempotencyKey: "client-req-uuid-test-2",
    });

    const countAfterFirst = state.inserts.length;

    const id2 = await createTransaction(42, {
      projectId: 88,
      categoryId: 7,
      type: "expense",
      amount: 450,
      paymentMethod: "Cash",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      idempotencyKey: "client-req-uuid-test-2",
    });

    expect(id2).toBe(id1);
    // Inserts should not increase on repeated call with same idempotency key
    expect(state.inserts.length).toBe(countAfterFirst);
  });
});
