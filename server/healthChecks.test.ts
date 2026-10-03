import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock("./backupDb", () => ({
  saveHealthSnapshot: vi.fn(async () => {}),
  getDriveConnection: vi.fn(async () => null),
  lastBackupForKind: vi.fn(async () => null),
  backupStatusSummary: vi.fn(async () => ({ pending: 0, failed: 0 })),
  latestRestoreDrillRows: vi.fn(async () => []),
}));

vi.mock("./integrityCheck", () => ({
  runIntegrityCheck: vi.fn(),
}));

vi.mock("./accountingAudit", () => ({
  latestAccountingAuditRows: vi.fn(async () => []),
  verifyAccountingAuditRow: vi.fn(
    (rows: Array<{
      id: number;
      entityType: string;
      summary: string;
      createdAt: Date;
    }>) => {
      const row = rows[0] ?? null;
      if (!row) {
        return {
          verified: false,
          reason: "কোনো হিসাব-অডিট রেকর্ড নেই — এখনো কোনো রন হয়নি",
          row: null,
        };
      }
      if (row.entityType !== "accounting_invariants") {
        return { verified: false, reason: row.summary, row };
      }
      return { verified: true, row };
    }
  ),
}));

import { getDb, listProjects } from "./db";
import { lastBackupForKind, latestRestoreDrillRows } from "./backupDb";
import { runIntegrityCheck } from "./integrityCheck";
import { latestAccountingAuditRows } from "./accountingAudit";
import { ENV } from "./_core/env";
import { runHealthChecks } from "./healthChecks";
import { performanceStore } from "./_core/requestMetrics";

const mockGetDb = vi.mocked(getDb);
const mockProjects = vi.mocked(listProjects);
const mockLastBackup = vi.mocked(lastBackupForKind);
const mockRestoreDrill = vi.mocked(latestRestoreDrillRows);
const mockIntegrity = vi.mocked(runIntegrityCheck);
const mockAccountingRows = vi.mocked(latestAccountingAuditRows);

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "VERCEL_URL",
] as const;
const savedProcessEnv = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;
const savedEnv = {
  authMode: ENV.authMode,
  googleOAuthClientId: ENV.googleOAuthClientId,
  googleOAuthClientSecret: ENV.googleOAuthClientSecret,
  googleOAuthRedirectUri: ENV.googleOAuthRedirectUri,
  blobReadWriteToken: ENV.blobReadWriteToken,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(ENV, {
    authMode: "password",
    googleOAuthClientId: "",
    googleOAuthClientSecret: "",
    googleOAuthRedirectUri: "",
    blobReadWriteToken: "",
  });
  mockGetDb.mockResolvedValue({ execute: vi.fn(async () => []) } as never);
  mockProjects.mockResolvedValue([]);
  mockAccountingRows.mockResolvedValue([]);
  mockIntegrity.mockResolvedValue({
    projectId: 2,
    projectName: "P",
    status: "VERIFIED",
    diffs: [],
    checkedAt: new Date().toISOString(),
  } as never);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedProcessEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedProcessEnv[key];
  }
  Object.assign(ENV, savedEnv);
});

describe("runHealthChecks without a user", () => {
  it("reports database, password auth, and versions", async () => {
    const report = await runHealthChecks(null);
    expect(report.appVersion).toBe("1.0.0");
    expect(report.schemaVersion).toBe("1");
    const byId = Object.fromEntries(report.checks.map(c => [c.id, c]));
    expect(byId["database.read"].status).toBe("ok");
    expect(byId["database.write"].status).toBe("ok");
    expect(byId["auth.password"].status).toBe("ok");
    expect(byId["storage.supabase"].status).toBe("not_configured");
    expect(byId["vercel.api"].status).toBe("unknown");
    expect(byId["drive.connection"].status).toBe("not_configured");
    expect(byId["backup.last"].status).toBe("fail");
    expect(byId["performance.requests"].status).toBe("ok");
    expect(byId["performance.slowQueries"].status).toBe("ok");
    expect(report.summary.database).toBe("ok");
    expect(report.summary.lastBackup).toBe("none");
    expect(report.integrity).toEqual([]);
  });

  it("surfaces the collected request latency percentiles", async () => {
    for (const ms of [12, 30, 900]) {
      performanceStore.record("GET", "/api/healthz", ms);
    }

    const report = await runHealthChecks(null);
    const perf = report.checks.find(c => c.id === "performance.requests");
    expect(perf?.status).toBe("ok");
    expect(perf?.latencyMs).toBeGreaterThanOrEqual(12);
    expect(perf?.details).toContain("p95");
    expect(perf?.details).toContain("3টি অনুরোধ");
    expect(report.summary).not.toHaveProperty("performance");

    performanceStore.reset();
  });

  it("rejects when the database is unreachable", async () => {
    mockGetDb.mockResolvedValue(null);
    await expect(runHealthChecks(null)).rejects.toThrow("ডেটাবেস অপ্রাপ্য");
  });

  it("fails unconfigured google auth", async () => {
    Object.assign(ENV, { authMode: "google" });
    const report = await runHealthChecks(null);
    const auth = report.checks.find(c => c.id === "auth.google");
    expect(auth?.status).toBe("fail");
    expect(report.summary.auth).toBe("fail");
  });
});

describe("runHealthChecks with a user", () => {
  it("aggregates backup, pending, drive, and integrity checks", async () => {
    mockProjects.mockResolvedValue([{ id: 2, name: "P" }] as never);
    mockLastBackup.mockResolvedValue({
      verifiedAt: new Date(),
      backupId: "1",
      fileName: "b.enc.json",
      recordCountsJson: null,
    });
    const report = await runHealthChecks(1);
    const byId = Object.fromEntries(report.checks.map(c => [c.id, c]));
    expect(byId["backup.last"].status).toBe("ok");
    expect(byId["backup.pending"].status).toBe("ok");
    expect(byId["drive.connection"].status).toBe("not_configured");
    expect(byId["integrity"].status).toBe("ok");
    expect(report.summary.lastBackup).toBe("ok");
    expect(report.integrity).toEqual([
      {
        projectId: 2,
        projectName: "P",
        status: "VERIFIED",
        diffs: 0,
        checkedAt: expect.any(String),
      },
    ]);
  });

  it("fails integrity on mismatches and flags stale backups", async () => {
    mockProjects.mockResolvedValue([{ id: 2, name: "P" }] as never);
    mockLastBackup.mockResolvedValue({
      verifiedAt: new Date(Date.now() - 72 * 3_600_000),
      backupId: "1",
      fileName: "b.enc.json",
      recordCountsJson: null,
    });
    mockIntegrity.mockResolvedValue({
      projectId: 2,
      projectName: "P",
      status: "MISMATCH",
      diffs: [{ entity: "transactions", live: 1, manifest: 0 }],
    } as never);
    const report = await runHealthChecks(1);
    const byId = Object.fromEntries(report.checks.map(c => [c.id, c]));
    expect(byId["backup.last"].status).toBe("fail");
    expect(byId["integrity"].status).toBe("fail");
    expect(byId["integrity"].error).toContain("অমিল");
    expect(report.summary.lastBackup).toBe("stale");
  });

  it("reports the weekly restore drill and lets a failed one degrade health", async () => {
    mockProjects.mockResolvedValue([] as never);
    mockLastBackup.mockResolvedValue(null);

    // Never run: unknown, and unknown must not degrade the app.
    mockRestoreDrill.mockResolvedValue([]);
    let report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "backup.restoreDrill")?.status
    ).toBe("unknown");
    expect(report.summary.restoreDrill).toBe("unknown");
    expect(report.overallStatus).toBe("ok");

    // A failed drill is a broken disaster-recovery path — degrade.
    mockRestoreDrill.mockResolvedValue([
      {
        id: 1,
        entityType: "restore_drill_failed",
        summary: "Restore drill FAILED: no stored backup object",
        projectId: 2,
        createdAt: new Date(),
      },
    ]);
    report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "backup.restoreDrill")?.status
    ).toBe("fail");
    expect(report.summary.restoreDrill).toBe("fail");
    expect(report.overallStatus).toBe("degraded");

    // A drill older than the weekly schedule counts as missing.
    mockRestoreDrill.mockResolvedValue([
      {
        id: 2,
        entityType: "restore_drill",
        summary: "Restore drill OK",
        projectId: 2,
        createdAt: new Date(Date.now() - 9 * 24 * 3_600_000),
      },
    ]);
    report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "backup.restoreDrill")?.status
    ).toBe("fail");

    // A fresh, successful drill is healthy.
    mockRestoreDrill.mockResolvedValue([
      {
        id: 3,
        entityType: "restore_drill",
        summary: "Restore drill OK",
        projectId: 2,
        createdAt: new Date(),
      },
    ]);
    report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "backup.restoreDrill")?.status
    ).toBe("ok");
    expect(report.summary.restoreDrill).toBe("ok");
    expect(report.overallStatus).toBe("ok");

    mockRestoreDrill.mockResolvedValue([]);
  });

  it("marks blob storage ok when configured", async () => {
    Object.assign(ENV, { blobReadWriteToken: "tok" });
    const report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "storage.vercel_blob")?.status
    ).toBe("ok");
    expect(report.summary.storage).toBe("ok");
  });
});

describe("accounting invariants check", () => {
  it("stays unknown until the first audit run is recorded", async () => {
    const report = await runHealthChecks(null);
    const check = report.checks.find(c => c.id === "accounting.invariants");
    expect(check?.status).toBe("unknown");
    expect(check?.error).toContain("রেকর্ড নেই");
    expect(report.summary.accountingInvariants).toBe("unknown");
    // "unknown" is not a failure: the panel degrades only on a violated
    // invariant, never because the job has not run yet.
    expect(report.overallStatus).toBe("ok");
  });

  it("reports ok for a fresh balanced run", async () => {
    mockAccountingRows.mockResolvedValue([
      {
        id: 4,
        entityType: "accounting_invariants",
        summary: "ডাবল-এন্ট্রি অডিট: 3 প্রজেক্ট, ০ অসামঞ্জস্য",
        createdAt: new Date(),
      },
    ]);
    const report = await runHealthChecks(null);
    const check = report.checks.find(c => c.id === "accounting.invariants");
    expect(check?.status).toBe("ok");
    expect(check?.error).toBeNull();
    expect(report.summary.accountingInvariants).toBe("ok");
    expect(report.overallStatus).toBe("ok");
  });

  it("fails the panel and the overall status on a violated invariant", async () => {
    mockAccountingRows.mockResolvedValue([
      {
        id: 5,
        entityType: "accounting_invariants_failed",
        summary: "ডাবল-এন্ট্রি অডিট ব্যর্থ: 3 প্রজেক্টে 2 অসামঞ্জস্য",
        createdAt: new Date(),
      },
    ]);
    const report = await runHealthChecks(null);
    const check = report.checks.find(c => c.id === "accounting.invariants");
    expect(check?.status).toBe("fail");
    expect(check?.error).toContain("অসামঞ্জস্য");
    expect(check?.retryAction).toContain("accounting-audit");
    expect(report.summary.accountingInvariants).toBe("fail");
    expect(report.overallStatus).toBe("degraded");
  });
});
