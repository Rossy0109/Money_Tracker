import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import logger from "./_core/logger";
import {
  getCloudStorageConfig,
  safeBackupProjectName,
} from "./cloudBackupService";

/**
 * Download side of the cloud backup.
 *
 * Uploads have always been one-way; the weekly restore drill needs the stored
 * object back to prove that what the bucket holds really decrypts, checksums
 * and restores. Only the two providers that are readable by this server are
 * supported (Supabase Storage REST and S3-compatible object storage) — Google
 * Drive goes out through a webhook and local snapshots are plain files.
 */
export interface DownloadedBackupObject {
  provider: "supabase" | "s3";
  fileName: string;
  /** Raw `.enc.json` envelope, exactly as stored. */
  payload: string;
  downloadedAt: string;
}

export interface BackupObjectTarget {
  projectName: string;
  projectId: number;
}

const LIST_PAGE_SIZE = 100;
/** The drill only needs one good object; matching the wrong project's copy
 * (truncated names can collide) is worse than trying a few candidates. */
const MAX_CANDIDATES = 5;

function envelopeMatchesProject(
  payload: string,
  target: BackupObjectTarget
): boolean {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.formatVersion !== "finance-encrypted-cloud-backup-v1") {
      return false;
    }
    if (typeof parsed.projectName === "string") {
      return parsed.projectName === target.projectName;
    }
    if (typeof parsed.projectId === "number") {
      return parsed.projectId === target.projectId;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Newest stored backup object for a project, or null when the configured
 * provider holds nothing for it (including "no readable provider configured").
 */
export async function downloadLatestBackupObject(
  target: BackupObjectTarget
): Promise<DownloadedBackupObject | null> {
  const config = getCloudStorageConfig();
  const prefix = `${safeBackupProjectName(
    target.projectName,
    target.projectId
  )}-backup-`;

  if (config.supabase?.enabled) {
    return downloadFromSupabase(prefix, target, config.supabase);
  }
  if (config.s3?.enabled) {
    return downloadFromS3(prefix, target, config.s3);
  }
  return null;
}

async function downloadFromSupabase(
  prefix: string,
  target: BackupObjectTarget,
  supabase: { url: string; bucket: string }
): Promise<DownloadedBackupObject | null> {
  const storageKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const headers = {
    Authorization: `Bearer ${storageKey}`,
    apikey: storageKey,
    "Content-Type": "application/json",
  };

  // Page through every object under the prefix, newest name last.
  const names: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const response = await fetch(
      `${supabase.url}/storage/v1/object/list/${supabase.bucket}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          prefix,
          limit: LIST_PAGE_SIZE,
          offset,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Supabase listing failed (${response.status} ${(await response.text()).slice(0, 200)})`
      );
    }
    const page: unknown = await response.json();
    const batch = (Array.isArray(page) ? page : []).map(
      entry => (entry as { name?: unknown }).name
    );
    for (const name of batch) {
      if (typeof name === "string" && name.endsWith(".enc.json"))
        names.push(name);
    }
    if (!Array.isArray(page) || batch.length < LIST_PAGE_SIZE) break;
  }

  names.sort().reverse();
  for (const fileName of names.slice(0, MAX_CANDIDATES)) {
    const response = await fetch(
      `${supabase.url}/storage/v1/object/${supabase.bucket}/${encodeURIComponent(fileName)}`,
      { headers }
    );
    if (!response.ok) {
      throw new Error(
        `Supabase download of ${fileName} failed (${response.status})`
      );
    }
    const payload = await response.text();
    if (envelopeMatchesProject(payload, target)) {
      return {
        provider: "supabase",
        fileName,
        payload,
        downloadedAt: new Date().toISOString(),
      };
    }
    logger.warn(
      { fileName, projectName: target.projectName },
      "[RestoreDrill] Supabase object is not this project's backup — skipped"
    );
  }
  return null;
}

async function downloadFromS3(
  prefix: string,
  target: BackupObjectTarget,
  s3Config: { bucket: string; region: string; endpoint?: string }
): Promise<DownloadedBackupObject | null> {
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;

  const s3 = new S3Client({
    region: s3Config.region || "us-east-1",
    endpoint: s3Config.endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: s3Config.bucket,
      Prefix: `backups/${prefix}`,
      MaxKeys: LIST_PAGE_SIZE,
    })
  );
  const keys = (listed.Contents ?? [])
    .map(entry => entry.Key)
    .filter(
      (key): key is string =>
        typeof key === "string" && key.endsWith(".enc.json")
    )
    .sort()
    .reverse();

  for (const key of keys.slice(0, MAX_CANDIDATES)) {
    const got = await s3.send(
      new GetObjectCommand({ Bucket: s3Config.bucket, Key: key })
    );
    const payload = await got.Body?.transformToString("utf8");
    if (!payload) continue;
    if (envelopeMatchesProject(payload, target)) {
      return {
        provider: "s3",
        fileName: key.replace(/^backups\//, ""),
        payload,
        downloadedAt: new Date().toISOString(),
      };
    }
    logger.warn(
      { key, projectName: target.projectName },
      "[RestoreDrill] S3 object is not this project's backup — skipped"
    );
  }
  return null;
}
