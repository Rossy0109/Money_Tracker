import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Request, Response } from "express";

/**
 * The weekly drill is the only thing in the system that has ever pulled a
 * stored backup back out of the bucket and pushed it through the real restore
 * path. It must stay honest: `verified: false` for every step it cannot prove,
 * an audit row either way, and the restore always rolled back.
 */

const downloadMocks = vi.hoisted(() => ({
  downloadLatestBackupObject: vi.fn(),
}));
vi.mock("./backupDownload", () => downloadMocks);

const backupDbMocks = vi.hoisted(() => ({
  lastCloudBackupManifest: vi.fn(),
  countProjectRecords: vi.fn(),
  latestRestoreDrillRows: vi.fn(async () => []),
}));
vi.mock("./backupDb", async importOriginal => ({
  ...(await importOriginal<typeof import("./backupDb")>()),
  ...backupDbMocks,
}));

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  databaseRequired: vi.fn(),
  restoreProjectBackup: vi.fn(),
}));
vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  ...dbMocks,
}));

const auditMocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
  systemActorUserId: vi.fn(async () => 1),
}));
vi.mock("./audit", async importOriginal => ({
  ...(await importOriginal<typeof import("./audit")>()),
  ...auditMocks,
}));

const authMocks = vi.hoisted(() => ({
  verifyBackupAuthorization: vi.fn(async () => true),
}));
vi.mock("./scheduledBackup", () => authMocks);

import {
  diffRecordCounts,
  drillProjectName,
  resolveDrillTarget,
  runRestoreDrill,
  runScheduledRestoreDrill,
  type DrillTarget,
} from "./restoreDrill";
import {
  aesGcmEncrypt,
  sha256Hex,
  bytesToHex,
  hexToBytes,
  randomBytesHex,
} from "../shared/platform/crypto";
import { keyIdForSecret } from "./backupIntegrity";

const CRON_SECRET = "unit-test-cron-secret";
const KEY = "restore-drill-test-key";

const target: DrillTarget = {
  userId: 7,
  projectId: 11,
  projectName: "নগদ হিসাব",
};

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

/** A chainable stand-in for a drizzle select in resolveDrillTarget. */
function queryChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

const COUNTS = { accounts: 2, transactions: 3, vouchers: 1 };

async function sealCloudEnvelope(
  plaintext: Record<string, unknown>,
  secret = KEY
) {
  const rawJson = JSON.stringify(plaintext, null, 2);
  const checksum = await sha256Hex(rawJson);
  const iv = hexToBytes(randomBytesHex(12));
  const sealed = await aesGcmEncrypt(await sha256Hex(secret), iv, rawJson);
  return {
    formatVersion: "finance-encrypted-cloud-backup-v1",
    checksum,
    projectId: target.projectId,
    projectName: target.projectName,
    timestamp: "2026-10-01T18:00:00.000Z",
    iv: bytesToHex(iv),
    encrypted: sealed.encrypted,
    tag: sealed.tag,
    keyId: await keyIdForSecret(secret),
  };
}

function projectBackup() {
  return {
    formatVersion: "finance-project-backup-v2",
    exportedAt: "2026-10-01T18:00:00.000Z",
    project: { id: 11, name: target.projectName },
    accounts: [{ id: 1 }, { id: 2 }],
    transactions: [{ id: 1 }, { id: 2 }, { id: 3 }],
    vouchers: [{ id: 1 }],
    categories: [],
    budgets: [],
    bills: [],
    dues: [],
    settlements: [],
    recurring: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BACKUP_ENCRYPTION_KEY = KEY;
  delete process.env.BACKUP_ENCRYPTION_KEYS;
  authMocks.verifyBackupAuthorization.mockResolvedValue(true);
  // Default: the restore hook runs and rolls back, the drill's happy path.
  dbMocks.restoreProjectBackup.mockImplementation(
    async (
      _userId: number,
      _input: unknown,
      options?: {
        insideTransaction?: (tx: unknown, projectId: number) => Promise<void>;
      }
    ) => {
      if (options?.insideTransaction) {
        await options.insideTransaction({ fakeTx: true }, 99);
      }
      return { projectId: 99 };
    }
  );
  backupDbMocks.countProjectRecords.mockResolvedValue(COUNTS);
});

afterEach(() => {
  delete process.env.BACKUP_ENCRYPTION_KEY;
  delete process.env.BACKUP_ENCRYPTION_KEYS;
});

describe("drillProjectName", () => {
  it("never exceeds the 120-char project name column", () => {
    const name = drillProjectName("x".repeat(200));
    expect(name.length).toBeLessThanOrEqual(120);
  });

  it("differs from the live project name so restore's duplicate guard passes", () => {
    expect(drillProjectName(target.projectName)).not.toBe(target.projectName);
    expect(drillProjectName(target.projectName)).toContain(target.projectName);
  });
});

describe("diffRecordCounts", () => {
  it("passes when the restored rows equal the recorded backup", () => {
    expect(diffRecordCounts(COUNTS, { ...COUNTS })).toEqual([]);
  });

  it("reports each table that differs, treating absent keys as zero", () => {
    expect(
      diffRecordCounts({ accounts: 2 }, { accounts: 3, vouchers: 1 })
    ).toEqual([
      "accounts: restored 2 vs recorded 3",
      "vouchers: restored 0 vs recorded 1",
    ]);
  });
});

describe("runRestoreDrill", () => {
  it("proves download → decrypt → manifest → rolled-back restore", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });

    const verdict = await runRestoreDrill(target);

    expect(verdict).toMatchObject({
      verified: true,
      manifestAuditId: 42,
      keyId: envelope.keyId,
      checkedTables: 3,
    });
    expect(verdict.counts).toEqual(COUNTS);
    expect(dbMocks.restoreProjectBackup).toHaveBeenCalledTimes(1);
    // The rehearsal must name a project that does not collide with the live one.
    expect(
      (dbMocks.restoreProjectBackup.mock.calls[0][1] as { projectName: string })
        .projectName
    ).not.toBe(target.projectName);
  });

  it("fails when the bucket holds nothing for the project", async () => {
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: null,
      miss:
        'no stored backup object found for project 11 "My App" — bucket holds 2 objects, none start with "My-App-backup-"',
    });
    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("no stored backup object");
    expect(dbMocks.restoreProjectBackup).not.toHaveBeenCalled();
  });

  it("fails when the object is not the cloud backup envelope", async () => {
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify({ formatVersion: "something-else" }),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("finance-encrypted-cloud-backup-v1");
  });

  it("fails when the key that sealed the backup is not configured", async () => {
    process.env.BACKUP_ENCRYPTION_KEY = "a-rotated-away-key";
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });

    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("unknown_key");
  });

  it("fails when the stored object is not the recorded backup", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: "f".repeat(64),
      fileName: "older.enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });

    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("does not match the recorded backup");
  });

  it("fails when the restored rows differ from the recorded counts", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: { ...COUNTS, transactions: 99 },
    });

    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("do not match the recorded backup");
    expect(verdict.reason).toContain("transactions");
  });

  it("fails when the drill hook never rolled the restore back", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });
    dbMocks.restoreProjectBackup.mockResolvedValue({ projectId: 99 });

    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("did not run");
  });

  it("reports a real restore failure without claiming success", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });
    dbMocks.restoreProjectBackup.mockRejectedValue(
      new Error("এই নামে একটি প্রজেক্ট ইতিমধ্যে আছে")
    );

    const verdict = await runRestoreDrill(target);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("restore failed");
    expect(verdict.reason).toContain("ইতিমধ্যে আছে");
  });
});

describe("resolveDrillTarget", () => {
  it("uses an explicit ?projectId=", async () => {
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(
          queryChain([{ id: 11, userId: 7, name: target.projectName }])
        ),
    });

    await expect(resolveDrillTarget({ projectId: "11" })).resolves.toEqual(
      target
    );
  });

  it("falls back to the newest backed-up project", async () => {
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(queryChain([{ projectId: 11, actorUserId: 7 }]))
        .mockReturnValueOnce(
          queryChain([{ id: 11, userId: 7, name: target.projectName }])
        ),
    });

    await expect(resolveDrillTarget({})).resolves.toEqual(target);
  });

  it("returns null when the backed-up project was deleted", async () => {
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(queryChain([{ projectId: 11, actorUserId: 7 }]))
        .mockReturnValueOnce(queryChain([])),
    });

    await expect(resolveDrillTarget({})).resolves.toBeNull();
  });
});

describe("runScheduledRestoreDrill response contract", () => {
  it("rejects requests without the cron secret without touching storage", async () => {
    authMocks.verifyBackupAuthorization.mockResolvedValue(false);
    const res = makeRes();
    await runScheduledRestoreDrill(makeReq(), res as unknown as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, verified: false });
    expect(downloadMocks.downloadLatestBackupObject).not.toHaveBeenCalled();
    expect(auditMocks.logAudit).not.toHaveBeenCalled();
  });

  it("returns 200 with the verdict and writes a restore_drill audit row", async () => {
    const envelope = await sealCloudEnvelope(projectBackup());
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: {
        provider: "supabase",
        fileName: "enc.json",
        payload: JSON.stringify(envelope),
        downloadedAt: new Date().toISOString(),
      },
      miss: null,
    });
    backupDbMocks.lastCloudBackupManifest.mockResolvedValue({
      auditId: 42,
      createdAt: new Date(),
      checksum: envelope.checksum,
      fileName: "enc.json",
      provider: "supabase",
      recordCounts: COUNTS,
    });
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(
          queryChain([{ id: 11, userId: 7, name: target.projectName }])
        ),
    });

    const res = makeRes();
    await runScheduledRestoreDrill(
      makeReq(CRON_SECRET, { projectId: "11" }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      verified: true,
      projectId: 11,
      projectName: target.projectName,
      checkedTables: 3,
    });
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "restore_drill",
        action: "update",
        projectId: 11,
      })
    );
  });

  it("answers 200 with verified:false and a failure audit row", async () => {
    downloadMocks.downloadLatestBackupObject.mockResolvedValue({
      object: null,
      miss: "no readable backup provider configured",
    });
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(
          queryChain([{ id: 11, userId: 7, name: target.projectName }])
        ),
    });

    const res = makeRes();
    await runScheduledRestoreDrill(
      makeReq(CRON_SECRET, { projectId: "11" }),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, verified: false });
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "restore_drill_failed" })
    );
  });

  it("returns 200 with verified:false when there is nothing to drill", async () => {
    dbMocks.databaseRequired.mockReturnValue({
      select: vi.fn().mockReturnValueOnce(queryChain([])),
    });

    const res = makeRes();
    await runScheduledRestoreDrill(
      makeReq(CRON_SECRET),
      res as unknown as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, verified: false });
  });

  it("returns 500 when the drill cannot run at all", async () => {
    // Two selects: the newest backup row, then the project it points at.
    dbMocks.databaseRequired.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(queryChain([{ projectId: 11, actorUserId: 7 }]))
        .mockReturnValueOnce(
          queryChain([{ id: 11, userId: 7, name: target.projectName }])
        ),
    });
    downloadMocks.downloadLatestBackupObject.mockRejectedValue(
      new Error("storage unreachable")
    );

    const res = makeRes();
    await runScheduledRestoreDrill(
      makeReq(CRON_SECRET),
      res as unknown as Response
    );

    // The download error is not part of the drill's own failure modes, so the
    // endpoint must answer 500 rather than a hollow success.
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false, verified: false });
  });
});

describe("restore-drill wiring", () => {
  it("is registered in both runtimes", () => {
    for (const file of ["server/_core/app.ts", "worker/app.ts"]) {
      const source = readFileSync(
        new URL(`../${file}`, import.meta.url),
        "utf8"
      );
      expect(source).toContain("/api/scheduled/restore-drill");
    }
  });

  it("is triggered weekly by its own workflow with the cron secret only", () => {
    const source = readFileSync(
      new URL("../.github/workflows/weekly-restore-drill.yml", import.meta.url),
      "utf8"
    );
    expect(source).toContain("/api/scheduled/restore-drill");
    expect(source).toContain("CRON_SECRET");
    expect(source).toMatch(/cron: "[0-9 *]+"/);
    expect(source).not.toContain("DATABASE_URL");
  });

  it("reports the drill through the health summary", () => {
    const source = readFileSync(
      new URL("./healthChecks.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain('id: "backup.restoreDrill"');
    expect(source).toContain("restoreDrill: toRate(");
    expect(source).toContain("summary.restoreDrill !==");
  });
});
