import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activeBackupKeySecret,
  describeBackupKeys,
  getBackupKeySecrets,
} from "./backupKeys";
import { keyIdForSecret } from "./backupIntegrity";
import { ENV } from "./_core/env";

const ENV_KEYS = ["BACKUP_ENCRYPTION_KEYS", "BACKUP_ENCRYPTION_KEY"] as const;
const saved: Record<string, string | undefined> = {};
let savedFallbackKey = "";

beforeEach(() => {
  for (const name of ENV_KEYS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  // ENV is captured at import time; blank it so "unconfigured" is exact.
  savedFallbackKey = ENV.backupEncryptionKey;
  ENV.backupEncryptionKey = "";
});

afterEach(() => {
  for (const name of ENV_KEYS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  ENV.backupEncryptionKey = savedFallbackKey;
});

describe("getBackupKeySecrets", () => {
  it("reads the comma-separated list in order, active key first", () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "new-key,old-key";
    expect(getBackupKeySecrets()).toEqual(["new-key", "old-key"]);
  });

  it("trims whitespace and drops empty entries", () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "  new-key , ,,  ,old-key,";
    expect(getBackupKeySecrets()).toEqual(["new-key", "old-key"]);
  });

  it("falls back to the single BACKUP_ENCRYPTION_KEY", () => {
    process.env.BACKUP_ENCRYPTION_KEY = "only-this-key";
    expect(getBackupKeySecrets()).toEqual(["only-this-key"]);
  });

  it("prefers the list over the single key", () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "new-key,old-key";
    process.env.BACKUP_ENCRYPTION_KEY = "only-this-key";
    expect(getBackupKeySecrets()).toEqual(["new-key", "old-key"]);
  });

  it("ignores a list that is only whitespace", () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "   ,  ";
    process.env.BACKUP_ENCRYPTION_KEY = "only-this-key";
    expect(getBackupKeySecrets()).toEqual(["only-this-key"]);
  });
});

describe("activeBackupKeySecret", () => {
  it("is the first key, never the one being rotated out", () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "new-key,old-key";
    expect(activeBackupKeySecret()).toBe("new-key");
  });

  it("is undefined when nothing is configured", () => {
    expect(activeBackupKeySecret()).toBeUndefined();
  });
});

describe("describeBackupKeys", () => {
  it("stamps each key with its short SHA-256 fingerprint", async () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "new-key,old-key";
    await expect(describeBackupKeys()).resolves.toEqual([
      { id: await keyIdForSecret("new-key"), secret: "new-key", active: true },
      { id: await keyIdForSecret("old-key"), secret: "old-key", active: false },
    ]);
  });

  it("gives each key a different id", async () => {
    process.env.BACKUP_ENCRYPTION_KEYS = "new-key,old-key";
    const keys = await describeBackupKeys();
    expect(keys[0].id).not.toBe(keys[1].id);
    expect(keys[0].id).toHaveLength(16);
  });

  it("is empty when the keyring is unconfigured", async () => {
    await expect(describeBackupKeys()).resolves.toEqual([]);
  });
});
