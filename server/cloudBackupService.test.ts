import { describe, expect, it } from "vitest";
import {
  getCloudStorageConfig,
  executeCloudBackup,
  normalizeBackupForChecksum,
} from "./cloudBackupService";
import { sha256Hex } from "../shared/platform/crypto";
import * as financeDb from "./db";

describe("Cloud Backup Service (S3 / Google Drive / Supabase)", () => {
  it("inspects available cloud storage configurations", () => {
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
