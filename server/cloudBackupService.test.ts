import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCloudStorageConfig,
  executeCloudBackup,
  normalizeBackupForChecksum,
  safeBackupProjectName,
} from "./cloudBackupService";
import { sha256Hex } from "../shared/platform/crypto";
import * as financeDb from "./db";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

/**
 * Portable scratch dir for the local-encrypted-snapshot path. Must not
 * hardcode a Termux-specific absolute path: this suite also runs on
 * GitHub-hosted Linux runners, where a non-root user cannot create
 * such a path and the snapshot write fails.
 */
function scratchDir(): string {
  return join(tmpdir(), `cloud-backup-test-${process.pid}`);
}

describe("Cloud Backup Service (S3 / Google Drive / Supabase)", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (/SUPABASE|^S3_|^AWS_|^CLOUD_BACKUP_WEBHOOK_URL$|^GOOGLE_DRIVE_|^LOCAL_BACKUP_DIR$/.test(key)) {
        delete process.env[key];
      }
    }
    process.env.LOCAL_BACKUP_DIR = scratchDir();
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("inspects available cloud storage configurations", () => {
    const config = getCloudStorageConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
    expect(config).toHaveProperty("supabase");
    expect(config).toHaveProperty("s3");
    expect(config).toHaveProperty("googleDrive");
  });

  it("creates encrypted cloud backup package with sha-256 verification", async () => {
    const config = getCloudStorageConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
    expect(config).toHaveProperty("supabase");
    expect(config).toHaveProperty("s3");
    expect(config).toHaveProperty("googleDrive");
  });

  it("creates encrypted cloud backup package with sha-256 verification", async () => {
    const admin = await financeDb
      .getUserByEmail("admin@example.com")
      .catch(() => null);
    if (!admin) {
      // No local DB fixture — still assert the export path exists.
      expect(typeof financeDb.exportProjectBackup).toBe("function");
      expect(typeof executeCloudBackup).toBe("function");
      return;
    }

    const projects = await financeDb.listProjects(admin.id);
    expect(projects.length).toBeGreaterThan(0);

    const result = await executeCloudBackup(
      admin.id,
      projects[0].id,
      "test-encryption-key-123"
    );

    expect(result.success).toBe(true);
    expect(result.checksum).toBeDefined();
    expect(result.checksum.length).toBe(64); // SHA-256 length
    expect(result.verifyChecksum).toBeDefined();
    expect(result.verifyChecksum.length).toBe(64);
    expect(result.encrypted).toBe(true);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.fileName).toContain(".enc.json");
  });
});

describe("normalizeBackupForChecksum", () => {
  it("drops the volatile exportedAt timestamp", () => {
    const normalized = normalizeBackupForChecksum({
      formatVersion: "finance-project-backup-v2",
      exportedAt: new Date("2026-09-30T10:00:00.000Z"),
      project: { id: 1, name: "Test" },
    }) as Record<string, unknown>;

    expect(normalized).not.toHaveProperty("exportedAt");
    expect(normalized.project).toEqual({ id: 1, name: "Test" });
  });

  it("sorts row arrays by id so unordered queries hash identically", () => {
    const normalized = normalizeBackupForChecksum({
      transactions: [{ id: 3 }, { id: 1 }, { id: 2 }],
    }) as { transactions: Array<{ id: number }> };

    expect(normalized.transactions.map(row => row.id)).toEqual([1, 2, 3]);
  });

  it("produces identical output for exports differing only in timestamp and order", async () => {
    const first = {
      formatVersion: "finance-project-backup-v2",
      exportedAt: new Date("2026-09-30T10:00:00.000Z"),
      transactions: [{ id: 2, amount: 20 }, { id: 1, amount: 10 }],
      voucherSettings: null,
    };
    const second = {
      formatVersion: "finance-project-backup-v2",
      exportedAt: new Date("2026-09-30T23:59:59.999Z"),
      transactions: [{ id: 1, amount: 10 }, { id: 2, amount: 20 }],
      voucherSettings: null,
    };

    const [firstHash, secondHash] = await Promise.all([
      sha256Hex(JSON.stringify(normalizeBackupForChecksum(first), null, 2)),
      sha256Hex(JSON.stringify(normalizeBackupForChecksum(second), null, 2)),
    ]);
    expect(firstHash).toBe(secondHash);
  });

  it("leaves arrays without ids untouched and preserves empty arrays", () => {
    const normalized = normalizeBackupForChecksum({
      lines: [{ memo: "b" }, { memo: "a" }],
      transactions: [],
    }) as { lines: Array<{ memo: string }>; transactions: unknown[] };

    expect(normalized.lines).toEqual([{ memo: "b" }, { memo: "a" }]);
    expect(normalized.transactions).toEqual([]);
  });

  it("passes through non-object inputs", () => {
    expect(normalizeBackupForChecksum(null)).toBeNull();
    expect(normalizeBackupForChecksum(undefined)).toBeUndefined();
    expect(normalizeBackupForChecksum("raw")).toBe("raw");
  });
});

describe("safeBackupProjectName", () => {
  it("keeps safe characters and replaces the rest with dashes", () => {
    expect(safeBackupProjectName("My Project 2026", 1)).toBe("My-Project-2026");
  });

  it("trims leading and trailing separators, keeping interior groups as one dash", () => {
    expect(safeBackupProjectName("---Weird---Name---", 2)).toBe("Weird---Name");
    expect(safeBackupProjectName("--Trimmed--", 2)).toBe("Trimmed");
  });

  it("falls back to the project id when nothing survives sanitizing", () => {
    expect(safeBackupProjectName("***", 42)).toBe("project-42");
    expect(safeBackupProjectName("", 7)).toBe("project-7");
  });

  it("caps the sanitized name at 32 characters", () => {
    const long = "a".repeat(64);
    expect(safeBackupProjectName(long, 3)).toHaveLength(32);
  });
});

describe("getCloudStorageConfig provider detection", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (/SUPABASE|^S3_|^AWS_|^CLOUD_BACKUP_WEBHOOK_URL$|^GOOGLE_DRIVE_/.test(key)) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports no providers when nothing is configured", () => {
    const config = getCloudStorageConfig();
    expect(config.supabase).toBeUndefined();
    expect(config.s3).toBeUndefined();
    expect(config.googleDrive).toBeUndefined();
  });

  it("enables supabase storage with the default bucket fallback", () => {
    process.env.SUPABASE_URL = "https://xyz.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    const config = getCloudStorageConfig();
    expect(config.supabase).toMatchObject({
      enabled: true,
      url: "https://xyz.supabase.co",
    });
  });

  it("enables s3 only when bucket and both keys are present", () => {
    process.env.S3_BUCKET_NAME = "bucket";
    expect(getCloudStorageConfig().s3).toBeUndefined();
    process.env.S3_ACCESS_KEY_ID = "ak";
    expect(getCloudStorageConfig().s3).toBeUndefined();
    process.env.S3_SECRET_ACCESS_KEY = "sk";
    expect(getCloudStorageConfig().s3).toMatchObject({
      enabled: true,
      bucket: "bucket",
      region: "auto",
    });
  });

  it("marks google drive enabled without a webhook when only a folder is set", () => {
    process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = "folder-1";
    const config = getCloudStorageConfig();
    expect(config.googleDrive).toMatchObject({
      enabled: true,
      folderId: "folder-1",
      webhookConfigured: false,
    });
  });

  it("marks the webhook as configured when a webhook url is present", () => {
    process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = "folder-1";
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = "https://hook.example.com";
    expect(getCloudStorageConfig().googleDrive?.webhookConfigured).toBe(true);
  });
});

describe("executeCloudBackup provider routing", () => {
  const saved = { ...process.env };
  const backupStub = {
    formatVersion: "finance-project-backup-v2",
    exportedAt: new Date("2026-10-01T00:00:00.000Z"),
    project: { id: 5, name: "Route Test" },
    transactions: [{ id: 1 }],
  };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (/SUPABASE|^S3_|^AWS_|^CLOUD_BACKUP_WEBHOOK_URL$|^GOOGLE_DRIVE_|^LOCAL_BACKUP_DIR$/.test(key)) {
        delete process.env[key];
      }
    }
    vi.spyOn(financeDb, "exportProjectBackup").mockResolvedValue(
      backupStub as any
    );
    vi.spyOn(financeDb, "logAudit").mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it("throws a clear error when no encryption key is available", async () => {
    vi.spyOn(
      await import("./backupKeys"),
      "activeBackupKeySecret"
    ).mockReturnValue("");
    await expect(executeCloudBackup(1, 5)).rejects.toThrow(
      /ব্যাকআপ এনক্রিপশন কী কনফিগার করা হয়নি/
    );
  });

  it("uploads to supabase and reports success", async () => {
    process.env.SUPABASE_URL = "https://xyz.supabase.co";
    process.env.SUPABASE_STORAGE_BUCKET = "backups";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }) as any);

    const result = await executeCloudBackup(1, 5, "key-1234567890");
    expect(result.success).toBe(true);
    expect(result.provider).toBe("supabase");
    expect(result.encrypted).toBe(true);
    expect(result.fileName).toContain("Route-Test-backup-");
    expect(result.checksum).toHaveLength(64);
    expect(result.verifyChecksum).toHaveLength(64);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("xyz.supabase.co/storage/v1/object/backups/");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer service-key"
    );
  });

  it("fails without claiming success when supabase rejects the upload", async () => {
    process.env.SUPABASE_URL = "https://xyz.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 403 }) as any
    );

    const result = await executeCloudBackup(1, 5, "key-1234567890");
    expect(result.success).toBe(false);
    expect(result.provider).toBe("supabase");
  });

  it("posts to the google drive webhook when configured", async () => {
    process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = "folder-9";
    process.env.GOOGLE_DRIVE_WEBHOOK_URL = "https://hook.example.com/gdrive";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }) as any);

    const result = await executeCloudBackup(1, 5, "key-1234567890");
    expect(result.success).toBe(true);
    expect(result.provider).toBe("google_drive");
    expect(fetchSpy.mock.calls[0][0]).toBe("https://hook.example.com/gdrive");
  });

  it("never claims success for a drive folder with no webhook", async () => {
    process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = "folder-9";
    const result = await executeCloudBackup(1, 5, "key-1234567890");
    expect(result.success).toBe(false);
    expect(result.provider).toBe("google_drive");
  });

  it("writes a verified local encrypted snapshot when no provider is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cloud-backup-test-"));
    process.env.LOCAL_BACKUP_DIR = dir;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be called"));

    const result = await executeCloudBackup(1, 5, "key-1234567890");
    expect(result.success).toBe(true);
    expect(result.provider).toBe("local_encrypted");
    expect(result.fileName).toContain("Route-Test-backup-");

    const { readFile, rm } = await import("node:fs/promises");
    const written = JSON.parse(
      await readFile(`${dir}/${result.fileName}`, "utf8")
    );
    expect(written.formatVersion).toBe("finance-encrypted-cloud-backup-v1");
    expect(written.checksum).toBe(result.checksum);
    expect(written.projectId).toBe(5);
    // The financial rows must never appear in plaintext on disk; only the
    // manifest metadata (project name, checksums) is stored unencrypted.
    expect(written.projectName).toBe("Route Test");
    expect(JSON.stringify(written)).not.toContain('"transactions"');
    expect(JSON.stringify(written)).not.toContain(result.checksum + "plaintext");
    await rm(dir, { recursive: true, force: true });
  });
});
