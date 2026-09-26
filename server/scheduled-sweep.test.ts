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

import { processBillReminderSweep, processRecurringSweep } from "./db";

type WhereChain = {
  (...args: unknown[]): WhereChain;
  limit: () => Promise<unknown>;
  values: () => Promise<unknown>;
  then: (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown
  ) => unknown;
};

/**
 * Minimal drizzle-chain stub. Terminal calls resolve from queues (an Error
 * instance in a queue is thrown instead), so each test scripts exact rows.
 */
function makeFakeDb(queues: {
  select?: unknown[];
  insert?: unknown[];
  update?: unknown[];
}) {
  const selectQueue = queues.select ?? [];
  const insertQueue = queues.insert ?? [];
  const updateQueue = queues.update ?? [];
  const terminal = (queue: unknown[], fallback: unknown) => async () => {
    const value = queue.length ? queue.shift() : fallback;
    if (value instanceof Error) throw value;
    return value;
  };
  const tableName = (table: any) =>
    table?._?.name || table?.[Symbol.for("drizzle:Name")] || "";
  const defaultRows = (table: any) => {
    if (tableName(table).toLowerCase().includes("periodlock")) return [];
    if (tableName(table).toLowerCase().includes("project"))
      return [{ id: 7, userId: 1 }];
    switch (tableName(table)) {
      case "finance_projects":
      case "financeProjects":
        return [{ id: 7, userId: 1 }];
      case "finance_account_types":
      case "financeAccountTypes":
        return [{ id: 1, code: "ASSET" }];
      case "finance_chart_of_accounts":
      case "financeChartOfAccounts":
        return [
          {
            id: 101,
            code: "1110",
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
      case "finance_accounts":
      case "financeAccounts":
        return [{ id: 3, type: "cash", chartOfAccountId: 101 }];
      case "finance_categories":
      case "financeCategories":
        return [{ id: 3, type: "expense", chartOfAccountId: 104 }];
      case "finance_voucher_settings":
      case "financeVoucherSettings":
        return [
          {
            id: 2,
            prefix: "V",
            startNumber: 1,
            endNumber: 999999,
            nextNumber: 1,
          },
        ];
      case "finance_period_locks":
      case "financePeriodLocks":
        return [];
      case "finance_transactions":
      case "financeTransactions":
        return [];
      default:
        return [];
    }
  };
  // insert().values() doubles as a terminal and as a chainable for
  // .onDuplicateKeyUpdate() (used by claimNextVoucher).
  const makeValues = () => {
    const done = terminal(insertQueue, [{ insertId: 1 }])();
    const chained: Record<string, unknown> = {
      onDuplicateKeyUpdate: (..._args: unknown[]) => done,
      then: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown
      ) => done.then(resolve, reject),
    };
    return chained;
  };
  const makeWhere = (table?: any): WhereChain => {
    const where = ((..._args: unknown[]) => where) as WhereChain;
    const fallback = table ? defaultRows(table) : [{ affectedRows: 1 }];
    where.limit = terminal(selectQueue, fallback);
    where.values = terminal(insertQueue, [{ insertId: 1 }]);
    where.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => {
      const value = selectQueue.length
        ? selectQueue.shift()
        : updateQueue.length
          ? updateQueue.shift()
          : fallback;
      return (
        value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
      ).then(resolve, reject);
    };
    return where;
  };
  const chain = {
    select: (..._args: unknown[]) => ({
      from: (table: any) => ({ where: makeWhere(table) }),
    }),
    insert: (..._args: unknown[]) => ({
      values: (..._args: unknown[]) => makeValues(),
    }),
    update: (..._args: unknown[]) => ({
      set: (..._args: unknown[]) => ({ where: makeWhere() }),
    }),
    delete: (..._args: unknown[]) => ({ where: makeWhere() }),
  };
  return {
    ...chain,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(chain),
  };
}

const dayMs = 86_400_000;

describe("processRecurringSweep", () => {
  beforeEach(() => {
    mocks.db = null;
  });

  it("reports zero work when no template is due", async () => {
    mocks.db = makeFakeDb({ select: [[], []] });
    await expect(processRecurringSweep(new Date())).resolves.toEqual({
      templates: 0,
      created: 0,
      failed: 0,
    });
  });

  it("generates runs for a due template", async () => {
    const now = new Date();
    const template = {
      id: 11,
      userId: 1,
      projectId: 7,
      accountId: null,
      categoryId: 3,
      type: "expense",
      amount: "100.00",
      paymentMethod: "cash",
      note: null,
      frequency: "monthly",
      scheduleDay: 5,
      nextRunAt: new Date(now.getTime() - 2 * dayMs),
      lastGeneratedAt: null,
    };
    const settings = {
      id: 2,
      prefix: "V",
      nextNumber: 1,
      endNumber: 999999,
    };
    mocks.db = makeFakeDb({
      select: [
        [template],
        [{ id: 7, userId: 1 }],
        [], // no existing run for the key
        [settings], // claimNextVoucher settings lookup
      ],
    });
    const result = await processRecurringSweep(now);
    expect(result).toMatchObject({ templates: 1, created: 1, failed: 0 });
  });

  it("counts a throwing template as failed and continues", async () => {
    const template = {
      id: 12,
      userId: 1,
      projectId: 7,
      accountId: null,
      categoryId: 3,
      type: "expense",
      amount: "50.00",
      paymentMethod: "cash",
      note: null,
      frequency: "monthly",
      scheduleDay: 5,
      nextRunAt: new Date(Date.now() - dayMs),
      lastGeneratedAt: null,
    };
    mocks.db = makeFakeDb({
      select: [[template], new Error("boom")],
    });
    await expect(processRecurringSweep(new Date())).resolves.toEqual({
      templates: 0,
      created: 0,
      failed: 1,
    });
  });
});

describe("processBillReminderSweep", () => {
  beforeEach(() => {
    mocks.db = null;
  });

  it("stamps bills whose reminder window opened", async () => {
    const now = new Date();
    mocks.db = makeFakeDb({
      select: [
        [
          {
            id: 21,
            dueAt: new Date(now.getTime() + dayMs),
            reminderDaysBefore: 3,
            isPaid: false,
            lastReminderAt: null,
          },
        ],
      ],
    });
    await expect(processBillReminderSweep(now)).resolves.toEqual({
      checked: 1,
      reminded: 1,
    });
  });

  it("skips bills outside the window and bills already stamped today", async () => {
    const now = new Date();
    mocks.db = makeFakeDb({
      select: [
        [
          {
            id: 22,
            dueAt: new Date(now.getTime() + 30 * dayMs),
            reminderDaysBefore: 3,
            isPaid: false,
            lastReminderAt: null,
          },
          {
            id: 23,
            dueAt: new Date(now.getTime() + dayMs),
            reminderDaysBefore: 3,
            isPaid: false,
            lastReminderAt: now,
          },
        ],
      ],
    });
    await expect(processBillReminderSweep(now)).resolves.toEqual({
      checked: 0,
      reminded: 0,
    });
  });
});
