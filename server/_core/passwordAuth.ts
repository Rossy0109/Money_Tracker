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
