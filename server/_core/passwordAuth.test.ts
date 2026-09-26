import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordConstantTime,
} from "./passwordAuth";

describe("Password Authentication Hashing & Verification", () => {
  it("hashes password and verifies successfully with correct password", async () => {
    const password = "SecureP@ss123";
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it("rejects incorrect password", async () => {
    const hash = await hashPassword("CorrectP@ss123");
    expect(await verifyPassword("WrongP@ss999", hash)).toBe(false);
  });

  it("fails safely on malformed hash or empty input", async () => {
    expect(await verifyPassword("", "someHash")).toBe(false);
    expect(await verifyPassword("pass", "")).toBe(false);
    expect(await verifyPassword("pass", "malformed:hash")).toBe(false);
    expect(await verifyPassword("pass", "other:salt:key")).toBe(false);
  });

  it("enforces minimum password length of 8", async () => {
    await expect(hashPassword("1234567")).rejects.toThrow(
      "Password must be at least 8 characters long"
    );
  });
});

describe("Constant-Time Credential Verification", () => {
  it("accepts the correct password against a real stored hash", async () => {
    const hash = await hashPassword("CorrectP@ss123");
    expect(await verifyPasswordConstantTime("CorrectP@ss123", hash)).toBe(true);
  });

  it("rejects a wrong password against a real stored hash", async () => {
    const hash = await hashPassword("CorrectP@ss123");
    expect(await verifyPasswordConstantTime("WrongP@ss999", hash)).toBe(false);
  });

  it("rejects login when no stored hash exists (e.g. unknown or OAuth-only account)", async () => {
    expect(await verifyPasswordConstantTime("RandomP@ss123", undefined)).toBe(
      false
    );
    expect(await verifyPasswordConstantTime("RandomP@ss123", null)).toBe(false);
  });
});
