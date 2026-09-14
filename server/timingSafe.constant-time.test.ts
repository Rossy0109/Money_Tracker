import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let realTimingSafeEqual: ((a: Buffer, b: Buffer) => boolean) | null = null;
  const spy = vi.fn((a: Buffer, b: Buffer) => {
    if (realTimingSafeEqual) return realTimingSafeEqual(a, b);
    return false;
  });
  return {
    spy,
    setReal(fn: (a: Buffer, b: Buffer) => boolean) {
      realTimingSafeEqual = fn;
    },
  };
});

vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  mocks.setReal(actual.timingSafeEqual);
  return {
    ...actual,
    timingSafeEqual: mocks.spy,
  };
});

import { timingSafeCompare, hasValidAdminPassword } from "./timingSafe";

describe("Constant-Time Timing-Safe Comparison Internals", () => {
  const secret = "SuperSecretAdminToken-2026";

  beforeEach(() => {
    mocks.spy.mockClear();
  });

  it("always hands timingSafeEqual two 32-byte digests regardless of input lengths", () => {
    expect(timingSafeCompare("short", secret)).toBe(false);
    expect(timingSafeCompare(secret, secret)).toBe(true);
    expect(timingSafeCompare(`${secret}-padded-extra-long`, secret)).toBe(
      false
    );

    const calls = mocks.spy.mock.calls;
    expect(calls.length).toBe(3);
    for (const [candidateBuf, expectedBuf] of calls) {
      expect(Buffer.isBuffer(candidateBuf)).toBe(true);
      expect(Buffer.isBuffer(expectedBuf)).toBe(true);
      expect(candidateBuf.length).toBe(32);
      expect(expectedBuf.length).toBe(32);
    }
  });

  it("does not leak whether prefixes match and never loops over the raw candidates", () => {
    const samePrefixWrong = "SuperSecretAdminToken-2027";
    const totallyDifferent = "zzzzzzzzzzzzzzzzzzzzzzzzzz-9999";

    expect(timingSafeCompare(samePrefixWrong, secret)).toBe(false);
    expect(timingSafeCompare(totallyDifferent, secret)).toBe(false);

    const calls = mocks.spy.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0].length).toBe(32);
    expect(calls[1][0].length).toBe(32);
  });

  it("exposes the same digest-length comparison through hasValidAdminPassword", () => {
    expect(hasValidAdminPassword("wrong-length-secret", secret)).toBe(false);
    expect(hasValidAdminPassword(secret, secret)).toBe(true);

    const calls = mocks.spy.mock.calls;
    expect(calls.length).toBe(2);
    for (const [candidateBuf, expectedBuf] of calls) {
      expect(candidateBuf.length).toBe(32);
      expect(expectedBuf.length).toBe(32);
    }
  });
});
