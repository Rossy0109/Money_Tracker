export async function saveHealthSnapshot(_input: { probeId: string; status: string; latencyMs?: number }): Promise<void> {}

export async function getDriveConnection(_userId: number): Promise<{ revokedAt: Date | null; rootFolderName: string | null; accessToken?: string; refreshToken?: string } | null> {
  return null;
}

export async function lastBackupForKind(
  _userId: number,
  _kind: string
): Promise<{ verifiedAt: Date | null; backupId: string; fileName: string | null; recordCountsJson: string | null } | null> {
  return null;
}

export async function backupStatusSummary(_userId: number): Promise<{ pending: number; failed: number }> {
  return { pending: 0, failed: 0 };
}

export async function countProjectRecords(_userId: number, _projectId: number): Promise<Record<string, number>> {
  return {};
}
