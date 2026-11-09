/**
 * Platform crypto abstraction.
 *
 * Provides a uniform async API that works in both Node.js and Cloudflare Workers.
 * - Node.js: uses node:crypto (scrypt) and Web Crypto (everything else)
 * - Workers: uses Web Crypto API and @noble/hashes (scrypt)
 *
 * All functions are async to match the Web Crypto API. Node sync implementations
 * are wrapped in Promise.resolve() for a uniform interface.
 */

const isNode =
  typeof process !== "undefined" && !!process.versions?.node;

function encodeUtf8(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = bytes.buffer;
  if (
    buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === buffer.byteLength
  ) {
    // Whole-buffer views (TextEncoder output, hexToBytes results) are already
    // the exact bytes; slicing them doubled every backup payload (docs/05 F-2).
    return buffer;
  }
  return buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

const HEX_DIGITS = "0123456789abcdef";
const HEX_VALUES = new Uint8Array(128);
HEX_VALUES.fill(0xff);
for (let index = 0; index < 16; index += 1) {
  HEX_VALUES[HEX_DIGITS.charCodeAt(index)] = index;
  HEX_VALUES["0123456789ABCDEF".charCodeAt(index)] = index;
}

export function bytesToHex(bytes: Uint8Array): string {
  // Node's native encoder avoids one cons-string per byte: a 49 MB ciphertext
  // became ~1.5 GB of rope nodes with the naive `hex += …` loop and OOMed the
  // default heap during backup (docs/05 F-2).
  if (typeof Buffer !== "undefined") {
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    ).toString("hex");
  }
  const parts = new Array<string>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    parts[index] = HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 0x0f];
  }
  return parts.join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    // Slice-per-pair plus parseInt allocated a short string per byte; table
    // lookups keep decryption of a 49 MB envelope allocation-light.
    const high = HEX_VALUES[hex.charCodeAt(index * 2)];
    const low = HEX_VALUES[hex.charCodeAt(index * 2 + 1)];
    bytes[index] =
      ((high === undefined || high === 0xff ? 0 : high) << 4) |
      (low === undefined || low === 0xff ? 0 : low);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(b64url: string): Uint8Array {
  const base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64Url(data: string): string {
  return base64UrlEncode(encodeUtf8(data));
}

export function decodeBase64Url(b64url: string): string {
  return new TextDecoder().decode(base64UrlDecode(b64url));
}

export async function sha256Hex(
  data: string | Uint8Array
): Promise<string> {
  const bytes = typeof data === "string" ? encodeUtf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Base64Url(
  data: string | Uint8Array
): Promise<string> {
  const bytes = typeof data === "string" ? encodeUtf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return base64UrlEncode(new Uint8Array(digest));
}

export function randomBytesHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export function randomBytesBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

export function timingSafeEqual(
  a: string | Uint8Array,
  b: string | Uint8Array
): boolean {
  const aBytes = typeof a === "string" ? encodeUtf8(a) : a;
  const bBytes = typeof b === "string" ? encodeUtf8(b) : b;
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hmacSha256Hex(
  key: string,
  data: string
): Promise<string> {
  const keyBytes = encodeUtf8(key);
  const dataBytes = encodeUtf8(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(dataBytes)
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function aesGcmEncrypt(
  keyHex: string,
  iv: Uint8Array,
  data: string
): Promise<{ encrypted: string; tag: string }> {
  const keyBytes = hexToBytes(keyHex);
  const dataBytes = encodeUtf8(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const result = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(dataBytes)
  );
  const resultBytes = new Uint8Array(result);
  const tag = resultBytes.slice(resultBytes.length - 16);
  const encrypted = resultBytes.slice(0, resultBytes.length - 16);
  return { encrypted: bytesToHex(encrypted), tag: bytesToHex(tag) };
}

export async function aesGcmDecrypt(
  keyHex: string,
  iv: Uint8Array,
  encrypted: string,
  tag: string
): Promise<string> {
  const keyBytes = hexToBytes(keyHex);
  const encryptedBytes = hexToBytes(encrypted);
  const tagBytes = hexToBytes(tag);
  const combined = new Uint8Array(encryptedBytes.length + tagBytes.length);
  combined.set(encryptedBytes, 0);
  combined.set(tagBytes, encryptedBytes.length);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const result = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(combined)
  );
  return new TextDecoder().decode(result);
}

export async function scryptHash(
  password: string,
  salt: string,
  keyLen: number
): Promise<string> {
  if (isNode) {
    const { scrypt } = await import("node:crypto");
    return new Promise((resolve, reject) => {
      scrypt(password, salt, keyLen, (err, key) => {
        if (err) reject(err);
        else resolve(bytesToHex(new Uint8Array(key)));
      });
    });
  }
  const { scrypt } = await import("@noble/hashes/scrypt.js");
  const passwordBytes = encodeUtf8(password);
  const saltBytes = encodeUtf8(salt);
  const key = scrypt(passwordBytes, saltBytes, {
    N: 16384,
    r: 8,
    p: 1,
    dkLen: keyLen,
  });
  return bytesToHex(key);
}

export async function scryptVerify(
  password: string,
  salt: string,
  keyLen: number,
  expectedHex: string
): Promise<boolean> {
  const derivedHex = await scryptHash(password, salt, keyLen);
  return timingSafeEqualHex(derivedHex, expectedHex);
}

export function byteLength(str: string): number {
  return encodeUtf8(str).length;
}
