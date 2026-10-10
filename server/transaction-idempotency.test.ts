import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: any }> = [];
  const transactions = new Map<string, any>();
  const baseRecord = {
    id: 88,
    userId: 42,
    projectId: 88,
    name: "Default",
  };
  const coa = [
    {
      id: 101,
      code: "1110",
      isDetail: true,
      isActive: true,
      currentBalance: "0.00",
    },
    {
      id: 102,
      code: "1120",
      isDetail: true,
      isActive: true,
      currentBalance: "0.00",
    },
    {
      id: 103,
      code: "4100",
      isDetail: true,
      isActive: true,
      currentBalance: "0.00",
    },
    {
      id: 104,
      code: "5110",
      isDetail: true,
      isActive: true,
      currentBalance: "0.00",
    },
  ];
  const account = {
    id: 3,
    userId: 42,
    projectId: 88,
    type: "cash",
    chartOfAccountId: 101,
    currentBalance: "0.00",
  };
  const category = {
    id: 7,
    userId: 42,
    projectId: 88,
    type: "expense",
    chartOfAccountId: 104,
    name: "Default",
  };
  const settings = {
    id: 9,
    userId: 42,
    projectId: 88,
    prefix: "V",
    startNumber: 1,
    endNumber: 999999,
    nextNumber: 1,
  };
  let nextId = 777;

  const tableName = (table: any) =>
    table?._?.name || table?.[Symbol.for("drizzle:Name")] || "";
  const rowsFor = (table: any) => {
    switch (tableName(table)) {
      case "users":
        return [{ id: 42 }];
      case "finance_projects":
        return [{ id: 88, userId: 42 }];
      case "finance_account_types":
        return [{ id: 1, code: "ASSET" }];
      case "finance_chart_of_accounts":
        return coa;
      case "finance_accounts":
        return [account];
      case "finance_categories":
        return [category];
      case "finance_voucher_settings":
        return [settings];
      case "finance_period_locks":
        return [];
      case "finance_vouchers":
        return [];
      case "finance_voucher_debits":
      case "finance_voucher_credits":
      case "finance_ledger_entries":
      case "finance_journal_entries":
      case "finance_journal_lines":
        return [];
      case "finance_transactions":
        return [...transactions.values()];
      default:
        return [baseRecord];
    }
  };
  const client: any = {
    select: vi.fn(() => {
      let table: any;
      const chain: any = {};
      chain.from = vi.fn((value: any) => {
        table = value;
        return chain;
      });
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);
      chain.for = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (value: any[]) => unknown) =>
        Promise.resolve(rowsFor(table)).then(resolve);
      chain.catch = (reject: any) => chain.then(undefined, reject);
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: (values: any) => {
        inserts.push({ table, values });
        const name = tableName(table);
        if (name === "finance_chart_of_accounts")
          coa.push({
            id: nextId++,
            currentBalance: "0.00",
            isDetail: true,
            isActive: true,
            ...values,
          });
        if (
          name === "finance_transactions" &&
          values.idempotencyKey &&
          !transactions.has(values.idempotencyKey)
        ) {
          const id = nextId++;
          transactions.set(values.idempotencyKey, { ...values, id });
        }
        const id = Number(
          transactions.get(values.idempotencyKey)?.id || nextId++
        );
        const result = [{ insertId: id, affectedRows: 1 }];
        return {
          onDuplicateKeyUpdate: vi.fn(async () => result),
          then: (resolve: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: any) => ({
        where: async () => {
          if (tableName(table) === "finance_transactions") {
            for (const [key, row] of transactions) {
              if (
                row.id === values.id ||
                row.idempotencyKey === values.idempotencyKey ||
                values.voucherId
              ) {
                transactions.set(key, { ...row, ...values });
              }
            }
          }
          return [{ affectedRows: 1 }];
        },
      }),
    })),
    delete: vi.fn(() => ({ where: async () => [{ affectedRows: 1 }] })),
  };
  client.transaction = vi.fn(async (callback: (tx: any) => Promise<unknown>) =>
    callback(client)
  );
  return { client, inserts, transactions };
});

vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => state.client) }));

import { createTransaction } from "./db";

describe("Transaction Idempotency Verification", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.transactions.clear();
    process.env.DATABASE_URL = "mysql://idempotency-test";
  });

  it("uses only DB-backed idempotency (no in-memory Map in source)", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).not.toContain("idempotencyStore");
    expect(source).not.toContain(
      "new Map<string, { id: number; timestamp: number }>"
    );
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

  it("keeps the user note unchanged and links the transaction to canonical postings", async () => {
    const txId = await createTransaction(42, {
      projectId: 88,
      categoryId: 7,
      type: "expense",
      amount: 450,
      paymentMethod: "Cash",
      note: "Groceries",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      idempotencyKey: "client-req-note-1",
    });
    const transactionInsert = state.inserts.find(
      item => item.values?.idempotencyKey === "client-req-note-1"
    );
    const voucherInsert = state.inserts.find(
      item => item.values?.voucherNo && item.values?.status === "posted"
    );
    const ledgerInserts = state.inserts.filter(
      item => item.values?.entryType && item.values?.chartOfAccountId
    );
    expect(txId).toBeDefined();
    expect(transactionInsert?.values.note).toBe("Groceries");
    expect(transactionInsert?.values.note).not.toContain("[idemp:");
    expect(voucherInsert?.values.status).toBe("posted");
    expect(ledgerInserts).toHaveLength(2);
  });

  it("rejects a reused key with a different canonical payload without writing again", async () => {
    const input = {
      projectId: 88,
      categoryId: 7,
      type: "expense" as const,
      amount: 450,
      paymentMethod: "Cash",
      occurredAt: new Date("2026-09-12T10:00:00.000Z"),
      idempotencyKey: "client-req-conflict-1",
    };
    await createTransaction(42, input);
    const countAfterFirst = state.inserts.length;
    await expect(
      createTransaction(42, { ...input, amount: 451 })
    ).rejects.toThrow(
      "Idempotency key was already used with a different transaction payload"
    );
    expect(state.inserts.length).toBe(countAfterFirst);
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

describe("Update/delete transaction idempotency (Forge F-05 + Prism P2 stable keys)", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");

  it("guards updateTransaction with the idempotent middleware", () => {
    const s = read("./routers.ts");
    const start = s.indexOf("updateTransaction: protectedWithPermission");
    const end = s.indexOf("\n    deleteTransaction:", start);
    const route = s.slice(start, end === -1 ? undefined : end);
    expect(route).toContain(".use(idempotent)");
  });

  it("guards deleteTransaction with the idempotent middleware", () => {
    const s = read("./routers.ts");
    const start = s.indexOf("deleteTransaction: protectedWithPermission");
    const end = s.indexOf("\n    addDue:", start);
    const route = s.slice(start, end === -1 ? undefined : end);
    expect(route).toContain(".use(idempotent)");
  });

  it("deleteTransaction accepts an optional idempotencyKey", () => {
    const s = read("./routers.ts");
    const start = s.indexOf("deleteTransaction: protectedWithPermission");
    const end = s.indexOf("\n    addDue:", start);
    const route = s.slice(start, end === -1 ? undefined : end);
    expect(route).toContain("idempotencyKey: z.string().trim().max(120).optional()");
  });

  it("does not persist idempotencyKey into the finance_transactions row on update", () => {
    // The unique index (userId, idempotencyKey) on finance_transactions
    // must never be mutated by an edit: writing the client's stable key
    // into the row would let two sequential edits of the same row carry
    // different idempotencyKeys and toast a false 409 on re-save. The
    // key lives only in the idempotency_keys table (middleware scope).
    const s = read("./db.ts");
    const start = s.indexOf("export async function updateTransaction(");
    const end = s.indexOf("\nexport async function deleteTransaction(", start);
    const fn = s.slice(start, end === -1 ? undefined : end);
    const updateIdx = fn.indexOf(".update(financeTransactions)");
    const setIdx = fn.indexOf(".set({", updateIdx);
    const setEnd = fn.indexOf("})", setIdx);
    const setPayload = fn.slice(setIdx, setEnd === -1 ? undefined : setEnd);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeGreaterThan(-1);
    expect(setPayload).not.toContain("idempotencyKey");
  });

  it("docs the stable-key contract on the client side", () => {
    const s = read("../client/src/lib/idempotency.ts");
    expect(s).toContain("transactionUpdateKey");
    expect(s).toContain("transactionDeleteKey");
  });

  it("wires the stable keys into Home.tsx update/delete mutations", () => {
    const s = read("../client/src/pages/Home.tsx");
    expect(s).toContain("transactionUpdateKey(");
    expect(s).toContain("transactionDeleteKey(");
  });
});
