import { describe, expect, it } from "vitest";
import {
  BackupIntegrityError,
  detectBackupEnvelope,
  keyIdForSecret,
  normalizeBackupForChecksum,
  verifyRestoreEnvelope,
  withoutEnvelopeKeys,
} from "./backupIntegrity";
import {
  aesGcmEncrypt,
  bytesToHex,
  hexToBytes,
  randomBytesHex,
  sha256Hex,
} from "../shared/platform/crypto";

const KEY = "test-backup-encryption-key";
const OTHER_KEY = "a-completely-different-key";

function sampleBackup() {
  return {
    formatVersion: "finance-project-backup-v1" as const,
    exportedAt: "2026-10-01T00:00:00.000Z",
    project: { id: 7, name: "পরিবার" },
    accounts: [
      { id: 1, name: "নগদ" },
      { id: 2, name: "ব্যাংক" },
    ],
    categories: [],
    transactions: [{ id: 5, accountId: 1, amount: 100 }],
    budgets: [],
    bills: [],
    dues: [],
    settlements: [],
    recurring: [],
  };
}

/** Build a real envelope exactly the way the scheduled backup does. */
async function sealBackup(
  plaintext: unknown,
  key = KEY
): Promise<Record<string, unknown>> {
  const rawJson = JSON.stringify(plaintext, null, 2);
  const checksum = await sha256Hex(rawJson);
  const keyHex = await sha256Hex(key);
  const iv = hexToBytes(randomBytesHex(12));
  const sealed = await aesGcmEncrypt(keyHex, iv, rawJson);
  return {
    ...(plaintext as Record<string, unknown>),
    iv: bytesToHex(iv),
    encrypted: sealed.encrypted,
    tag: sealed.tag,
    checksum,
  };
}

describe("detectBackupEnvelope", () => {
  it("reports no envelope for the app's own plaintext export", () => {
    expect(detectBackupEnvelope(sampleBackup()).present).toEqual([]);
  });

  it("lists every present field so partial envelopes stay visible", () => {
    expect(detectBackupEnvelope({ iv: "aa", checksum: "bb" }).present).toEqual([
      "iv",
      "checksum",
    ]);
  });

  it("ignores empty and non-string fields", () => {
    expect(
      detectBackupEnvelope({ iv: "", encrypted: 42, tag: null }).present
    ).toEqual([]);
  });
});

describe("verifyRestoreEnvelope", () => {
  it("accepts a plaintext export, reporting that nothing was verified", async () => {
    await expect(
      verifyRestoreEnvelope(sampleBackup(), KEY)
    ).resolves.toEqual({ verified: false, reason: "no_envelope" });
  });

  it("accepts a valid cloud envelope", async () => {
    await expect(
      verifyRestoreEnvelope(await sealBackup(sampleBackup()), KEY)
    ).resolves.toEqual({ verified: true });
  });

  it("tolerates a re-serialized export: exportedAt and row order do not matter", async () => {
    const sealed = await sealBackup(sampleBackup());
    // Same rows, reversed array order and a different exportedAt stamp.
    await expect(
      verifyRestoreEnvelope(
        {
          ...sealed,
          exportedAt: "2026-12-25T09:30:00.000Z",
          accounts: [...(sealed.accounts as unknown[])].reverse(),
        },
        KEY
      )
    ).resolves.toEqual({ verified: true });
  });

  it("rejects a partially stripped envelope instead of skipping the check", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    delete sealed.tag;
    await expect(verifyRestoreEnvelope(sealed, KEY)).rejects.toMatchObject({
      code: "partial_envelope",
    });
  });

  it("rejects an envelope when no key is configured", async () => {
    await expect(
      verifyRestoreEnvelope(await sealBackup(sampleBackup()), "")
    ).rejects.toMatchObject({ code: "missing_key" });
  });

  it("rejects the wrong key", async () => {
    await expect(
      verifyRestoreEnvelope(await sealBackup(sampleBackup()), OTHER_KEY)
    ).rejects.toMatchObject({ code: "decrypt_failed" });
  });

  it("rejects tampered ciphertext", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    const ciphertext = sealed.encrypted as string;
    // Deterministic tampering: swap the leading hex digit's value (0 <-> 1),
    // which always yields a different decoded byte. Flipping the case of a
    // letter (`a` -> `A`) decodes to the *same* byte and is not tampering.
    const flipped =
      (ciphertext[0] === "0" ? "1" : "0") + ciphertext.slice(1);
    await expect(
      verifyRestoreEnvelope({ ...sealed, encrypted: flipped }, KEY)
    ).rejects.toMatchObject({ code: "decrypt_failed" });
  });

  it("rejects a checksum that does not match the decrypted bytes", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    await expect(
      verifyRestoreEnvelope({ ...sealed, checksum: "0".repeat(64) }, KEY)
    ).rejects.toMatchObject({ code: "checksum_mismatch" });
  });

  it("rejects rows edited after decryption, even with a valid envelope", async () => {
    const sealed = await sealBackup(sampleBackup());
    // Inflate a transaction while leaving the untouched envelope in place.
    await expect(
      verifyRestoreEnvelope(
        {
          ...sealed,
          transactions: [{ id: 5, accountId: 1, amount: 999_999 }],
        },
        KEY
      )
    ).rejects.toMatchObject({ code: "payload_mismatch" });
  });

  it("rejects a renamed project", async () => {
    const sealed = await sealBackup(sampleBackup());
    await expect(
      verifyRestoreEnvelope(
        { ...sealed, project: { id: 7, name: "সম্পূর্ণ ভিন্ন" } },
        KEY
      )
    ).rejects.toMatchObject({ code: "payload_mismatch" });
  });

  it("rejects plaintext that is not valid JSON", async () => {
    const rawJson = "{not json";
    const keyHex = await sha256Hex(KEY);
    const iv = hexToBytes(randomBytesHex(12));
    const sealed = await aesGcmEncrypt(keyHex, iv, rawJson);
    await expect(
      verifyRestoreEnvelope(
        {
          iv: bytesToHex(iv),
          encrypted: sealed.encrypted,
          tag: sealed.tag,
          checksum: await sha256Hex(rawJson),
        },
        KEY
      )
    ).rejects.toMatchObject({ code: "malformed_plaintext" });
  });

  it("carries a user-facing Bengali message and a machine-readable code", async () => {
    const error = await verifyRestoreEnvelope(
      await sealBackup(sampleBackup()),
      OTHER_KEY
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupIntegrityError);
    expect((error as BackupIntegrityError).code).toBe("decrypt_failed");
    expect((error as BackupIntegrityError).message).toMatch(/ডিক্রিপ্ট/);
  });

  it("never returns a pass verdict when the envelope is incomplete", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    delete sealed.iv;
    delete sealed.encrypted;
    await expect(verifyRestoreEnvelope(sealed, KEY)).rejects.toBeInstanceOf(
      BackupIntegrityError
    );
  });
});

describe("verifyRestoreEnvelope with a keyring", () => {
  it("seals nothing extra: keyId is detected but never a required field", () => {
    expect(
      detectBackupEnvelope({
        iv: "aa",
        encrypted: "bb",
        tag: "cc",
        checksum: "dd",
        keyId: "abc",
      })
    ).toMatchObject({
      present: ["iv", "encrypted", "tag", "checksum"],
      keyId: "abc",
    });
    expect(
      detectBackupEnvelope({ iv: "aa", encrypted: "bb" }).keyId
    ).toBeUndefined();
  });

  it("accepts an envelope sealed with a non-active key from the ring", async () => {
    const sealed = await sealBackup(sampleBackup(), OTHER_KEY);
    sealed.keyId = await keyIdForSecret(OTHER_KEY);
    await expect(
      verifyRestoreEnvelope(sealed, [KEY, OTHER_KEY])
    ).resolves.toMatchObject({ verified: true });
  });

  it("accepts the active key for an envelope that names it", async () => {
    const sealed = await sealBackup(sampleBackup(), KEY);
    sealed.keyId = await keyIdForSecret(KEY);
    await expect(verifyRestoreEnvelope(sealed, [KEY, OTHER_KEY])).resolves.toMatchObject(
      { verified: true }
    );
  });

  it("fails with unknown_key when the named key was rotated out", async () => {
    const sealed = await sealBackup(sampleBackup(), OTHER_KEY);
    sealed.keyId = await keyIdForSecret(OTHER_KEY);
    await expect(verifyRestoreEnvelope(sealed, KEY)).rejects.toMatchObject({
      code: "unknown_key",
    });
  });

  it("tries the whole ring for envelopes written before key ids existed", async () => {
    const sealed = await sealBackup(sampleBackup(), OTHER_KEY);
    await expect(verifyRestoreEnvelope(sealed, [KEY, OTHER_KEY])).resolves.toMatchObject(
      { verified: true }
    );
  });

  it("still reports decrypt_failed when the named key is present but wrong", async () => {
    const sealed = await sealBackup(sampleBackup(), OTHER_KEY);
    sealed.keyId = await keyIdForSecret(OTHER_KEY);
    sealed.encrypted = (await aesGcmEncrypt(
      await sha256Hex(OTHER_KEY),
      hexToBytes(randomBytesHex(12)),
      JSON.stringify(sampleBackup(), null, 2)
    )).encrypted;
    await expect(verifyRestoreEnvelope(sealed, [KEY, OTHER_KEY])).rejects.toMatchObject(
      { code: "decrypt_failed" }
    );
  });

  it("reports missing_key when the keyring is empty", async () => {
    await expect(
      verifyRestoreEnvelope(await sealBackup(sampleBackup()), [])
    ).rejects.toMatchObject({ code: "missing_key" });
  });

  it("keeps keyId out of the checksum and payload comparison", async () => {
    const sealed = await sealBackup(sampleBackup(), KEY);
    sealed.keyId = await keyIdForSecret(KEY);
    await expect(verifyRestoreEnvelope(sealed, KEY)).resolves.toMatchObject({
      verified: true,
    });
    const stripped = withoutEnvelopeKeys(sealed) as Record<string, unknown>;
    expect(stripped.keyId).toBeUndefined();
  });
});

describe("normalizeBackupForChecksum", () => {
  it("is re-exported behavior: drops exportedAt and sorts id rows", () => {
    const normalized = normalizeBackupForChecksum({
      exportedAt: "now",
      accounts: [{ id: 2 }, { id: 1 }],
    }) as Record<string, unknown>;
    expect(normalized.exportedAt).toBeUndefined();
    expect(normalized.accounts).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
