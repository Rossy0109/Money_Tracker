import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/**
 * Hash a plain text password with a unique cryptographic salt using scrypt.
 * Format: `scrypt:<hex-salt>:<hex-key>`
 */
export function hashPassword(password: string): string {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain text password against a stored hash in constant time.
 */
export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!password || !storedHash) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = parts[1];
  const originalKeyHex = parts[2];
  const originalKey = Buffer.from(originalKeyHex, "hex");
  const derivedKey = scryptSync(password, salt, originalKey.length);

  return originalKey.length === derivedKey.length && timingSafeEqual(originalKey, derivedKey);
}

/**
 * A well-formed scrypt hash of a throwaway password used only to keep login
 * timing uniform when a user does not exist or has no password hash.
 *
 * The dummy verify exercises the exact same scrypt + timingSafeEqual path as a
 * real password check, so the response latency (and therefore the API) does not
 * reveal whether an email address is registered or whether the account is
 * OAuth-only. This mitigates account-enumeration and timing side channels.
 */
const DUMMY_PASSWORD_HASH = hashPassword("dummy-password-for-timing-mitigation-2026");

/**
 * Verify credentials in (near) constant time regardless of whether the account
 * exists or holds a password hash. When no hash is available, verification runs
 * against the dummy hash so callers cannot be distinguished by timing alone.
 */
export function verifyPasswordConstantTime(
  password: string,
  storedHash: string | null | undefined
): boolean {
  return verifyPassword(password, storedHash ?? DUMMY_PASSWORD_HASH);
}
