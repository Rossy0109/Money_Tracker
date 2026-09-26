import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const record = {
    id: 501,
    userId: 42,
    projectId: 88,
    categoryId: 7,
    accountId: 3,
    chartOfAccountId: 101,
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
  const coaRows = [
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
  const client = {
    select: vi.fn((fields: any) => {
      const tableName = (table: any) =>
        table?._?.name || table?.[Symbol.for("drizzle:Name")] || "";
      const rows = (table: any) => {
        if (tableName(table).toLowerCase().includes("periodlock")) return [];
        if (!tableName(table) && fields && Object.keys(fields).length)
          return [];
        switch (tableName(table)) {
          case "finance_account_types":
            return [{ id: 1, code: "ASSET" }];
          case "finance_chart_of_accounts":
            return coaRows;
          case "finance_accounts":
            return [{ ...record, type: "cash", chartOfAccountId: 101 }];
          case "finance_categories":
            return [{ ...record, type: "expense", chartOfAccountId: 104 }];
          case "finance_period_locks":
          case "financePeriodLocks":
            return [];
          case "finance_voucher_settings":
          case "financeVoucherSettings":
            return [record];
          case "finance_transactions":
            return [{ ...record, voucherId: 501 }];
          case "finance_vouchers":
            return [{ ...record, status: "posted" }];
          case "finance_voucher_debits":
            return [{ ...record, chartOfAccountId: 104, amount: "1500.00" }];
          case "finance_voucher_credits":
            return [{ ...record, chartOfAccountId: 101, amount: "1500.00" }];
          case "finance_voucher_reversals":
            return [];
          default:
            return [record];
        }
      };
      return {
        from: (table: any) => ({
          where: () => ({
            limit: () => ({
              then: (
                resolve: (value: any[]) => unknown,
                reject?: (reason?: unknown) => unknown
              ) => Promise.resolve(rows(table)).then(resolve, reject),
            }),
            orderBy: () => ({
              then: (
                resolve: (value: any[]) => unknown,
                reject?: (reason?: unknown) => unknown
              ) => Promise.resolve(rows(table)).then(resolve, reject),
            }),
          }),
        }),
      };
    }),
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

import { auditLogs } from "../drizzle/schema";
import {
  createTransaction,
  deleteTransaction,
  updateBill,
  updateVoucherSettings,
} from "./db";

describe("audit write integration", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    process.env.DATABASE_URL = "mysql://audit-test";
  });

  it("persists immutable audit records when finance data is created, updated, or deleted", async () => {
    await createTransaction(42, {
      projectId: 88,
      categoryId: 7,
      accountId: 3,
      type: "expense",
      amount: 1500,
      paymentMethod: "bKash",
      occurredAt: new Date("2026-08-19T12:00:00.000Z"),
    });
    await updateBill(42, 88, 12, {
      title: "Utility",
      amount: 500,
      dueAt: new Date("2026-08-31T12:00:00.000Z"),
      isPaid: false,
    });
    await deleteTransaction(42, 88, 501);

    const auditEntries = state.inserts
      .filter(entry => entry.table === auditLogs)
      .map(entry => entry.values);
    expect(auditEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: 42,
          projectId: 88,
          action: "create",
          entityType: "transaction",
          entityId: 501,
        }),
        expect.objectContaining({
          actorUserId: 42,
          projectId: 88,
          action: "update",
          entityType: "bill",
          entityId: 12,
        }),
        expect.objectContaining({
          actorUserId: 42,
          projectId: 88,
          action: "delete",
          entityType: "transaction",
          entityId: 501,
        }),
      ])
    );
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
