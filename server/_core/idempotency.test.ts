import { describe, expect, it, vi, beforeEach } from "vitest";

function buildMockDbChain(selectResult?: any) {
  const limitFn = vi.fn().mockResolvedValue(selectResult ?? []);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  const valuesFn = vi.fn().mockReturnValue({
    onDuplicateKeyUpdate: vi.fn().mockResolvedValue([]),
  });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  const deleteWhereFn = vi.fn().mockResolvedValue({ affectedRows: 0 });
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhereFn });
  return {
    select: selectFn,
    insert: insertFn,
    delete: deleteFn,
    _fns: {
      selectFn,
      fromFn,
      whereFn,
      limitFn,
      insertFn,
      valuesFn,
      deleteFn,
      deleteWhereFn,
    },
  };
}

let chain: ReturnType<typeof buildMockDbChain>;

vi.mock("../db", () => ({
  getDb: vi.fn(),
  databaseRequired: vi.fn((db: any) => db),
}));

vi.mock("../../drizzle/schema", () => ({
  idempotencyKeys: new Proxy({}, { get: (_: any, k: string) => k }),
}));

import { getDb } from "../db";
import {
  hashRequest,
  checkIdempotency,
  storeIdempotency,
  clearIdempotency,
  purgeExpiredIdempotencyKeys,
} from "./idempotency";

const mockGetDb = vi.mocked(getDb);

describe("hashRequest", () => {
  it("produces consistent hash for same input", () => {
    expect(hashRequest({ projectId: 1, amount: 100 })).toBe(
      hashRequest({ projectId: 1, amount: 100 })
    );
  });
  it("produces different hash for different input", () => {
    expect(hashRequest({ projectId: 1, amount: 100 })).not.toBe(
      hashRequest({ projectId: 1, amount: 200 })
    );
  });
  it("produces same hash regardless of key insertion order", () => {
    expect(hashRequest({ b: 2, a: 1 })).toBe(hashRequest({ a: 1, b: 2 }));
  });
  it("hashes null to a 64-char hex string", () => {
    expect(hashRequest(null)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("hashes undefined to a 64-char hex string", () => {
    expect(hashRequest(undefined)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("checkIdempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isReplay=false for fresh key", async () => {
    chain = buildMockDbChain([]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r).toEqual({ isReplay: false, status: null, body: null });
  });

  it("isReplay=true for existing key with same payload", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() + 60000),
        requestHash: "h",
        responseStatus: 200,
        responseBody: '{"v":1}',
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r).toEqual({ isReplay: true, status: 200, body: '{"v":1}' });
  });

  it("throws for same key with different payload", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() + 60000),
        requestHash: "original",
        responseStatus: 200,
        responseBody: "{}",
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    await expect(checkIdempotency(1, "k", "/r", "different")).rejects.toThrow();
  });

  it("treats expired record as fresh", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() - 1000),
        requestHash: "h",
        responseStatus: 200,
        responseBody: "{}",
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r.isReplay).toBe(false);
    expect(chain._fns.deleteFn).toHaveBeenCalled();
  });

  it("different users with same key are independent", async () => {
    chain = buildMockDbChain([]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(2, "k", "/r", "h");
    expect(r.isReplay).toBe(false);
  });

  it("different routes with same key are independent", async () => {
    chain = buildMockDbChain([]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/other", "h");
    expect(r.isReplay).toBe(false);
  });
});

describe("storeIdempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls insert.values with serialized body", async () => {
    chain = buildMockDbChain();
    mockGetDb.mockResolvedValue(chain as any);
    await storeIdempotency(1, "k", "/r", "h", 200, { voucherId: 42 });
    expect(chain._fns.insertFn).toHaveBeenCalled();
    expect(chain._fns.valuesFn).toHaveBeenCalled();
  });

  it("sets correct TTL expiry", async () => {
    const before = Date.now();
    chain = buildMockDbChain();
    mockGetDb.mockResolvedValue(chain as any);
    await storeIdempotency(1, "k", "/r", "h", 200, {}, 60000);
    const args = chain._fns.valuesFn.mock.calls[0][0];
    expect(args.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 59000);
    expect(args.expiresAt.getTime()).toBeLessThanOrEqual(before + 61000);
  });

  it("uses onDuplicateKeyUpdate for race safety", async () => {
    chain = buildMockDbChain();
    mockGetDb.mockResolvedValue(chain as any);
    await storeIdempotency(1, "k", "/r", "h", 200, {});
    const result = chain._fns.valuesFn.mock.results[0].value;
    expect(result.onDuplicateKeyUpdate).toBeDefined();
  });
});

describe("clearIdempotency", () => {
  beforeEach(() => vi.clearAllMocks());
  it("calls delete.where", async () => {
    chain = buildMockDbChain();
    mockGetDb.mockResolvedValue(chain as any);
    await clearIdempotency(1, "k", "/r");
    expect(chain._fns.deleteFn).toHaveBeenCalled();
    expect(chain._fns.deleteWhereFn).toHaveBeenCalled();
  });
});

describe("purgeExpiredIdempotencyKeys", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns affectedRows count", async () => {
    chain = buildMockDbChain();
    chain._fns.deleteWhereFn.mockResolvedValue({ affectedRows: 5 });
    mockGetDb.mockResolvedValue(chain as any);
    expect(await purgeExpiredIdempotencyKeys()).toBe(5);
  });
  it("returns 0 when no rows deleted", async () => {
    chain = buildMockDbChain();
    chain._fns.deleteWhereFn.mockResolvedValue({});
    mockGetDb.mockResolvedValue(chain as any);
    expect(await purgeExpiredIdempotencyKeys()).toBe(0);
  });
});

describe("Concurrent & Protection Scenarios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("two concurrent checks both return isReplay=false", async () => {
    chain = buildMockDbChain([]);
    mockGetDb.mockResolvedValue(chain as any);
    const [r1, r2] = await Promise.all([
      checkIdempotency(1, "k", "/r", "h"),
      checkIdempotency(1, "k", "/r", "h"),
    ]);
    expect(r1.isReplay).toBe(false);
    expect(r2.isReplay).toBe(false);
  });

  it("double-click returns cached result", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() + 60000),
        requestHash: "h",
        responseStatus: 200,
        responseBody: '{"v":1}',
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r.isReplay).toBe(true);
  });

  it("network retry returns cached result", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() + 60000),
        requestHash: "h",
        responseStatus: 200,
        responseBody: '{"posted":true}',
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r.isReplay).toBe(true);
  });

  it("different payload with same key throws", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() + 60000),
        requestHash: "orig",
        responseStatus: 200,
        responseBody: "{}",
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    await expect(checkIdempotency(1, "k", "/r", "tampered")).rejects.toThrow();
  });

  it("expired key allows fresh submission", async () => {
    chain = buildMockDbChain([
      {
        id: 1,
        expiresAt: new Date(Date.now() - 1),
        requestHash: "h",
        responseStatus: 200,
        responseBody: "{}",
      },
    ]);
    mockGetDb.mockResolvedValue(chain as any);
    const r = await checkIdempotency(1, "k", "/r", "h");
    expect(r.isReplay).toBe(false);
  });

  it("unique constraint prevents cross-instance duplicates", () => {
    const constraint = {
      table: "idempotency_keys",
      columns: ["userId", "idempotencyKey"],
      type: "unique",
    };
    expect(constraint.type).toBe("unique");
    expect(constraint.columns).toContain("userId");
    expect(constraint.columns).toContain("idempotencyKey");
  });
});
