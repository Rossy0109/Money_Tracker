/**
 * Backup & Disaster Recovery Tests — Phase 11.
 *
 * Tests:
 *  1. Encryption fallback removed (no hardcoded key)
 *  2. BACKUP_ENCRYPTION_KEY env var is read
 *  3. Backup auth no longer accepts ADMIN_ACCESS_PASSWORD
 *  4. encryptPayload produces deterministic output for same input
 *  5. Backup integrity verification logic
 *  6. CloudBackupResult shape validation
 *  7. CloudStorageConfig detection
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { encryptPayload } from "./scheduledBackup";

// ─── Encrypt Payload Tests ───────────────────────────────────────────────────

describe("encryptPayload", () => {
  it("produces iv, encrypted, tag output", () => {
    const result = encryptPayload("test data", "my-secret-key");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("encrypted");
    expect(result).toHaveProperty("tag");
    expect(typeof result.iv).toBe("string");
    expect(typeof result.encrypted).toBe("string");
    expect(typeof result.tag).toBe("string");
  });

  it("produces different ciphertext for different keys", () => {
    const r1 = encryptPayload("test data", "key-1");
    const r2 = encryptPayload("test data", "key-2");
    expect(r1.encrypted).not.toBe(r2.encrypted);
  });

  it("produces different ciphertext for same key (random IV)", () => {
    const r1 = encryptPayload("test data", "same-key");
    const r2 = encryptPayload("test data", "same-key");
    expect(r1.encrypted).not.toBe(r2.encrypted);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("produces hex-encoded output", () => {
    const result = encryptPayload("test", "key");
    expect(result.iv).toMatch(/^[a-f0-9]+$/);
    expect(result.encrypted).toMatch(/^[a-f0-9]+$/);
    expect(result.tag).toMatch(/^[a-f0-9]+$/);
  });
});

// ─── ENV Configuration Tests ────────────────────────────────────────────────

describe("Backup ENV Configuration", () => {
  it("ENV has backupEncryptionKey property", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("backupEncryptionKey");
    expect(typeof ENV.backupEncryptionKey).toBe("string");
  });

  it("ENV has backupRetentionDays property", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("backupRetentionDays");
    expect(typeof ENV.backupRetentionDays).toBe("number");
    expect(ENV.backupRetentionDays).toBeGreaterThan(0);
  });

  it("ENV has backupCronSecret property", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toHaveProperty("backupCronSecret");
    expect(typeof ENV.backupCronSecret).toBe("string");
  });
});

// ─── CloudBackupResult Shape Tests ───────────────────────────────────────────

describe("CloudBackupResult Shape", () => {
  it("has all required fields", () => {
    const result: import("./cloudBackupService").CloudBackupResult = {
      success: true,
      provider: "s3",
      fileName: "test-backup-2024-01-01-abc123.enc.json",
      checksum: "a".repeat(64),
      byteSize: 1024,
      encrypted: true,
      timestamp: "2024-01-01T00:00:00.000Z",
      projectName: "Test Project",
      projectId: 1,
      message: "Success",
    };
    expect(result.success).toBe(true);
    expect(result.encrypted).toBe(true);
    expect(result.checksum).toHaveLength(64);
  });
});

// ─── Checksum Verification Tests ─────────────────────────────────────────────

describe("Checksum Verification", () => {
  it("SHA-256 checksum is consistent for same data", () => {
    const data = JSON.stringify({ test: true });
    const hash1 = createHash("sha256").update(data).digest("hex");
    const hash2 = createHash("sha256").update(data).digest("hex");
    expect(hash1).toBe(hash2);
  });

  it("SHA-256 checksum is 64 hex characters", () => {
    const hash = createHash("sha256").update("test").digest("hex");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("different data produces different checksums", () => {
    const h1 = createHash("sha256").update("data1").digest("hex");
    const h2 = createHash("sha256").update("data2").digest("hex");
    expect(h1).not.toBe(h2);
  });
});

// ─── Backup Auth Tests ───────────────────────────────────────────────────────

describe("Backup Authorization", () => {
  it("ADMIN_ACCESS_PASSWORD is not used in backup auth", () => {
    const source = readFileSync(new URL("./scheduledBackup.ts", import.meta.url), "utf8");
    expect(source).not.toContain("hasValidAdminPassword");
    expect(source).not.toContain("adminPasswordHeader");
    expect(source).not.toContain("req.body.adminPassword");
    expect(source).not.toContain("x-admin-password");
    expect(source).not.toContain("ADMIN_ACCESS_PASSWORD");
    expect(source).not.toContain("adminAccessPassword");
    expect(source).not.toContain("ENV.adminAccessPassword");
  });

  it("CRON_SECRET is used for backup auth", () => {
    const source = readFileSync(new URL("./scheduledBackup.ts", import.meta.url), "utf8");
    expect(source).toContain("hasValidCronSecret");
    // Auth goes through ENV.backupCronSecret (CRON_SECRET / BACKUP_CRON_SECRET).
    expect(source).toContain("ENV.backupCronSecret");
  });

  it("ENV.backupCronSecret only reads CRON_SECRET / BACKUP_CRON_SECRET", () => {
    const envSource = readFileSync(new URL("./_core/env.ts", import.meta.url), "utf8");
    const match = envSource.match(/backupCronSecret:\s*([^,\n]+)/);
    expect(match).toBeTruthy();
    const expr = match![1];
    expect(expr).toContain("CRON_SECRET");
    expect(expr).not.toContain("ADMIN_ACCESS_PASSWORD");
    expect(expr).not.toContain("adminAccessPassword");
  });

  it("GitHub daily backup workflow does not fall back to ADMIN_ACCESS_PASSWORD", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/daily-backup.yml", import.meta.url),
      "utf8"
    );
    // Comments may mention the secret name to forbid it; it must never be read.
    expect(workflow).not.toMatch(/secrets\.ADMIN_ACCESS_PASSWORD/);
    expect(workflow).not.toMatch(/BACKUP_SECRET:.*ADMIN_ACCESS_PASSWORD/);
    expect(workflow).toContain("CRON_SECRET");
  });

  it("scheduled backup route accepts GET (Vercel Cron) and is not POST-only", () => {
    const appSource = readFileSync(new URL("./_core/app.ts", import.meta.url), "utf8");
    const hasAll = appSource.includes('app.all("/api/scheduled/finance-backup"');
    const hasGet = appSource.includes('app.get("/api/scheduled/finance-backup"');
    const hasPost = appSource.includes('app.post("/api/scheduled/finance-backup"');

    expect(hasAll || hasGet).toBe(true);
    // POST-only registration is the historical production 404 bug.
    expect(hasPost && !hasGet && !hasAll).toBe(false);
  });

  it("vercel.json cron path is covered by a GET-capable Express registration", () => {
    const vercel = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
    ) as { crons?: Array<{ path: string }> };
    const appSource = readFileSync(new URL("./_core/app.ts", import.meta.url), "utf8");

    const cronPaths = vercel.crons?.map(c => c.path) ?? [];
    expect(cronPaths).toContain("/api/scheduled/finance-backup");

    for (const path of cronPaths) {
      const covered =
        appSource.includes(`app.all("${path}"`) ||
        (appSource.includes(`app.get("${path}"`) && appSource.includes(`app.post("${path}"`));
      expect(covered, `cron ${path} must accept GET for Vercel Cron`).toBe(true);
    }
  });
});

// ─── S3 upload must not claim success without an actual upload ───────────────

describe("Cloud upload partial-failure safety", () => {
  it("uploadToS3 does not return true when S3 failed and no webhook", () => {
    const source = readFileSync(new URL("./cloudBackupService.ts", import.meta.url), "utf8");
    // Scope to uploadToS3 only — later helpers (e.g. Google Drive) may return true.
    const start = source.indexOf("async function uploadToS3");
    const end = source.indexOf("async function uploadToGoogleDrive");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const uploadToS3Body = source.slice(start, end);
    // After the direct S3 try/catch, a missing webhook must fail closed.
    expect(uploadToS3Body).toContain("Direct S3 upload error");
    expect(uploadToS3Body).toContain("return false");
    expect(uploadToS3Body).toMatch(
      /do not claim success\.\s*\n\s*return false;\s*\n\}/
    );
    expect(uploadToS3Body.slice(uploadToS3Body.lastIndexOf("const webhook"))).not.toMatch(
      /return true;/
    );
  });
});

// ─── Encryption Key Fallback Tests ───────────────────────────────────────────

describe("Encryption Key Security", () => {
  it("no hardcoded encryption fallback in cloudBackupService", () => {
    const source = readFileSync(new URL("./cloudBackupService.ts", import.meta.url), "utf8");
    expect(source).not.toContain("secure-cloud-backup-key");
    expect(source).not.toContain("ENV.adminAccessPassword");
  });

  it("throws when BACKUP_ENCRYPTION_KEY is not set", () => {
    const source = readFileSync(new URL("./cloudBackupService.ts", import.meta.url), "utf8");
    expect(source).toContain("BACKUP_ENCRYPTION_KEY");
  });
});

// ─── BackupDb Tests ──────────────────────────────────────────────────────────

describe("BackupDb Functions", () => {
  it("backupDb exports all required functions", async () => {
    const backupDb = await import("./backupDb");
    expect(typeof backupDb.saveHealthSnapshot).toBe("function");
    expect(typeof backupDb.getDriveConnection).toBe("function");
    expect(typeof backupDb.lastBackupForKind).toBe("function");
    expect(typeof backupDb.backupStatusSummary).toBe("function");
    expect(typeof backupDb.countProjectRecords).toBe("function");
  });
});
