/**
 * Decrypt a cloud backup and emit a restorable, self-verifying payload.
 *
 * The output is the plaintext export plus the envelope fields (iv, encrypted,
 * tag, checksum) that were not needed for decryption but are what let the
 * restore route prove the rows it is about to write are the rows the envelope
 * attests to. Uploading the output therefore fails closed if anything was
 * edited, while the backup's own `.enc.json` stays encrypted at rest.
 *
 * Usage:
 *   BACKUP_ENCRYPTION_KEY_FILE=~/.money-tracker-backup-key \
 *   node scripts/decrypt-cloud-backup.mjs <object.enc.json> [output.json]
 *
 * Keys may also come from BACKUP_ENCRYPTION_KEYS (comma-separated; the first
 * one is the active key) or BACKUP_ENCRYPTION_KEY. Every configured key is
 * tried, and an envelope that names its key (keyId) only accepts that key —
 * so a rotated-out key kept in the list still opens old backups. Key material
 * is never printed and never written to the output; only the 16-hex-char
 * fingerprint (keyId) is ever shown.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createDecipheriv, createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_KEY_FILE = path.join(homedir(), ".money-tracker-backup-key");

/** Mirrors shared/platform/crypto.ts: the secret is hashed to a 32-byte key. */
function deriveKeyHex(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function sha256Hex(data) {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Mirrors aesGcmDecrypt: AES-256-GCM over hex(iv) with the 16-byte hex tag
 * appended to the hex ciphertext. Uses node:crypto rather than importing the
 * TypeScript module so this runs on the Node 22 floor in package.json.
 */
function decrypt(keyHex, ivHex, encryptedHex, tagHex) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

function parseKeyList(raw) {
  return String(raw)
    .split(/[,\n]/)
    .map(secret => secret.trim())
    .filter(Boolean);
}

async function readSecrets() {
  const list = process.env.BACKUP_ENCRYPTION_KEYS?.trim();
  if (list) {
    const secrets = parseKeyList(list);
    if (secrets.length > 0) return secrets;
  }

  const inline = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (inline) return [inline];

  const keyFile =
    process.env.BACKUP_ENCRYPTION_KEY_FILE?.trim() || DEFAULT_KEY_FILE;
  const raw = (await readFile(keyFile, "utf8")).trim();
  if (!raw) {
    throw new Error(`Key file is empty: ${keyFile}`);
  }
  const secrets = parseKeyList(raw);
  if (secrets.length === 0) {
    throw new Error(`Key file has no usable keys: ${keyFile}`);
  }
  return secrets;
}

/** Same fingerprint the server stamps on an envelope (sha256, first 16 hex). */
function keyIdFor(secret) {
  return sha256Hex(secret).slice(0, 16);
}

function fail(message) {
  console.error(`[decrypt-backup] ${message}`);
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error(
    "Usage: node scripts/decrypt-cloud-backup.mjs <object.enc.json> [output.json]"
  );
  process.exit(2);
}

let secrets;
try {
  secrets = await readSecrets();
} catch (error) {
  fail(
    `could not read the backup key (${error.message}). Set BACKUP_ENCRYPTION_KEYS, BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEY_FILE.`
  );
}

let envelope;
try {
  envelope = JSON.parse(await readFile(inputPath, "utf8"));
} catch (error) {
  fail(`could not read ${inputPath}: ${error.message}`);
}

for (const field of ["iv", "encrypted", "tag", "checksum"]) {
  if (typeof envelope?.[field] !== "string" || !envelope[field]) {
    fail(`${inputPath} is not a cloud backup envelope (missing "${field}")`);
  }
}

// An envelope that names its key only accepts that key; otherwise every
// configured key is a candidate (the active one first).
let candidates = secrets;
if (typeof envelope.keyId === "string" && envelope.keyId) {
  const matched = secrets.filter(secret => keyIdFor(secret) === envelope.keyId);
  if (matched.length === 0) {
    fail(
      `key ${envelope.keyId} is not configured — add it to BACKUP_ENCRYPTION_KEYS (configured: ${secrets
        .map(keyIdFor)
        .join(", ")})`
    );
  }
  candidates = matched;
}

let plaintext = null;
let usedKeyId = null;
for (const secret of candidates) {
  try {
    plaintext = decrypt(
      deriveKeyHex(secret),
      envelope.iv,
      envelope.encrypted,
      envelope.tag
    );
    usedKeyId = keyIdFor(secret);
    break;
  } catch {
    // Wrong key for this candidate — keep trying the rest of the keyring.
  }
}
if (plaintext === null) {
  fail(
    `decryption failed with ${candidates.length} configured key(s) — none matches this backup, or the file is corrupt`
  );
}

const actualChecksum = await sha256Hex(plaintext);
if (actualChecksum !== envelope.checksum) {
  fail(
    `checksum mismatch — expected ${envelope.checksum}, got ${actualChecksum}`
  );
}

let parsed;
try {
  parsed = JSON.parse(plaintext);
} catch {
  fail("decrypted content is not valid JSON — this is not a project backup");
}

if (!parsed?.project?.name || !Array.isArray(parsed.accounts)) {
  fail("decrypted content does not look like a project backup");
}

const payload = {
  ...parsed,
  iv: envelope.iv,
  encrypted: envelope.encrypted,
  tag: envelope.tag,
  checksum: envelope.checksum,
  ...(typeof envelope.keyId === "string" && envelope.keyId
    ? { keyId: envelope.keyId }
    : {}),
};

const destination =
  outputPath ||
  inputPath.replace(/\.enc\.json$/, "") + ".restore.json";
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
await writeFile(destination, serialized, { mode: 0o600 });

console.log(
  [
    `[decrypt-backup] ok: ${envelope.projectName ?? parsed.project.name}`,
    `[decrypt-backup] checksum verified: ${actualChecksum}`,
    `[decrypt-backup] key id: ${usedKeyId}`,
    `[decrypt-backup] rows: accounts=${payload.accounts.length} transactions=${payload.transactions?.length ?? 0}`,
    `[decrypt-backup] wrote ${destination} (${serialized.length} bytes, mode 600)`,
    "[decrypt-backup] upload that file through the app's restore screen — it re-verifies the envelope on the server",
  ].join("\n")
);
