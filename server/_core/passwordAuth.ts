import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface PasswordStrengthResult {
  valid: boolean;
  errors: string[];
  score: number; // 0-4
}

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];
  let score = 0;

  if (!password) {
    return { valid: false, errors: ["Password is required"], score: 0 };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  } else {
    score += 1;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  } else {
    score += 1;
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  } else {
    score += 1;
  }

  if (!/[^a-zA-Z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character");
  } else {
    score += 1;
  }

  // Check for common patterns
  if (/(.)\1{2,}/.test(password)) {
    errors.push("Password should not contain repeated characters");
  }

  const commonPatterns = ["123456", "password", "qwerty", "abc123", "admin", "letmein"];
  if (commonPatterns.some(pattern => password.includes(pattern))) {
    errors.push("Password contains a commonly used pattern");
  }

  return {
    valid: errors.length === 0,
    errors,
    score: Math.min(score, 4),
  };
}

const KEY_LENGTH = 64;

/**
 * Hash a plain text password with a unique cryptographic salt using scrypt.
 * Format: `scrypt:<hex-salt>:<hex-key>`
 */
export async function hashPassword(password: string): Promise<string> {
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plain text password against a stored hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!password || !storedHash) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = parts[1];
  const originalKeyHex = parts[2];
  const originalKey = Buffer.from(originalKeyHex, "hex");
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, originalKey.length, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });

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
let DUMMY_PASSWORD_HASH: string | null = null;

async function getDummyPasswordHash(): Promise<string> {
  if (!DUMMY_PASSWORD_HASH) {
    // Use a password that meets the strength requirements for the dummy hash
    DUMMY_PASSWORD_HASH = await hashPassword("DummyP@ss2026!");
  }
  return DUMMY_PASSWORD_HASH;
}

/**
 * Verify credentials in (near) constant time regardless of whether the account
 * exists or holds a password hash. When no hash is available, verification runs
 * against the dummy hash so callers cannot be distinguished by timing alone.
 */
export async function verifyPasswordConstantTime(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  const dummyHash = await getDummyPasswordHash();
  return verifyPassword(password, storedHash ?? dummyHash);
}
