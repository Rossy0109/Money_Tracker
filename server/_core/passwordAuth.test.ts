import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyPasswordConstantTime } from "./passwordAuth";

describe("Password Authentication Hashing & Verification", () => {
  it("hashes password and verifies successfully with correct password", () => {
    const password = "mySecurePassword123";
    const hash = hashPassword(password);

    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword(password, hash)).toBe(true);
  });

  it("rejects incorrect password", () => {
    const hash = hashPassword("correctPassword");
    expect(verifyPassword("wrongPassword", hash)).toBe(false);
  });

  it("fails safely on malformed hash or empty input", () => {
    expect(verifyPassword("", "someHash")).toBe(false);
    expect(verifyPassword("pass", "")).toBe(false);
    expect(verifyPassword("pass", "malformed:hash")).toBe(false);
    expect(verifyPassword("pass", "other:salt:key")).toBe(false);
  });

  it("enforces minimum password length of 6", () => {
    expect(() => hashPassword("12345")).toThrow("Password must be at least 6 characters long");
  });
});

describe("Constant-Time Credential Verification", () => {
  it("accepts the correct password against a real stored hash", () => {
    const hash = hashPassword("correctPassword");
    expect(verifyPasswordConstantTime("correctPassword", hash)).toBe(true);
  });

  it("rejects a wrong password against a real stored hash", () => {
    const hash = hashPassword("correctPassword");
    expect(verifyPasswordConstantTime("wrongPassword", hash)).toBe(false);
  });

  it("rejects login when no stored hash exists (e.g. unknown or OAuth-only account)", () => {
    expect(verifyPasswordConstantTime("whatever123", undefined)).toBe(false);
    expect(verifyPasswordConstantTime("whatever123", null)).toBe(false);
  });
});
