import { describe, expect, it } from "vitest";
import { timingSafeCompare, hasValidAdminPassword } from "./timingSafe";

describe("Constant-Time Timing-Safe Validation", () => {
  const secret = "SuperSecretAdminToken-2026";

  it("returns true for matching candidate and secret", async () => {
    expect(await timingSafeCompare(secret, secret)).toBe(true);
    expect(await hasValidAdminPassword(secret, secret)).toBe(true);
  });

  it("returns false for non-matching strings of same length", async () => {
    const wrong = "SuperSecretAdminToken-2027";
    expect(await timingSafeCompare(wrong, secret)).toBe(false);
    expect(await hasValidAdminPassword(wrong, secret)).toBe(false);
  });

  it("returns false for non-matching strings of different lengths without throwing or early returning", async () => {
    expect(await timingSafeCompare("short", secret)).toBe(false);
    expect(
      await timingSafeCompare("SuperSecretAdminToken-2026-very-long", secret)
    ).toBe(false);
    expect(await hasValidAdminPassword("abc", secret)).toBe(false);
  });

  it("safely rejects empty or missing secrets", async () => {
    expect(await timingSafeCompare("", secret)).toBe(false);
    expect(await timingSafeCompare(secret, "")).toBe(false);
    expect(await hasValidAdminPassword("", secret)).toBe(false);
    expect(await hasValidAdminPassword(secret, "")).toBe(false);
    expect(await hasValidAdminPassword(secret, undefined)).toBe(false);
  });
});
