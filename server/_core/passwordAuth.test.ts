import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwordAuth";

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
