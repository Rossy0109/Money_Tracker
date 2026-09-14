import { describe, expect, it } from "vitest";
import { timingSafeCompare, hasValidAdminPassword } from "./timingSafe";

describe("Constant-Time Timing-Safe Validation", () => {
  const secret = "SuperSecretAdminToken-2026";

  it("returns true for matching candidate and secret", () => {
    expect(timingSafeCompare(secret, secret)).toBe(true);
    expect(hasValidAdminPassword(secret, secret)).toBe(true);
  });

  it("returns false for non-matching strings of same length", () => {
    const wrong = "SuperSecretAdminToken-2027";
    expect(timingSafeCompare(wrong, secret)).toBe(false);
    expect(hasValidAdminPassword(wrong, secret)).toBe(false);
  });

  it("returns false for non-matching strings of different lengths without throwing or early returning", () => {
    expect(timingSafeCompare("short", secret)).toBe(false);
    expect(timingSafeCompare("SuperSecretAdminToken-2026-very-long", secret)).toBe(false);
    expect(hasValidAdminPassword("abc", secret)).toBe(false);
  });

  it("safely rejects empty or missing secrets", () => {
    expect(timingSafeCompare("", secret)).toBe(false);
    expect(timingSafeCompare(secret, "")).toBe(false);
    expect(hasValidAdminPassword("", secret)).toBe(false);
    expect(hasValidAdminPassword(secret, "")).toBe(false);
    expect(hasValidAdminPassword(secret, undefined)).toBe(false);
  });
});
