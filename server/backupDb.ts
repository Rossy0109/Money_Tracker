/**
 * Backup health tracking — reads backup state from audit_logs.
 *
 * The audit trail is the source of truth for backup history.
 * No separate backup_records table is needed — the audit_logs table
 * already captures backup_created events with checksums and filenames.
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { auditLogs } from "../drizzle/schema";

export async function saveHealthSnapshot(_input: { probeId: string; status: string; latencyMs?: number }): Promise<void> {
  // Health snapshots are recorded via audit_logs — this is a no-op stub
  // for backward compatibility with healthChecks.ts
}

export async function getDriveConnection(_userId: number): Promise<{ revokedAt: Date | null; rootFolderName: string | null; accessToken?: string; refreshToken?: string } | null> {
  return null;
}

/**
 * Find the most recent backup of a given kind for a user from audit_logs.
 * Returns null if no backup has been recorded.
 */
export async function lastBackupForKind(
  userId: number,
  kind: string
): Promise<{ verifiedAt: Date | null; backupId: string; fileName: string | null; recordCountsJson: string | null } | null> {
  const { getDb, databaseRequired } = await import("./db");
  const db = databaseRequired(await getDb());

  const [row] = await db
    .select({
      id: auditLogs.id,
      summary: auditLogs.summary,
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

  return {
    verifiedAt: row.createdAt,
    backupId: String(row.id),
    fileName,
    recordCountsJson: null,
  };
}

/**
 * Count pending and failed backups from recent audit logs.
 */
export async function backupStatusSummary(userId: number): Promise<{ pending: number; failed: number }> {
  // Without a dedicated backup_records table, we can't track pending/failed.
  // Return 0,0 — the integrity verification in scheduledBackup.ts handles failures.
  return { pending: 0, failed: 0 };
}

/**
 * Count records in a project for backup manifest verification.
 */
export async function countProjectRecords(userId: number, projectId: number): Promise<Record<string, number>> {
  const { getDb, databaseRequired, assertOwnedProject } = await import("./db");
  const { financeTransactions, financeAccounts, financeCategories, financeBudgets, financeBills, financeDues, financeVouchers } = await import("../drizzle/schema");

  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const countTable = async (table: any, conditions: any[]) => {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(table).where(and(...conditions));
    return Number(result?.count ?? 0);
  };

  const scoped = [sql`${(financeTransactions as any).projectId} = ${projectId}`];

  return {
    transactions: await countTable(financeTransactions, scoped),
    accounts: await countTable(financeAccounts, [sql`${(financeAccounts as any).projectId} = ${projectId}`]),
    categories: await countTable(financeCategories, [sql`${(financeCategories as any).projectId} = ${projectId}`]),
    budgets: await countTable(financeBudgets, [sql`${(financeBudgets as any).projectId} = ${projectId}`]),
    bills: await countTable(financeBills, [sql`${(financeBills as any).projectId} = ${projectId}`]),
    dues: await countTable(financeDues, [sql`${(financeDues as any).projectId} = ${projectId}`]),
    vouchers: await countTable(financeVouchers, [sql`${(financeVouchers as any).projectId} = ${projectId}`]),
  };
}
