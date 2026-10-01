import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Request, Response } from "express";

/**
 * The daily workflow verifies storage through this read-only endpoint instead
 * of connecting to the production database from GitHub. It must stay strict:
 * HTTP 200 with `verified: false` is a failure the workflow turns into a red
 * job, and the cron secret is the only thing that may read the audit trail.
 */

const backupDbMocks = vi.hoisted(() => ({
  latestCloudBackupAuditRows: vi.fn(),
}));
vi.mock("./backupDb", () => backupDbMocks);

const dbMocks = vi.hoisted(() => ({
  listUsersForAdmin: vi.fn(),
  listProjects: vi.fn(),
  logAudit: vi.fn(),
  systemActorUserId: vi.fn(),
  exportProjectBackup: vi.fn(),
}));
vi.mock("./db", () => dbMocks);

const sdkMocks = vi.hoisted(() => ({
  sdk: { authenticateRequest: vi.fn() },
}));
vi.mock("./_core/sdk", () => sdkMocks);

import {
  parseBackupSummaryCounts,
  runScheduledBackupAudit,
  verifyBackupAuditRow,
  type CloudBackupAuditRow,
} from "./scheduledBackupAudit";

const CRON_SECRET = "unit-test-cron-secret";

function makeReq(authToken?: string, query?: Record<string, string>): Request {
  const headers: Record<string, string> = {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  return { headers, query: query ?? {} } as unknown as Request;
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

function auditRow(overrides: Partial<CloudBackupAuditRow> = {}): CloudBackupAuditRow {
  return {
    id: 42,
    entityType: "cloud_backup",
    summary:
      "Scheduled backup completed: 3 projects, 3 stored, 3 verified, 0 failed integrity",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("parseBackupSummaryCounts", () => {
  it("parses the scheduled summary", () => {
    expect(
      parseBackupSummaryCounts(
        "Scheduled backup completed: 3 projects, 3 stored, 3 verified, 0 failed integrity"
      )
    ).toEqual({ projects: 3, stored: 3, verified: 3, failed: 0 });
  });

  it("handles the singular form and returns null for anything else", () => {
    expect(
      parseBackupSummaryCounts(
        "Scheduled backup completed: 1 project, 1 stored, 1 verified, 0 failed integrity"
      )
    ).toEqual({ projects: 1, stored: 1, verified: 1, failed: 0 });
    expect(parseBackupSummaryCounts("Cloud backup executed (supabase): x.enc.json")).toBeNull();
    expect(parseBackupSummaryCounts(null)).toBeNull();
  });
});

describe("verifyBackupAuditRow", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("accepts a complete success inside the window", () => {
    const verdict = verifyBackupAuditRow(
      [auditRow({ createdAt: new Date("2026-10-01T11:50:00.000Z") })],
      30,
      now
    );
    expect(verdict.verified).toBe(true);
    expect(verdict.counts).toEqual({
      projects: 3,
      stored: 3,
      verified: 3,
      failed: 0,
    });
  });

  it("rejects when no backup was ever audited", () => {
    const verdict = verifyBackupAuditRow([], 30, now);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("no backup audit row");
  });

  it("rejects a row older than the window", () => {
    const verdict = verifyBackupAuditRow(
      [auditRow({ createdAt: new Date("2026-10-01T11:00:00.000Z") })],
      30,
      now
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("older than the 30-minute window");
  });

  it("rejects a failed audit row", () => {
    const verdict = verifyBackupAuditRow(
      [
        auditRow({
          createdAt: new Date("2026-10-01T11:50:00.000Z"),
          entityType: "cloud_backup_failed",
          summary:
            "Scheduled backup completed: 3 projects, 3 stored, 0 verified, 3 failed integrity",
        }),
      ],
      30,
      now
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("cloud_backup_failed");
  });

  it("rejects an incomplete success", () => {
    const verdict = verifyBackupAuditRow(
      [
        auditRow({
          createdAt: new Date("2026-10-01T11:50:00.000Z"),
          summary:
            "Scheduled backup completed: 3 projects, 2 stored, 3 verified, 0 failed integrity",
        }),
      ],
      30,
      now
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("incomplete backup");
  });

  it("rejects a zero-project run and an unparsable summary", () => {
    const empty = verifyBackupAuditRow(
      [
        auditRow({
          createdAt: new Date("2026-10-01T11:50:00.000Z"),
          summary:
            "Scheduled backup completed: 0 projects, 0 stored, 0 verified, 0 failed integrity",
        }),
      ],
      30,
      now
    );
    expect(empty.verified).toBe(false);
    expect(empty.reason).toContain("no projects were backed up");

    const garbled = verifyBackupAuditRow(
      [
        auditRow({
          createdAt: new Date("2026-10-01T11:50:00.000Z"),
          summary: "something else entirely",
        }),
      ],
      30,
      now
    );
    expect(garbled.verified).toBe(false);
    expect(garbled.reason).toContain("cannot parse backup summary");
  });
});

describe("runScheduledBackupAudit response contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    sdkMocks.sdk.authenticateRequest.mockRejectedValue(
      new Error("unauthenticated")
    );
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests without the cron secret without reading the database", async () => {
    const res = makeRes();
    await runScheduledBackupAudit(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, verified: false });
    expect(backupDbMocks.latestCloudBackupAuditRows).not.toHaveBeenCalled();
  });

  it("returns 200 with the verdict and history for an authorized read", async () => {
    backupDbMocks.latestCloudBackupAuditRows.mockResolvedValue([auditRow()]);

    const res = makeRes();
    await runScheduledBackupAudit(
      makeReq(CRON_SECRET, { windowMinutes: "30" }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      verified: true,
      windowMinutes: 30,
      counts: { projects: 3, stored: 3, verified: 3, failed: 0 },
      audit: { id: 42, entityType: "cloud_backup" },
    });
    expect(backupDbMocks.latestCloudBackupAuditRows).toHaveBeenCalledWith(5);
  });

  it("returns 200 with verified:false when the newest row failed", async () => {
    backupDbMocks.latestCloudBackupAuditRows.mockResolvedValue([
      auditRow({ entityType: "cloud_backup_failed" }),
    ]);

    const res = makeRes();
    await runScheduledBackupAudit(
      makeReq(CRON_SECRET),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, verified: false });
  });

  it("clamps a bogus window instead of trusting it", async () => {
    backupDbMocks.latestCloudBackupAuditRows.mockResolvedValue([auditRow()]);

    const res = makeRes();
    await runScheduledBackupAudit(
      makeReq(CRON_SECRET, { windowMinutes: "not-a-number" }),
      res as unknown as Response
    );

    expect(res.body).toMatchObject({ windowMinutes: 30 });
  });

  it("returns 500 when the audit trail cannot be read", async () => {
    backupDbMocks.latestCloudBackupAuditRows.mockRejectedValue(
      new Error("Database unavailable")
    );

    const res = makeRes();
    await runScheduledBackupAudit(
      makeReq(CRON_SECRET),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, verified: false });
  });
});

describe("backup-audit route registration", () => {
  // The workflow calls this path directly; an unregistered route would 404 and
  // fail the daily job with a misleading "audit read failed".
  it("is registered in both runtimes", () => {
    for (const file of ["server/_core/app.ts", "worker/app.ts"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source).toContain("/api/scheduled/backup-audit");
    }
  });

  it("shares the cron-secret authorization that never accepts the admin password", () => {
    const source = readFileSync(
      new URL("./scheduledBackup.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("admin elevation password is never accepted");
    const authBody = source.slice(
      source.indexOf("function hasValidCronSecret"),
      source.indexOf("export async function verifyBackupAuthorization")
    );
    expect(authBody).not.toContain("ADMIN_ACCESS_PASSWORD");
  });
});
