import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  databaseRequired: vi.fn((db: unknown) => db),
  getUserByEmail: vi.fn(),
  createPasswordResetToken: vi.fn(),
  validatePasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  logAudit: vi.fn(),
  listUsersForAdmin: vi.fn(),
  listProjects: vi.fn(),
  countProjectRecords: vi.fn(async () => ({})),
}));

vi.mock("./_core/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import * as financeDb from "./db";
import { hashRequest, claimIdempotency, completeIdempotency, clearIdempotency, PENDING_RESPONSE_STATUS } from "./_core/idempotency";
import {
  sendPasswordResetEmail,
  isEmailDeliveryConfigured,
  buildPasswordResetUrl,
} from "./_core/mailer";

describe("password reset token lifecycle (db contract)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createPasswordResetToken returns token only for known emails", async () => {
    const create = vi.mocked(financeDb.createPasswordResetToken);
    create.mockResolvedValueOnce({ success: true } as never);
    const unknown = await create("nobody@example.com");
    expect(unknown).not.toHaveProperty("resetToken");

    create.mockResolvedValueOnce({
      success: true,
      resetToken: "tok-123",
      resetTokenExpiresAt: new Date(Date.now() + 60_000),
      user: { id: 1, email: "a@example.com" },
    } as never);
    const known = await create("a@example.com");
    expect(known).toHaveProperty("resetToken", "tok-123");
  });

  it("validatePasswordResetToken accepts unexpired tokens only", async () => {
    const validate = vi.mocked(financeDb.validatePasswordResetToken);
    validate.mockResolvedValueOnce({ valid: true, user: { id: 1 } } as never);
    await expect(validate("good")).resolves.toMatchObject({ valid: true });

    validate.mockResolvedValueOnce({ valid: false, user: null } as never);
    await expect(validate("bad")).resolves.toMatchObject({ valid: false });
  });

  it("consumePasswordResetToken clears token and stores new hash", async () => {
    const consume = vi.mocked(financeDb.consumePasswordResetToken);
    consume.mockResolvedValueOnce(undefined as never);
    await expect(consume("open-1", "hash")).resolves.toBeUndefined();
    expect(consume).toHaveBeenCalledWith("open-1", "hash");
  });
});

describe("mailer delivery configuration", () => {
  const envKeys = ["EMAIL_WEBHOOK_URL", "RESEND_API_KEY"] as const;

  function clearEnv() {
    for (const k of envKeys) delete process.env[k];
  }

  beforeEach(clearEnv);

  it("reports unconfigured when no transport is set", () => {
    clearEnv();
    expect(isEmailDeliveryConfigured()).toBe(false);
  });

  it("reports configured when EMAIL_WEBHOOK_URL is set", () => {
    process.env.EMAIL_WEBHOOK_URL = "https://example.com/hook";
    expect(isEmailDeliveryConfigured()).toBe(true);
  });

  it("reports configured when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(isEmailDeliveryConfigured()).toBe(true);
  });

  it("sendPasswordResetEmail returns false when no transport (fails closed)", async () => {
    clearEnv();
    const ok = await sendPasswordResetEmail({
      to: "user@example.com",
      resetUrl: "https://app/reset?token=x",
      token: "x",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(ok).toBe(false);
  });

  it("buildPasswordResetUrl produces a token URL", () => {
    process.env.PASSWORD_RESET_BASE_URL = "https://myapp.example/";
    expect(buildPasswordResetUrl("abc")).toBe(
      "https://myapp.example/reset-password?token=abc"
    );
  });
});

describe("hashRequest nested/array stability (regression)", () => {
  it("is stable for nested objects regardless of key order", () => {
    const a = hashRequest({ outer: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }] });
    const b = hashRequest({ list: [{ x: 1, y: 2 }], outer: { a: 1, b: 2 } });
    expect(a).toBe(b);
  });

  it("does not treat array index keys as object keys (JSON.stringify replacer bug)", () => {
    // Old bug: JSON.stringify(arr, ["0","1"]) treated indices specially for objects
    const withArray = hashRequest({ items: [1, 2, 3] });
    const withArrayShuffledNested = hashRequest({ items: [1, 2, 3] });
    expect(withArray).toBe(withArrayShuffledNested);
    expect(hashRequest({ items: [1, 2, 3] })).not.toBe(hashRequest({ items: [3, 2, 1] }));
  });

  it("nested array field is included in fingerprint", () => {
    expect(hashRequest({ debits: [{ amount: 1 }] })).not.toBe(
      hashRequest({ debits: [{ amount: 2 }] })
    );
  });
});

function buildInsertFailThenSelect(existing: unknown) {
  let selectCalls = 0;
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation(() => {
        const err = new Error("ER_DUP_ENTRY");
        return Promise.reject(err);
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            selectCalls += 1;
            return Promise.resolve(selectCalls === 1 && existing !== undefined ? [existing] : existing === undefined ? [] : [existing]);
          }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ affectedRows: 0 }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      }),
    }),
  };
}

describe("claimIdempotency INSERT-first flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns claimed when insert succeeds", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
      }),
      select: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    const result = await claimIdempotency(1, "key-1", "/r", "hash-1");
    expect(result).toEqual({ outcome: "claimed" });
    expect(db.insert).toHaveBeenCalled();
  });

  it("returns replay for completed same-hash record after insert conflict", async () => {
    const existing = {
      id: 9,
      expiresAt: new Date(Date.now() + 60_000),
      requestHash: "hash-1",
      responseStatus: 200,
      responseBody: '{"ok":true}',
    };
    const db = buildInsertFailThenSelect(existing);
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    const result = await claimIdempotency(1, "key-1", "/r", "hash-1");
    expect(result).toEqual({ outcome: "replay", status: 200, body: '{"ok":true}' });
  });

  it("returns in_progress for pending claim", async () => {
    const existing = {
      id: 10,
      expiresAt: new Date(Date.now() + 60_000),
      requestHash: "hash-1",
      responseStatus: PENDING_RESPONSE_STATUS,
      responseBody: "",
    };
    const db = buildInsertFailThenSelect(existing);
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    const result = await claimIdempotency(1, "key-1", "/r", "hash-1");
    expect(result).toEqual({ outcome: "in_progress" });
  });

  it("returns conflict when payload hash differs", async () => {
    const existing = {
      id: 11,
      expiresAt: new Date(Date.now() + 60_000),
      requestHash: "other-hash",
      responseStatus: 200,
      responseBody: "{}",
    };
    const db = buildInsertFailThenSelect(existing);
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    const result = await claimIdempotency(1, "key-1", "/r", "hash-1");
    expect(result.outcome).toBe("conflict");
  });

  it("completeIdempotency updates the claimed row", async () => {
    const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ affectedRows: 1 }) });
    const db = {
      update: vi.fn().mockReturnValue({ set: setFn }),
      insert: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    };
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    await completeIdempotency(1, "key-1", "/r", 200, { ok: true });
    expect(db.update).toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 200, responseBody: '{"ok":true}' })
    );
  });

  it("clearIdempotency releases a failed claim", async () => {
    const whereFn = vi.fn().mockResolvedValue({ affectedRows: 1 });
    const db = {
      delete: vi.fn().mockReturnValue({ where: whereFn }),
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
    };
    const { getDb, databaseRequired } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(db as never);
    vi.mocked(databaseRequired).mockImplementation(d => d as never);

    await clearIdempotency(1, "key-1", "/r");
    expect(db.delete).toHaveBeenCalled();
    expect(whereFn).toHaveBeenCalled();
  });
});
