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
  const makeWhere = (): WhereChain => {
    const where = ((..._args: unknown[]) => where) as WhereChain;
    where.limit = terminal(selectQueue, []);
    where.values = terminal(insertQueue, [{ insertId: 1 }]);
    // Awaiting .where() directly ends select-all (sweep listing) and
    // update/delete chains: prefer a queued select row when present,
    // otherwise resolve as an update acknowledgement.
    where.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => {
      const value = selectQueue.length
        ? selectQueue.shift()
        : updateQueue.length
          ? updateQueue.shift()
          : [{ affectedRows: 1 }];
      return (
        value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
      ).then(resolve, reject);
    };
    return where;
  };
  const chain = {
    select: (..._args: unknown[]) => ({
      from: (..._args: unknown[]) => ({ where: makeWhere }),
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
