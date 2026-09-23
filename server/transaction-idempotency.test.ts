import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: any }> = [];
  const persisted: Array<{ id: number; note?: string | null; userId: number; projectId: number }> = [];
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

  let nextId = 777;

  // Drizzle SQL nodes stringify to [object Object]; walk queryChunks so
  // bound params (the like pattern with the idemp key) are visible.
  const sqlToString = (node: any): string => {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (typeof node === "number" || typeof node === "boolean") return String(node);
    if (Array.isArray(node)) return node.map(sqlToString).join("");
    if (Array.isArray(node.queryChunks)) return node.queryChunks.map(sqlToString).join("");
    if (Array.isArray(node.value)) return node.value.map(String).join("");
    return "";
  };

  const client = {
    select: vi.fn((_fields?: any) => ({
      from: (table: any) => ({
        where: (conditions?: unknown) => ({
          limit: async () => {
            const tableName =
              table?._?.name || table?.[Symbol.for("drizzle:Name")] || "";
            if (tableName === "finance_transactions") {
              // Persist idempotency across calls: if any prior insert used the
              // same key tag in its note, return that row (DB-backed replay).
              const source = sqlToString(conditions);
              for (const row of persisted) {
                if (row.note?.includes("[idemp:")) {
                  const keyMatch = row.note.match(/\[idemp:([^\]]+)\]/);
                  if (keyMatch && source.includes(keyMatch[1])) {
                    return [{ id: row.id }];
                  }
                }
              }
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
        const id = nextId++;
        if (values?.note) {
          persisted.push({
            id,
            note: values.note,
            userId: values.userId,
            projectId: values.projectId,
          });
        }
        return {
          onDuplicateKeyUpdate: async () => [
            { insertId: id, affectedRows: 1 },
          ],
          then: (
            resolve: (
              value: Array<{ insertId: number; affectedRows: number }>
            ) => unknown
          ) =>
            Promise.resolve([{ insertId: id, affectedRows: 1 }]).then(resolve),
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
  return { client, inserts, persisted };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

import { createTransaction } from "./db";

describe("Transaction Idempotency Verification", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.persisted.length = 0;
    process.env.DATABASE_URL = "mysql://idempotency-test";
  });

  it("uses only DB-backed idempotency (no in-memory Map in source)", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).not.toContain("idempotencyStore");
    expect(source).not.toContain("new Map<string, { id: number; timestamp: number }>");
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
