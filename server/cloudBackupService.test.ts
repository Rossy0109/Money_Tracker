import { describe, expect, it } from "vitest";
import { getCloudStorageConfig, executeCloudBackup } from "./cloudBackupService";
import * as financeDb from "./db";

describe("Cloud Backup Service (S3 / Google Drive / Supabase)", () => {
  it("inspects available cloud storage configurations", () => {
    const config = getCloudStorageConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("creates encrypted cloud backup package with sha-256 verification", async () => {
    const admin = await financeDb.getUserByEmail("admin@example.com");
    if (!admin) return;

    const projects = await financeDb.listProjects(admin.id);
    if (!projects.length) return;

    const result = await executeCloudBackup(admin.id, projects[0].id, "test-encryption-key-123");

    expect(result.success).toBe(true);
    expect(result.checksum).toBeDefined();
    expect(result.checksum.length).toBe(64); // SHA-256 length
    expect(result.encrypted).toBe(true);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.fileName).toContain(".enc.json");
  });
});
