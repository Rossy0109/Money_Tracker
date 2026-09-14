import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Performs a truly constant-time comparison between two strings regardless of
 * length differences by comparing SHA-256 digests in constant time.
 *
 * Direct length checks (e.g. `expected.length === received.length`) leak the
 * length of the secret through timing variations. By hashing both values first,
 * the compared buffers are always exactly 32 bytes long, preventing:
 * 1. Byte-by-byte comparison timing attacks.
 * 2. Token/password length discovery via early-return on length mismatch.
 */
export function timingSafeCompare(candidate: string, expected: string): boolean {
  if (typeof candidate !== "string" || typeof expected !== "string") {
    return false;
  }
  if (expected.length === 0) {
    return false;
  }

  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(candidateHash, expectedHash);
}

/**
 * Validates candidate admin access password or token in constant time.
 */
export function hasValidAdminPassword(candidate: string, expectedPassword?: string): boolean {
  if (!candidate || !expectedPassword) return false;
  return timingSafeCompare(candidate, expectedPassword);
}
