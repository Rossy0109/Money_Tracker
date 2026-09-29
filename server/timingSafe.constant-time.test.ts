import { describe, expect, it } from "vitest";
import { timingSafeCompare, hasValidAdminPassword } from "./timingSafe";

describe("Constant-Time Timing-Safe Comparison Internals", () => {
  const secret = "SuperSecretAdminToken-2026";

  it("returns false for different strings regardless of length", async () => {
    expect(await timingSafeCompare("short", secret)).toBe(false);
    expect(await timingSafeCompare(secret, secret)).toBe(true);
    expect(await timingSafeCompare(`${secret}-padded-extra-long`, secret)).toBe(
      false
    );
  });

  it("does not leak whether prefixes match", async () => {
    const samePrefixWrong = "SuperSecretAdminToken-2027";
    const totallyDifferent = "zzzzzzzzzzzzzzzzzzzzzzzzzz-9999";

    expect(await timingSafeCompare(samePrefixWrong, secret)).toBe(false);
    expect(await timingSafeCompare(totallyDifferent, secret)).toBe(false);
  });

  it("exposes the same digest-length comparison through hasValidAdminPassword", async () => {
    expect(await hasValidAdminPassword("wrong-length-secret", secret)).toBe(false);
    expect(await hasValidAdminPassword(secret, secret)).toBe(true);
  });
});
