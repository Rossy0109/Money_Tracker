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
}));

vi.mock("./integrityCheck", () => ({
  runIntegrityCheck: vi.fn(),
}));

import { getDb, listProjects } from "./db";
import { lastBackupForKind } from "./backupDb";
import { runIntegrityCheck } from "./integrityCheck";
import { ENV } from "./_core/env";
import { runHealthChecks } from "./healthChecks";

const mockGetDb = vi.mocked(getDb);
const mockProjects = vi.mocked(listProjects);
const mockLastBackup = vi.mocked(lastBackupForKind);
const mockIntegrity = vi.mocked(runIntegrityCheck);

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
    expect(report.summary.database).toBe("ok");
    expect(report.summary.lastBackup).toBe("none");
    expect(report.integrity).toEqual([]);
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

  it("marks blob storage ok when configured", async () => {
    Object.assign(ENV, { blobReadWriteToken: "tok" });
    const report = await runHealthChecks(null);
    expect(
      report.checks.find(c => c.id === "storage.vercel_blob")?.status
    ).toBe("ok");
    expect(report.summary.storage).toBe("ok");
  });
});
