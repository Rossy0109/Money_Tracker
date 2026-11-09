import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "../shared/platform/crypto";

/**
 * docs/05 F-2: backup encryption hex-encodes the whole plaintext (49 MB at
 * 210k rows). The previous `hex += byte.toString(16)` loop built a cons-string
 * rope with one node per byte and OOMed Node's default heap, so these tests
 * pin the codec to the native/flat implementations.
 */
describe("hex codec (backup envelope)", () => {
  it("round-trips arbitrary bytes", () => {
    for (const size of [0, 1, 15, 16, 17, 255, 256, 4096]) {
      const bytes = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        bytes[index] = (index * 31 + 7) % 256;
      }
      expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    }
  });

  it("matches Node's native hex encoding, including large payloads", () => {
    const bytes = new Uint8Array(2 * 1024 * 1024);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 256;
    }
    const hex = bytesToHex(bytes);
    expect(hex.length).toBe(bytes.length * 2);
    expect(hex).toBe(Buffer.from(bytes).toString("hex"));
    const decoded = hexToBytes(hex);
    expect(decoded.length).toBe(bytes.length);
    // Compare in a single pass; Vitest's deep equality on 2M typed-array
    // elements takes minutes.
    expect(decoded.every((byte, index) => byte === bytes[index])).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(bytesToHex(hexToBytes("DEADBEEF"))).toBe("deadbeef");
  });

  it("keeps the legacy invalid-nibble behavior (zero) instead of throwing", () => {
    // A malformed envelope previously decoded to zero bytes and then failed
    // authenticated decryption; keep that fail-closed shape.
    expect(Array.from(hexToBytes("zz"))).toEqual([0]);
    expect(Array.from(hexToBytes("0g"))).toEqual([0]);
  });
});
