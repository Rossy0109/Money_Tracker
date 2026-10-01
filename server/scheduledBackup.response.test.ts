import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * runScheduledBackup must surface storage/integrity failures as HTTP 500 and
 * always report counts. A bare HTTP 200 historically masked backups that
 * stored nothing (upload errors are counted, never thrown).
 */

const dbMocks = vi.hoisted(() => ({
  listUsersForAdmin: vi.fn(),
  listProjects: vi.fn(),
  logAudit: vi.fn(),
  systemActorUserId: vi.fn(),
  exportProjectBackup: vi.fn(),
}));
vi.mock("./db", () => dbMocks);

const cloudMocks = vi.hoisted(() => ({
  executeCloudBackup: vi.fn(),
}));
// Keep the real normalizeBackupForChecksum — only executeCloudBackup is mocked.
vi.mock("./cloudBackupService", async importOriginal => {
  const actual =
    await importOriginal<typeof import("./cloudBackupService")>();
  return { ...actual, ...cloudMocks };
});

const sdkMocks = vi.hoisted(() => ({
  sdk: { authenticateRequest: vi.fn() },
}));
vi.mock("./_core/sdk", () => sdkMocks);

import { runScheduledBackup } from "./scheduledBackup";
import { sha256Hex } from "../shared/platform/crypto";
import type { CloudBackupResult } from "./cloudBackupService";

const CRON_SECRET = "unit-test-cron-secret";

function makeReq(authToken?: string): Request {
  const headers: Record<string, string> = {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function baseResult(
  overrides: Partial<CloudBackupResult>
): CloudBackupResult {
  return {
    success: true,
    provider: "local_encrypted",
    fileName: "backup-test.enc.json",
    checksum: "a".repeat(64),
    verifyChecksum: "a".repeat(64),
    byteSize: 1024,
    encrypted: true,
    timestamp: "2026-09-30T00:00:00.000Z",
    projectName: "Test Project",
    projectId: 10,
    message: "ok",
    ...overrides,
  };
}

function stubActiveWorkspace() {
  dbMocks.listUsersForAdmin.mockResolvedValue([{ id: 1, status: "active" }]);
  dbMocks.listProjects.mockResolvedValue([{ id: 10 }]);
  dbMocks.exportProjectBackup.mockResolvedValue({ projectId: 10 });
  dbMocks.logAudit.mockResolvedValue(undefined);
  dbMocks.systemActorUserId.mockResolvedValue(99);
  sdkMocks.sdk.authenticateRequest.mockRejectedValue(
    new Error("unauthenticated")
  );
}

describe("runScheduledBackup response contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 200 with counts when every project stores and verifies", async () => {
    stubActiveWorkspace();
    // `exportedAt` changes on every export, so the verify checksum is computed
    // without it — a raw re-export hash could never match the upload hash.
    const payload = {
      projectId: 10,
      transactions: 3,
      exportedAt: new Date("2026-09-30T10:00:00.000Z"),
    };
    dbMocks.exportProjectBackup.mockResolvedValue(payload);
    const checksum = await sha256Hex(JSON.stringify(payload, null, 2));
    const verifyChecksum = await sha256Hex(
      JSON.stringify({ projectId: 10, transactions: 3 }, null, 2)
    );
    cloudMocks.executeCloudBackup.mockResolvedValue(
      baseResult({ checksum, verifyChecksum })
    );

    const res = makeRes();
    await runScheduledBackup(makeReq(CRON_SECRET), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      projects: 1,
      stored: 1,
      verified: 1,
      failed: 0,
    });
    expect(dbMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backup_created",
        entityType: "cloud_backup",
      })
    );
  });

  it("returns 500 with counts when an upload fails", async () => {
    stubActiveWorkspace();
    cloudMocks.executeCloudBackup.mockResolvedValue(
      baseResult({ success: false, checksum: "", message: "upload failed" })
    );

    const res = makeRes();
    await runScheduledBackup(makeReq(CRON_SECRET), res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      projects: 1,
      stored: 0,
      verified: 0,
      failed: 1,
    });
    expect(dbMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "cloud_backup_failed",
      })
    );
  });

  it("returns 500 when the integrity re-export checksum mismatches", async () => {
    stubActiveWorkspace();
    cloudMocks.executeCloudBackup.mockResolvedValue(
      baseResult({ verifyChecksum: "b".repeat(64) })
    );

    const res = makeRes();
    await runScheduledBackup(makeReq(CRON_SECRET), res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, failed: 1, stored: 1 });
    expect(dbMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "cloud_backup_failed" })
    );
  });

  it("verifies when the re-export returns rows in a different order", async () => {
    stubActiveWorkspace();
    const payload = {
      projectId: 10,
      transactions: [
        { id: 2, amount: 20 },
        { id: 1, amount: 10 },
      ],
    };
    dbMocks.exportProjectBackup.mockResolvedValue(payload);
    const verifyChecksum = await sha256Hex(
      JSON.stringify(
        {
          projectId: 10,
          transactions: [
            { id: 1, amount: 10 },
            { id: 2, amount: 20 },
          ],
        },
        null,
        2
      )
    );
    cloudMocks.executeCloudBackup.mockResolvedValue(
      baseResult({ verifyChecksum })
    );

    const res = makeRes();
    await runScheduledBackup(makeReq(CRON_SECRET), res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      stored: 1,
      verified: 1,
      failed: 0,
    });
  });

  it("rejects unauthorized requests without running a backup", async () => {
    stubActiveWorkspace();

    const res = makeRes();
    await runScheduledBackup(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false });
    expect(cloudMocks.executeCloudBackup).not.toHaveBeenCalled();
    expect(dbMocks.logAudit).not.toHaveBeenCalled();
  });
});
