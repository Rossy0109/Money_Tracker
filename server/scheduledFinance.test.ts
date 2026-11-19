import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockDatabaseRequired = vi.hoisted(() => vi.fn((db: unknown) => db));
const mockPurgeExpiredIdempotencyKeys = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  getDb: mockGetDb,
  databaseRequired: mockDatabaseRequired,
  processRecurringSweep: vi.fn(),
  processBillReminderSweep: vi.fn(),
  cleanupOldFailedLoginAttempts: vi.fn(),
}));

vi.mock("./_core/idempotency", () => ({
  purgeExpiredIdempotencyKeys: mockPurgeExpiredIdempotencyKeys,
}));

vi.mock("./_core/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  processRecurringSweep,
  processBillReminderSweep,
  cleanupOldFailedLoginAttempts,
} from "./db";
import { executeDailySweep, runDailySweep } from "./scheduledFinance";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.mocked(processRecurringSweep).mockResolvedValue({
    templates: 2,
    created: 1,
    failed: 0,
  });
  vi.mocked(processBillReminderSweep).mockResolvedValue({
    checked: 5,
    reminded: 1,
  });
  vi.mocked(cleanupOldFailedLoginAttempts).mockResolvedValue(undefined);
  mockPurgeExpiredIdempotencyKeys.mockResolvedValue(7);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("executeDailySweep", () => {
  it("runs recurring and bill sweeps and purges expired idempotency keys", async () => {
    const result = await executeDailySweep();

    expect(processRecurringSweep).toHaveBeenCalledTimes(1);
    expect(processBillReminderSweep).toHaveBeenCalledTimes(1);
    expect(cleanupOldFailedLoginAttempts).toHaveBeenCalledTimes(1);
    expect(mockPurgeExpiredIdempotencyKeys).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      recurring: { templates: 2, created: 1, failed: 0 },
      billReminders: { checked: 5, reminded: 1 },
      idempotencyPurge: { purged: 7 },
    });
  });

  it("keeps the sweep running when the idempotency purge fails", async () => {
    mockPurgeExpiredIdempotencyKeys.mockRejectedValue(new Error("db down"));

    const result = await executeDailySweep();

    expect(result.idempotencyPurge).toEqual({ purged: 0 });
    expect(result.recurring).toEqual({ templates: 2, created: 1, failed: 0 });
  });

  it("contains recurring sweep failures without rejecting", async () => {
    vi.mocked(processRecurringSweep).mockRejectedValue(new Error("boom"));

    const result = await executeDailySweep();

    expect(result.recurring.failed).toBe(-1);
    expect(result.idempotencyPurge).toEqual({ purged: 7 });
  });

  it("contains bill reminder sweep failures and returns billReminders.error", async () => {
    vi.mocked(processBillReminderSweep).mockRejectedValue(new Error("bills boom"));

    const result = await executeDailySweep();

    expect(result.billReminders).toEqual({
      checked: 0,
      reminded: 0,
      error: "bills boom",
    });
  });
});

describe("runDailySweep", () => {
  function makeReq() {
    return { headers: { authorization: "Bearer test-secret" } } as any;
  }

  function makeRes() {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
  }

  it("responds 200 when recurring and bill reminder sweeps are healthy", async () => {
    const res = makeRes();

    await runDailySweep(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].ok).toBe(true);
  });

  it("responds 500 when the bill reminder sweep rejects", async () => {
    vi.mocked(processBillReminderSweep).mockRejectedValue(new Error("bills boom"));
    const res = makeRes();

    await runDailySweep(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.ok).toBe(false);
    expect(body.billReminders.error).toBeTruthy();
  });

  it("responds 500 when the recurring sweep reports failed templates", async () => {
    vi.mocked(processRecurringSweep).mockResolvedValue({
      templates: 2,
      created: 0,
      failed: 1,
    });
    const res = makeRes();

    await runDailySweep(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.ok).toBe(false);
  });
});
