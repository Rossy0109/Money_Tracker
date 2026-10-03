import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLOW_QUERY_MS,
  getQueryTimingStats,
  instrumentPool,
  MAX_RECENT_SLOW_QUERIES,
  recordQuery,
  resetQueryTimingStats,
} from "./queryTiming";
import logger from "./logger";

beforeEach(() => {
  resetQueryTimingStats();
  delete process.env.SLOW_QUERY_MS;
});

afterEach(() => {
  delete process.env.SLOW_QUERY_MS;
  vi.restoreAllMocks();
});

describe("recordQuery", () => {
  it("counts every query but only keeps ones past the threshold", () => {
    recordQuery("select 1", 4);
    recordQuery("select 2", DEFAULT_SLOW_QUERY_MS);
    recordQuery("select 3", 900);

    const stats = getQueryTimingStats();
    expect(stats.totalQueries).toBe(3);
    expect(stats.slowQueries).toBe(2);
    expect(stats.slowQueryThresholdMs).toBe(DEFAULT_SLOW_QUERY_MS);
    expect(stats.recentSlowQueries.map(sample => sample.sql)).toEqual([
      "select 2",
      "select 3",
    ]);
    expect(stats.recentSlowQueries[1].durationMs).toBe(900);
  });

  it("normalises and truncates the captured SQL", () => {
    recordQuery({ sql: "select   *\n  from   finance_transactions" }, 500);
    recordQuery("x".repeat(1000), 500);

    const [first, second] = getQueryTimingStats().recentSlowQueries;
    expect(first.sql).toBe("select * from finance_transactions");
    expect(second.sql).toHaveLength(400);
  });

  it("caps the ring buffer so a long-lived process cannot grow forever", () => {
    for (let i = 0; i < MAX_RECENT_SLOW_QUERIES + 10; i += 1) {
      recordQuery(`select ${i}`, 1000);
    }
    const stats = getQueryTimingStats();
    expect(stats.recentSlowQueries).toHaveLength(MAX_RECENT_SLOW_QUERIES);
    expect(stats.recentSlowQueries[MAX_RECENT_SLOW_QUERIES - 1].sql).toBe(
      "select 29"
    );
    expect(stats.totalQueries).toBe(MAX_RECENT_SLOW_QUERIES + 10);
  });

  it("warns with the captured SQL once a query is slow", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    recordQuery("select * from finance_transactions where id = ?", 1200);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      sql: "select * from finance_transactions where id = ?",
      durationMs: 1200,
    });
    expect(warn.mock.calls[0][1]).toBe("Slow query");
  });

  it("honours the SLOW_QUERY_MS override", () => {
    process.env.SLOW_QUERY_MS = "50";
    recordQuery("select 1", 49);
    recordQuery("select 2", 51);
    const stats = getQueryTimingStats();
    expect(stats.slowQueryThresholdMs).toBe(50);
    expect(stats.slowQueries).toBe(1);
  });
});

describe("instrumentPool", () => {
  it("times promise-style pool queries", async () => {
    const pool = {
      query: vi.fn(async (input: unknown) => `rows:${String(input)}`),
      execute: vi.fn(async (_input: unknown) => []),
    };
    instrumentPool(pool);

    await expect(pool.query("select 1")).resolves.toBe("rows:select 1");
    await expect(pool.execute("select 2")).resolves.toEqual([]);

    expect(getQueryTimingStats().totalQueries).toBe(2);
  });

  it("still records a query that throws and rethrows the error", async () => {
    const pool = {
      query: vi.fn(async (_input: unknown) => {
        throw new Error("boom");
      }),
    };
    instrumentPool(pool);

    await expect(pool.query("select 1")).rejects.toThrow("boom");
    expect(getQueryTimingStats().totalQueries).toBe(1);
  });

  it("times queries on connections handed out for transactions", async () => {
    const connection = {
      query: vi.fn(async (_input: unknown) => "tx-rows"),
    };
    const connectionQuery = connection.query;
    const pool = {
      query: vi.fn(async (_input: unknown) => "pool-rows"),
      getConnection: vi.fn(async () => connection),
    };
    instrumentPool(pool);

    await pool.query("select 1");
    const acquired = await pool.getConnection();
    await acquired.query("select 2");

    expect(getQueryTimingStats().totalQueries).toBe(2);
    // The connection method is wrapped, not replaced with a pool-level one.
    expect(connectionQuery).toHaveBeenCalledTimes(1);
  });

  it("leaves callback-style calls untouched", async () => {
    const pool = {
      query: (_sql: unknown, cb: (err: Error | null) => void) => cb(null),
    };
    instrumentPool(pool);

    const result: Error | null = await new Promise(resolve => {
      pool.query("select 1", err => resolve(err));
    });
    expect(result).toBeNull();
    expect(getQueryTimingStats().totalQueries).toBe(0);
  });

  it("ignores anything that is not a pool object", () => {
    expect(() => instrumentPool(null)).not.toThrow();
    expect(() => instrumentPool("pool")).not.toThrow();
    expect(getQueryTimingStats().totalQueries).toBe(0);
  });
});
