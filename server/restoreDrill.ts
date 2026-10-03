/**
 * Weekly proof that a stored backup really restores.
 *
 * The daily backup run proves its payload was *stored* (backup-audit reads the
 * `cloud_backup` row back). Storage is not recovery: nothing until now had ever
 * pulled the object out of the bucket, decrypted it with the live keyring,
 * matched it against the counts recorded at backup time, and pushed its rows
 * through the real restore path. This endpoint does exactly that — inside a
 * transaction that is always rolled back, so a rehearsal never leaves a
 * project, an audit row or a single row of data behind.
 *
 * It runs weekly from GitHub Actions with only the cron secret, the same
 * trust boundary as the backup trigger: no production database credential in
 * Actions.
 */
import type { Request, Response } from "express";
import {
  BackupIntegrityError,
  decryptEnvelopePayload,
} from "./backupIntegrity";
import { getBackupKeySecrets } from "./backupKeys";
import { downloadLatestBackupObject } from "./backupDownload";
import { lastCloudBackupManifest } from "./backupDb";
import { logAudit, systemActorUserId } from "./audit";
import logger from "./_core/logger";
import { verifyBackupAuthorization } from "./scheduledBackup";

export interface DrillTarget {
  userId: number;
  projectId: number;
  projectName: string;
}

export interface RestoreDrillVerdict {
  verified: boolean;
  reason?: string;
  provider?: string | null;
  fileName?: string | null;
  keyId?: string | null;
  backupTimestamp?: string | null;
  manifestAuditId?: number | null;
  /** Counts observed on the rows the restore actually wrote (rolled back). */
  counts?: Record<string, number> | null;
  /** Counts the backup run recorded when it stored the object. */
  manifestCounts?: Record<string, number> | null;
  checkedTables?: number;
}

const ENVELOPE_FORMAT = "finance-encrypted-cloud-backup-v1";
const MAX_PROJECT_NAME = 120;

/** The shape restoreProjectBackup accepts, read off the function itself. */
type ProjectBackupArg = Parameters<
  (typeof import("./db"))["restoreProjectBackup"]
>[1]["backup"];

/** Thrown inside the restore transaction to force the rollback. */
class DrillRollback extends Error {
  readonly drillRollback = true;
  constructor() {
    super("RESTORE_DRILL_ROLLBACK");
    this.name = "DrillRollback";
  }
}

function isDrillRollback(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { drillRollback?: boolean }).drillRollback === true
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Unique, bounded name: the live project of the same name already exists. */
export function drillProjectName(
  projectName: string,
  now: Date = new Date()
): string {
  const suffix = ` —রিস্টোর ড্রিল ${now.toISOString().slice(0, 10)}`;
  return projectName.slice(0, MAX_PROJECT_NAME - suffix.length) + suffix;
}

/**
 * Compare two `countProjectRecords` snapshots. Returns one line per table that
 * differs, empty when the restored rows match the recorded backup exactly.
 */
export function diffRecordCounts(
  restored: Record<string, number>,
  recorded: Record<string, number>
): string[] {
  const keys = [
    ...new Set([...Object.keys(restored), ...Object.keys(recorded)]),
  ];
  const diffs: string[] = [];
  for (const key of keys.sort()) {
    const a = restored[key] ?? 0;
    const b = recorded[key] ?? 0;
    if (a !== b) diffs.push(`${key}: restored ${a} vs recorded ${b}`);
  }
  return diffs;
}

function fail(reason: string): RestoreDrillVerdict {
  return { verified: false, reason, counts: null, manifestCounts: null };
}

/**
 * Download, decrypt, verify and rehearse a restore of the newest stored
 * backup for `target`. Never writes: the restore transaction always rolls
 * back, and the only row this ever adds is the drill's own audit entry.
 */
export async function runRestoreDrill(
  target: DrillTarget
): Promise<RestoreDrillVerdict> {
  // The newest stored *filename* is not necessarily the newest successful
  // backup: the name's trailing hash sorts lexically, not chronologically.
  // Ask for the exact object the latest successful audit row recorded first,
  // and only fall back to name-order when that row names no file.
  const manifest = await lastCloudBackupManifest(target.userId, target.projectId);
  const lookup = await downloadLatestBackupObject({
    projectName: target.projectName,
    projectId: target.projectId,
    preferFileName: manifest?.fileName ?? null,
  });
  if (!lookup.object) {
    return fail(
      lookup.miss ??
        `no stored backup object found for project "${target.projectName}"`
    );
  }
  const object = lookup.object;

  let envelope: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(object.payload);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    envelope = parsed as Record<string, unknown>;
  } catch {
    return fail(`stored object ${object.fileName} is not valid JSON`);
  }
  if (envelope.formatVersion !== ENVELOPE_FORMAT) {
    return fail(
      `stored object ${object.fileName} is not a ${ENVELOPE_FORMAT} envelope`
    );
  }

  let decrypted: Awaited<ReturnType<typeof decryptEnvelopePayload>>;
  try {
    decrypted = await decryptEnvelopePayload(envelope, getBackupKeySecrets());
  } catch (error) {
    const code =
      error instanceof BackupIntegrityError ? error.code : "decrypt_error";
    return fail(`[${code}] ${errorMessage(error)}`);
  }

  let backup: unknown;
  try {
    backup = JSON.parse(decrypted.plaintext);
    if (!backup || typeof backup !== "object") throw new Error("not an object");
  } catch {
    return fail("decrypted content is not valid JSON");
  }
  const project = (backup as Record<string, unknown>).project as
    { name?: unknown } | undefined;
  if (
    !project?.name ||
    !Array.isArray((backup as Record<string, unknown>).accounts)
  ) {
    return fail("decrypted content is not a project backup");
  }

  if (!manifest) {
    return fail("no cloud_backup audit row recorded for this project");
  }
  if (!manifest.checksum || manifest.checksum !== decrypted.checksum) {
    return fail(
      `stored object ${object.fileName} has checksum ${decrypted.checksum.slice(0, 10)} which does not match the recorded backup ${manifest.checksum?.slice(0, 10) ?? "none"} (${manifest.fileName ?? "unknown file"}) — the bucket holds a different object than the last successful run`
    );
  }
  if (!manifest.recordCounts) {
    return fail(
      `backup audit row #${manifest.auditId} has no record counts to verify against`
    );
  }

  let counts: Record<string, number> | null = null;
  try {
    const { restoreProjectBackup } = await import("./db");
    const { countProjectRecords } = await import("./backupDb");
    await restoreProjectBackup(
      target.userId,
      {
        projectName: drillProjectName(target.projectName),
        backup: backup as ProjectBackupArg,
      },
      {
        insideTransaction: async (tx, restoredProjectId) => {
          counts = await countProjectRecords(target.userId, restoredProjectId, {
            executor: tx,
            skipOwnershipCheck: true,
          });
          throw new DrillRollback();
        },
      }
    );
    return fail(
      "restore drill hook did not run — the rehearsal cannot be trusted"
    );
  } catch (error) {
    if (!isDrillRollback(error)) {
      return fail(`restore failed: ${errorMessage(error)}`);
    }
  }

  if (!counts) {
    return fail("no record counts were observed inside the restore");
  }
  const diffs = diffRecordCounts(counts, manifest.recordCounts);
  if (diffs.length > 0) {
    return fail(
      `restored rows do not match the recorded backup — ${diffs.slice(0, 6).join("; ")}`
    );
  }

  return {
    verified: true,
    provider: object.provider,
    fileName: object.fileName,
    keyId: decrypted.keyId,
    backupTimestamp:
      typeof envelope.timestamp === "string" ? envelope.timestamp : null,
    manifestAuditId: manifest.auditId,
    counts,
    manifestCounts: manifest.recordCounts,
    checkedTables: Object.keys(counts).length,
  };
}

/**
 * Whom to drill: an explicit `?projectId=`, otherwise the newest backed-up
 * project whose row still exists. Returns null when there is nothing to drill.
 */
export async function resolveDrillTarget(
  query: Record<string, unknown>
): Promise<DrillTarget | null> {
  const { getDb, databaseRequired } = await import("./db");
  const { auditLogs, financeProjects } = await import("../drizzle/schema");
  const { and, desc, eq, inArray, isNotNull } = await import("drizzle-orm");
  const db = databaseRequired(await getDb());

  const projectId = Number(query.projectId);
  if (Number.isInteger(projectId) && projectId > 0) {
    const [project] = await db
      .select({
        id: financeProjects.id,
        userId: financeProjects.userId,
        name: financeProjects.name,
      })
      .from(financeProjects)
      .where(eq(financeProjects.id, projectId))
      .limit(1);
    if (!project) return null;
    return {
      userId: project.userId,
      projectId: project.id,
      projectName: project.name,
    };
  }

  const rows = await db
    .select({
      projectId: auditLogs.projectId,
      actorUserId: auditLogs.actorUserId,
    })
    .from(auditLogs)
    .where(
      and(
        inArray(auditLogs.entityType, ["cloud_backup"]),
        isNotNull(auditLogs.projectId)
      )
    )
    .orderBy(desc(auditLogs.id))
    .limit(5);

  for (const row of rows) {
    if (row.projectId == null) continue;
    const [project] = await db
      .select({
        id: financeProjects.id,
        userId: financeProjects.userId,
        name: financeProjects.name,
      })
      .from(financeProjects)
      .where(eq(financeProjects.id, row.projectId))
      .limit(1);
    if (project) {
      return {
        userId: project.userId,
        projectId: project.id,
        projectName: project.name,
      };
    }
  }
  return null;
}

async function writeDrillAudit(
  target: DrillTarget | null,
  verdict: RestoreDrillVerdict
): Promise<void> {
  try {
    const actorUserId = target
      ? target.userId
      : await systemActorUserId().catch(() => 0);
    if (!actorUserId) return;
    await logAudit({
      actorUserId,
      projectId: target?.projectId ?? null,
      action: "update",
      entityType: verdict.verified ? "restore_drill" : "restore_drill_failed",
      entityId: target?.projectId ?? null,
      summary: verdict.verified
        ? `Restore drill OK: ${target?.projectName} — ${verdict.fileName} decrypted (${verdict.keyId ?? "no keyId"}), checksum matched the recorded backup, ${verdict.checkedTables ?? 0} tables restored and rolled back`
        : `Restore drill FAILED: ${target?.projectName ?? "no target"} — ${verdict.reason}`,
      newData: {
        provider: verdict.provider ?? null,
        fileName: verdict.fileName ?? null,
        keyId: verdict.keyId ?? null,
        manifestAuditId: verdict.manifestAuditId ?? null,
        checkedTables: verdict.checkedTables ?? null,
        counts: verdict.counts ?? null,
        manifestCounts: verdict.manifestCounts ?? null,
        reason: verdict.reason ?? null,
      },
    });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "[RestoreDrill] failed to record the drill audit row"
    );
  }
}

export async function runScheduledRestoreDrill(
  req: Request,
  res: Response
): Promise<void> {
  if (!(await verifyBackupAuthorization(req))) {
    res.status(403).json({
      success: false,
      verified: false,
      error: "অননুমোদিত ব্যাকআপ অনুরোধ: ক্রন সিক্রেট আবশ্যক",
    });
    return;
  }

  const query = (req.query ?? {}) as Record<string, unknown>;
  try {
    const target = await resolveDrillTarget(query);
    if (!target) {
      const verdict = fail(
        "no backed-up project to drill — run a backup first, or pass ?projectId="
      );
      await writeDrillAudit(null, verdict);
      res.status(200).json({ success: true, ...verdict });
      return;
    }

    const verdict = await runRestoreDrill(target);
    await writeDrillAudit(target, verdict);
    res.status(200).json({
      success: true,
      ...verdict,
      projectId: target.projectId,
      projectName: target.projectName,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      verified: false,
      error: `Restore drill could not run: ${errorMessage(error)}`,
    });
  }
}
