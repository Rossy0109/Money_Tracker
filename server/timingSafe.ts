import { sha256Hex, timingSafeEqualHex } from "../shared/platform/crypto";

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
export async function timingSafeCompare(
  candidate: string,
  expected: string
): Promise<boolean> {
  if (typeof candidate !== "string" || typeof expected !== "string") {
    return false;
  }
  if (expected.length === 0) {
    return false;
  }

  const candidateHash = await sha256Hex(candidate);
  const expectedHash = await sha256Hex(expected);

  return timingSafeEqualHex(candidateHash, expectedHash);
}

/**
 * Validates candidate admin access password or token in constant time.
 */
export async function hasValidAdminPassword(
  candidate: string,
  expectedPassword?: string
): Promise<boolean> {
  if (!candidate || !expectedPassword) return false;
  return timingSafeCompare(candidate, expectedPassword);
}
