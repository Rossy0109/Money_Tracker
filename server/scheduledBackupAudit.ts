/**
 * Read-only proof that the scheduled backup really stored its payload.
 *
 * The backup endpoint can answer HTTP 200 while individual uploads fail —
 * upload errors are counted, never thrown — and its counts alone do not prove
 * the run was recorded in the database. executeScheduledBackup() always writes
 * exactly one audit_logs row: `cloud_backup` only when every project stored AND
 * passed its integrity re-export check, otherwise `cloud_backup_failed`.
 *
 * This endpoint reads those rows back and returns a verdict so the daily
 * workflow can fail loudly without holding production database credentials in
 * GitHub Actions (they only ever need the cron secret, which this shares with
 * the backup trigger).
 */
import type { Request, Response } from "express";
import {
  latestCloudBackupAuditRows,
  type CloudBackupAuditRow,
} from "./backupDb";
import { verifyBackupAuthorization } from "./scheduledBackup";

const DEFAULT_WINDOW_MINUTES = 30;
const MAX_WINDOW_MINUTES = 1440;

export interface BackupSummaryCounts {
  projects: number;
  stored: number;
  verified: number;
  failed: number;
}

export interface BackupAuditVerdict {
  verified: boolean;
  reason?: string;
  counts: BackupSummaryCounts | null;
  audit: CloudBackupAuditRow | null;
}

export type { CloudBackupAuditRow };

/** Parse "…: 3 projects, 3 stored, 3 verified, 0 failed integrity". */
export function parseBackupSummaryCounts(
  summary: string | null | undefined
): BackupSummaryCounts | null {
  const match =
    /(\d+) projects?, (\d+) stored, (\d+) verified, (\d+) failed integrity/.exec(
      summary ?? ""
    );
  if (!match) return null;
  return {
    projects: Number(match[1]),
    stored: Number(match[2]),
    verified: Number(match[3]),
    failed: Number(match[4]),
  };
}

/**
 * Judge the newest backup audit row. Pure so it can be unit-tested without a
 * database: `rows` must be newest-first.
 */
export function verifyBackupAuditRow(
  rows: CloudBackupAuditRow[],
  windowMinutes: number,
  now: Date = new Date()
): BackupAuditVerdict {
  const audit = rows[0] ?? null;
  if (!audit) {
    return {
      verified: false,
      reason: "no backup audit row exists — no run has ever been recorded",
      counts: null,
      audit: null,
    };
  }

  const createdAt =
    audit.createdAt instanceof Date
      ? audit.createdAt
      : new Date(audit.createdAt as unknown as string);
  const ageMs = now.getTime() - createdAt.getTime();
  // Only "too old" fails: a row a little in the future is clock skew between
  // the app and the database, not a missing run.
  if (ageMs > windowMinutes * 60_000) {
    return {
      verified: false,
      reason:
        `newest backup audit row #${audit.id} is older than the ` +
        `${windowMinutes}-minute window — the trigger did not record a run`,
      counts: null,
      audit,
    };
  }

  if (audit.entityType !== "cloud_backup") {
    return {
      verified: false,
      reason: `newest audit row #${audit.id} is ${audit.entityType}: ${audit.summary}`,
      counts: null,
      audit,
    };
  }

  const counts = parseBackupSummaryCounts(audit.summary);
  if (!counts) {
    return {
      verified: false,
      reason: `cannot parse backup summary: ${audit.summary}`,
      counts: null,
      audit,
    };
  }
  if (counts.projects < 1) {
    return {
      verified: false,
      reason: `no projects were backed up — active users or projects missing: ${audit.summary}`,
      counts,
      audit,
    };
  }
  if (
    counts.stored !== counts.projects ||
    counts.verified !== counts.projects ||
    counts.failed !== 0
  ) {
    return {
      verified: false,
      reason: `incomplete backup (stored/verified must equal projects): ${audit.summary}`,
      counts,
      audit,
    };
  }

  return { verified: true, counts, audit };
}

function clampWindowMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_WINDOW_MINUTES;
  return Math.min(parsed, MAX_WINDOW_MINUTES);
}

function serializeRow(row: CloudBackupAuditRow) {
  return {
    id: row.id,
    entityType: row.entityType,
    summary: row.summary,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

export async function runScheduledBackupAudit(
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
  const windowMinutes = clampWindowMinutes(
    query.windowMinutes ?? process.env.VERIFY_WINDOW_MINUTES
  );

  try {
    const rows = await latestCloudBackupAuditRows(5);
    const verdict = verifyBackupAuditRow(rows, windowMinutes);
    res.status(200).json({
      success: true,
      verified: verdict.verified,
      reason: verdict.reason,
      windowMinutes,
      audit: verdict.audit ? serializeRow(verdict.audit) : null,
      counts: verdict.counts,
      history: rows.map(serializeRow),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      verified: false,
      error: `Cannot read backup audit trail: ${
        error instanceof Error ? error.message : String(error)
      }`,
      windowMinutes,
    });
  }
}
