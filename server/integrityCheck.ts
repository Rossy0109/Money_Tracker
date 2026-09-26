import { countProjectRecords, lastBackupForKind } from "./backupDb";
import { listProjects } from "./db";

export interface IntegrityDiff {
  entity: string;
  live: number;
  manifest: number;
}

export interface IntegrityResult {
  projectId: number;
  projectName: string;
  checkedAt: string;
  status: "VERIFIED" | "MISMATCH" | "NO_BACKUP";
  lastBackup: {
    backupId: string;
    fileName: string | null;
    verifiedAt: Date | null;
  } | null;
  liveCounts: Record<string, number>;
  manifestCounts: Record<string, number> | null;
  diffs: IntegrityDiff[];
  missing: string[];
}

export async function runIntegrityCheck(
  userId: number,
  projectId: number
): Promise<IntegrityResult> {
  const liveCounts = await countProjectRecords(userId, projectId);
  const projects = await listProjects(userId);
  const project = projects.find(entry => entry.id === projectId);
  const lastBackup = await lastBackupForKind(userId, "database");
  const base: IntegrityResult = {
    projectId,
    projectName: project?.name ?? `#${projectId}`,
    checkedAt: new Date().toISOString(),
    status: "NO_BACKUP",
    lastBackup: lastBackup
      ? {
          backupId: lastBackup.backupId,
          fileName: lastBackup.fileName,
          verifiedAt: lastBackup.verifiedAt,
        }
      : null,
    liveCounts,
    manifestCounts: null,
    diffs: [],
    missing: [],
  };

  if (!lastBackup || !lastBackup.recordCountsJson) {
    return base;
  }

  let manifestCounts: Record<string, number>;
  try {
    manifestCounts = JSON.parse(lastBackup.recordCountsJson);
  } catch {
    return { ...base, status: "MISMATCH", manifestCounts: null };
  }

  const diffs: IntegrityDiff[] = [];
  const missing: string[] = [];
  const entities = new Set([
    ...Object.keys(liveCounts),
    ...Object.keys(manifestCounts),
  ]);
  for (const entity of entities) {
    const live = Number(liveCounts[entity] ?? 0);
    const manifest = Number(manifestCounts[entity] ?? 0);
    if (live !== manifest) {
      diffs.push({ entity, live, manifest });
      if (!(entity in liveCounts)) missing.push(entity);
    }
  }

  return {
    ...base,
    status: diffs.length ? "MISMATCH" : "VERIFIED",
    manifestCounts,
    diffs,
    missing,
  };
}
