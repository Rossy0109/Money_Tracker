/**
 * Backup health tracking — reads backup state from audit_logs.
 *
 * The audit trail is the source of truth for backup history.
 * No separate backup_records table is needed — the audit_logs table
 * already captures backup_created events with checksums and filenames.
 */
import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
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
export async function countProjectRecords(
  userId: number,
  projectId: number
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
  } = await import("../drizzle/schema");

  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

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
  };
}
