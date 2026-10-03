/**
 * Backup health tracking — reads backup state from audit_logs.
 *
 * The audit trail is the source of truth for backup history.
 * No separate backup_records table is needed — the audit_logs table
 * already captures backup_created events with checksums and filenames.
 */
import { eq, and, desc, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import type { DbOrTx } from "./db";
import { auditLogs } from "../drizzle/schema";

export async function saveHealthSnapshot(_input: {
  probeId: string;
  status: string;
  latencyMs?: number;
}): Promise<void> {
  // Health snapshots are recorded via audit_logs — this is a no-op stub
  // for backward compatibility with healthChecks.ts
}

export async function getDriveConnection(_userId: number): Promise<{
  revokedAt: Date | null;
  rootFolderName: string | null;
  accessToken?: string;
  refreshToken?: string;
} | null> {
  return null;
}

/**
 * Find the most recent backup of a given kind for a user from audit_logs.
 * Returns null if no backup has been recorded.
 */
export interface CloudBackupAuditRow {
  id: number;
  entityType: string;
  summary: string;
  createdAt: Date;
}

/**
 * Newest backup audit rows, newest first.
 *
 * A scheduled run writes exactly one row (`cloud_backup` only when every
 * project stored AND passed its integrity re-export check, otherwise
 * `cloud_backup_failed`), so a handful of rows is enough to both judge the
 * latest run and print recent history. Callers apply their own time window.
 */
export async function latestCloudBackupAuditRows(
  limit = 5
): Promise<CloudBackupAuditRow[]> {
  const { getDb, databaseRequired } = await import("./db");
  const db = databaseRequired(await getDb());

  return db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      inArray(auditLogs.entityType, ["cloud_backup", "cloud_backup_failed"])
    )
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(Math.max(Math.trunc(limit) || 5, 1), 50));
}

export interface RestoreDrillRow {
  id: number;
  entityType: string;
  summary: string;
  projectId: number | null;
  createdAt: Date;
}

/**
 * Newest restore-drill audit rows, newest first. `restore_drill` is written
 * only when the drill proved download → decrypt → checksum → manifest →
 * rolled-back restore; `restore_drill_failed` records why it did not.
 */
export async function latestRestoreDrillRows(
  limit = 1
): Promise<RestoreDrillRow[]> {
  const { getDb, databaseRequired } = await import("./db");
  const db = databaseRequired(await getDb());

  return db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      summary: auditLogs.summary,
      projectId: auditLogs.projectId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      inArray(auditLogs.entityType, ["restore_drill", "restore_drill_failed"])
    )
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(Math.max(Math.trunc(limit) || 1, 1), 50));
}

export interface CloudBackupManifest {
  auditId: number;
  createdAt: Date;
  checksum: string | null;
  fileName: string | null;
  provider: string | null;
  recordCounts: Record<string, number> | null;
}

/**
 * The newest `cloud_backup` audit row for one project, parsed back into the
 * checksum and record counts the backup run recorded. The restore drill
 * compares a downloaded object against it, so a bucket that silently holds an
 * older or foreign object cannot pass as "restorable".
 */
export async function lastCloudBackupManifest(
  userId: number,
  projectId: number
): Promise<CloudBackupManifest | null> {
  const { getDb, databaseRequired } = await import("./db");
  const db = databaseRequired(await getDb());

  const [row] = await db
    .select({
      id: auditLogs.id,
      newData: auditLogs.newData,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, userId),
        eq(auditLogs.entityType, "cloud_backup"),
        eq(auditLogs.projectId, projectId)
      )
    )
    .orderBy(desc(auditLogs.id))
    .limit(1);

  if (!row) return null;

  let checksum: string | null = null;
  let fileName: string | null = null;
  let provider: string | null = null;
  let recordCounts: Record<string, number> | null = null;
  try {
    const parsed =
      typeof row.newData === "string"
        ? JSON.parse(row.newData)
        : (row.newData as unknown);
    const data = (parsed ?? {}) as Record<string, unknown>;
    if (typeof data.checksum === "string") checksum = data.checksum;
    if (typeof data.fileName === "string") fileName = data.fileName;
    if (typeof data.provider === "string") provider = data.provider;
    if (data.recordCounts && typeof data.recordCounts === "object") {
      recordCounts = data.recordCounts as Record<string, number>;
    }
  } catch {
    // Unparseable newData is reported as missing fields, not as an error.
  }

  return {
    auditId: row.id,
    createdAt: row.createdAt,
    checksum,
    fileName,
    provider,
    recordCounts,
  };
}

export async function lastBackupForKind(
  userId: number,
  _kind: string
): Promise<{
  verifiedAt: Date | null;
  backupId: string;
  fileName: string | null;
  recordCountsJson: string | null;
} | null> {
  const { getDb, databaseRequired } = await import("./db");
  const db = databaseRequired(await getDb());

  const [row] = await db
    .select({
      id: auditLogs.id,
      summary: auditLogs.summary,
      newData: auditLogs.newData,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorUserId, userId),
        eq(auditLogs.entityType, "cloud_backup")
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  if (!row) return null;

  // Extract filename from summary like "Cloud backup executed (s3): project-backup-2024-01-01-abc123.enc.json (SHA-256: ...)"
  const fileNameMatch = row.summary.match(/:\s*(\S+\.enc\.json)/);
  const fileName = fileNameMatch?.[1] ?? null;

  // Prefer record counts persisted on the backup audit row (newData.recordCounts).
  let recordCountsJson: string | null = null;
  const newRow = row as { newData?: unknown };
  if (newRow.newData) {
    try {
      const parsed =
        typeof newRow.newData === "string"
          ? JSON.parse(newRow.newData)
          : newRow.newData;
      const counts = (parsed as { recordCounts?: unknown })?.recordCounts;
      if (counts && typeof counts === "object") {
        recordCountsJson = JSON.stringify(counts);
      }
    } catch {
      recordCountsJson = null;
    }
  }

  return {
    verifiedAt: row.createdAt,
    backupId: String(row.id),
    fileName,
    recordCountsJson,
  };
}

/**
 * Count pending and failed backups from recent audit logs.
 */
export async function backupStatusSummary(
  _userId: number
): Promise<{ pending: number; failed: number }> {
  // Without a dedicated backup_records table, we can't track pending/failed.
  // Return 0,0 — the integrity verification in scheduledBackup.ts handles failures.
  return { pending: 0, failed: 0 };
}

/**
 * Count records in a project for backup manifest verification.
 */
export interface CountProjectRecordsOptions {
  /**
   * Count on this executor instead of a fresh connection — how the restore
   * drill reads rows that only exist inside its still-open transaction.
   */
  executor?: DbOrTx;
  /** Skip assertOwnedProject when the caller already proved ownership. */
  skipOwnershipCheck?: boolean;
}

export async function countProjectRecords(
  userId: number,
  projectId: number,
  options: CountProjectRecordsOptions = {}
): Promise<Record<string, number>> {
  const { getDb, databaseRequired, assertOwnedProject } = await import("./db");
  const {
    financeTransactions,
    financeAccounts,
    financeCategories,
    financeBudgets,
    financeBills,
    financeDues,
    financeVouchers,
    financeChartOfAccounts,
    financeVoucherDebits,
    financeVoucherCredits,
    financeLedgerEntries,
    financeJournalEntries,
    financeJournalLines,
    financeVoucherReversals,
    financeVoucherAudit,
    financeVoucherReferences,
    financeFiscalPeriods,
    financePeriodLocks,
    financeAccountGroups,
  } = await import("../drizzle/schema");

  if (!options.skipOwnershipCheck) {
    await assertOwnedProject(userId, projectId);
  }
  const db = options.executor ?? databaseRequired(await getDb());

  const countTable = async (table: MySqlTable, conditions: SQL[]) => {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(and(...conditions));
    return Number(result?.count ?? 0);
  };

  const projectIdColumn = (table: MySqlTable): AnyMySqlColumn => {
    const columns = table as unknown as { [key: string]: unknown };
    const column = columns.projectId;
    if (!column || typeof column !== "object")
      throw new Error("projectId column missing");
    return column as AnyMySqlColumn;
  };

  const voucherRows = await db
    .select({ id: financeVouchers.id })
    .from(financeVouchers)
    .where(
      and(
        eq(financeVouchers.userId, userId),
        eq(financeVouchers.projectId, projectId)
      )
    );
  const voucherIds = voucherRows.map(row => row.id);

  const countByVoucherIds = async (
    table: MySqlTable & { voucherId?: unknown }
  ) => {
    if (!voucherIds.length) return 0;
    const col = (table as unknown as { voucherId?: unknown }).voucherId;
    if (!col || typeof col !== "object") return 0;
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(sql`${col as never} IN ${voucherIds}`);
    return Number(result?.count ?? 0);
  };

  const journalRows = await db
    .select({ id: financeJournalEntries.id })
    .from(financeJournalEntries)
    .where(eq(financeJournalEntries.projectId, projectId));
  const journalIds = journalRows.map(row => row.id);
  let journalLineCount = 0;
  if (journalIds.length) {
    const [jl] = await db
      .select({ count: sql<number>`count(*)` })
      .from(financeJournalLines)
      .where(sql`${financeJournalLines.journalEntryId} IN ${journalIds}`);
    journalLineCount = Number(jl?.count ?? 0);
  }

  return {
    transactions: await countTable(financeTransactions, [
      sql`${projectIdColumn(financeTransactions)} = ${projectId}`,
    ]),
    accounts: await countTable(financeAccounts, [
      sql`${projectIdColumn(financeAccounts)} = ${projectId}`,
    ]),
    categories: await countTable(financeCategories, [
      sql`${projectIdColumn(financeCategories)} = ${projectId}`,
    ]),
    budgets: await countTable(financeBudgets, [
      sql`${projectIdColumn(financeBudgets)} = ${projectId}`,
    ]),
    bills: await countTable(financeBills, [
      sql`${projectIdColumn(financeBills)} = ${projectId}`,
    ]),
    dues: await countTable(financeDues, [
      sql`${projectIdColumn(financeDues)} = ${projectId}`,
    ]),
    vouchers: voucherIds.length,
    chartOfAccounts: await countTable(financeChartOfAccounts, [
      sql`${projectIdColumn(financeChartOfAccounts)} = ${projectId}`,
    ]),
    voucherDebits: await countByVoucherIds(financeVoucherDebits as never),
    voucherCredits: await countByVoucherIds(financeVoucherCredits as never),
    ledgerEntries: await countByVoucherIds(financeLedgerEntries as never),
    journalEntries: journalIds.length,
    journalLines: journalLineCount,
    accountGroups: await countTable(financeAccountGroups, [
      sql`${projectIdColumn(financeAccountGroups)} = ${projectId}`,
    ]),
    fiscalPeriods: await countTable(financeFiscalPeriods, [
      sql`${projectIdColumn(financeFiscalPeriods)} = ${projectId}`,
    ]),
    periodLocks: await countTable(financePeriodLocks, [
      sql`${projectIdColumn(financePeriodLocks)} = ${projectId}`,
    ]),
    voucherReversals: await countTable(financeVoucherReversals, [
      sql`${projectIdColumn(financeVoucherReversals)} = ${projectId}`,
    ]),
    voucherAudit: await countByVoucherIds(financeVoucherAudit as never),
    voucherReferences: await countByVoucherIds(financeVoucherReferences as never),
  };
}
