import {
  aesGcmDecrypt,
  hexToBytes,
  sha256Hex,
} from "../shared/platform/crypto";

/**
 * Canonicalize an export so two exports of the same rows hash identically.
 *
 * `exportProjectBackup` stamps `exportedAt: new Date()` on every call and its
 * queries have no ORDER BY, so neither the timestamp nor the row order may feed
 * a checksum that compares export #1 against a later re-export — doing so made
 * every scheduled backup fail its integrity gate even though nothing changed.
 */
export function normalizeBackupForChecksum(backup: unknown): unknown {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    return backup;
  }
  const normalized: Record<string, unknown> = {
    ...(backup as Record<string, unknown>),
  };
  delete normalized.exportedAt;
  for (const [key, value] of Object.entries(normalized)) {
    if (
      !Array.isArray(value) ||
      !value.every(
        row => row !== null && typeof row === "object" && "id" in row
      )
    ) {
      continue;
    }
    normalized[key] = [...value].sort(
      (a, b) =>
        Number((a as { id: unknown }).id) - Number((b as { id: unknown }).id)
    );
  }
  return normalized;
}

/** The four fields that turn a plaintext export into an attestable envelope. */
export const BACKUP_ENVELOPE_KEYS = [
  "iv",
  "encrypted",
  "tag",
  "checksum",
] as const;

export type BackupEnvelopeKey = (typeof BACKUP_ENVELOPE_KEYS)[number];

export type BackupEnvelopeFields = Partial<
  Record<BackupEnvelopeKey, string>
>;

export type BackupIntegrityCode =
  | "partial_envelope"
  | "missing_key"
  | "decrypt_failed"
  | "checksum_mismatch"
  | "malformed_plaintext"
  | "payload_mismatch";

export class BackupIntegrityError extends Error {
  readonly code: BackupIntegrityCode;

  constructor(code: BackupIntegrityCode, message: string) {
    super(message);
    this.name = "BackupIntegrityError";
    this.code = code;
  }
}

export type RestoreEnvelopeCheck =
  | { verified: false; reason: "no_envelope" }
  | { verified: true };

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Canonical JSON so two representations of the same export compare equal.
 *
 * The restore input is parsed by zod before it arrives here, which coerces date
 * fields to `Date` (`backupDate = z.coerce.date()`) and trims strings. The
 * attested plaintext holds the original JSON text, so both sides are put through
 * the same normalization: `Date`s and ISO-8601 strings collapse to one ISO form
 * and strings are trimmed. Without this every sealed backup would look edited.
 */
function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === "string") {
    if (ISO_DATE_PATTERN.test(value.trim())) {
      const parsed = new Date(value.trim());
      if (!Number.isNaN(parsed.getTime())) {
        return JSON.stringify(parsed.toISOString());
      }
    }
    return JSON.stringify(value.trim());
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key.trim())}:${canonicalJson(entryValue)}`
    )
    .join(",")}}`;
}

/**
 * Report which envelope fields a payload carries.
 *
 * Returns every present field so a partially-stripped envelope can be reported
 * instead of silently treated as "no envelope".
 */
export function detectBackupEnvelope(
  payload: unknown
): BackupEnvelopeFields & { present: BackupEnvelopeKey[] } {
  const source = (payload ?? {}) as Record<string, unknown>;
  const found: BackupEnvelopeFields = {};
  const present: BackupEnvelopeKey[] = [];
  for (const key of BACKUP_ENVELOPE_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) {
      found[key] = value;
      present.push(key);
    }
  }
  return { ...found, present };
}

function withoutEnvelopeKeys(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const copy: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
  };
  for (const key of BACKUP_ENVELOPE_KEYS) {
    delete copy[key];
  }
  return copy;
}

/**
 * Verify a restore payload that carries a cloud backup envelope.
 *
 * Three checks, all fail-closed once any envelope field is present:
 *   1. the envelope is complete (no half-stripped envelopes),
 *   2. the ciphertext decrypts and hashes to `checksum` (AES-GCM auth tag plus
 *      SHA-256 over the exact bytes that were uploaded), and
 *   3. the plaintext being restored is the same content the envelope attests
 *      to — otherwise a valid envelope could ride along with edited rows.
 *
 * A payload with no envelope fields is the app's own plaintext export, which
 * carries nothing to verify, so it is reported rather than rejected.
 */
export async function verifyRestoreEnvelope(
  payload: unknown,
  secretKey: string | undefined
): Promise<RestoreEnvelopeCheck> {
  const { present, iv, encrypted, tag, checksum } =
    detectBackupEnvelope(payload);

  if (present.length === 0) {
    return { verified: false, reason: "no_envelope" };
  }
  if (present.length !== BACKUP_ENVELOPE_KEYS.length) {
    throw new BackupIntegrityError(
      "partial_envelope",
      "ব্যাকআপ ফাইলটি অসম্পূর্ণ — এনভেলোপের কিছু অংশ অনুপস্থিত। পুরো ফাইলটি আবার ডাউনলোড করুন।"
    );
  }
  if (!secretKey) {
    throw new BackupIntegrityError(
      "missing_key",
      "ব্যাকআপ এনক্রিপশন কী কনফিগার করা হয়নি — যাচাই করা যায়নি।"
    );
  }

  let plaintext: string;
  try {
    plaintext = await aesGcmDecrypt(
      await sha256Hex(secretKey),
      hexToBytes(iv as string),
      encrypted as string,
      tag as string
    );
  } catch {
    throw new BackupIntegrityError(
      "decrypt_failed",
      "ব্যাকআপ ডিক্রিপ্ট করা যায়নি — কী সঠিক নয় বা ফাইলটি ক্ষতিগ্রস্ত।"
    );
  }

  if ((await sha256Hex(plaintext)) !== checksum) {
    throw new BackupIntegrityError(
      "checksum_mismatch",
      "ব্যাকআপ চেকসাম মিলছে না — ডেটা বিকৃত হতে পারে।"
    );
  }

  let attested: unknown;
  try {
    attested = JSON.parse(plaintext);
  } catch {
    throw new BackupIntegrityError(
      "malformed_plaintext",
      "ব্যাকআপের ভেতরের ডেটা পড়া যায়নি — ফাইলটি সঠিক নয়।"
    );
  }

  const expected = canonicalJson(normalizeBackupForChecksum(attested));
  const actual = canonicalJson(
    normalizeBackupForChecksum(withoutEnvelopeKeys(payload))
  );
  if (expected !== actual) {
    throw new BackupIntegrityError(
      "payload_mismatch",
      "রিস্টোর করা ডেটা মূল ব্যাকআপের সাথে মেলেনি — ফাইলটি পরিবর্তিত করা হয়েছে।"
    );
  }

  return { verified: true };
}
