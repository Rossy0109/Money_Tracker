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

export interface BackupLookupResult {
  /** Newest stored object belonging to the target project, when there is one. */
  object: DownloadedBackupObject | null;
  /** Why the lookup came up empty; null whenever `object` is set. */
  miss: string | null;
}

const LIST_PAGE_SIZE = 100;
/** The drill only needs one good object; matching the wrong project's copy
 * (truncated names can collide) is worse than trying a few candidates. */
const MAX_CANDIDATES = 5;

function describeTarget(target: BackupObjectTarget): string {
  return `project ${target.projectId} "${target.projectName}"`;
}

/**
 * Null when the envelope belongs to `target`, otherwise what it actually says.
 * The stored project id is authoritative: a renamed project must still find
 * its own backup, while a name match alone can collide across projects.
 */
function envelopeMismatch(
  payload: string,
  target: BackupObjectTarget
): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return "is not valid JSON";
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.formatVersion !== "finance-encrypted-cloud-backup-v1") {
    return `is not a finance-encrypted-cloud-backup-v1 envelope`;
  }
  const name =
    typeof envelope.projectName === "string" ? envelope.projectName : "?";
  if (typeof envelope.projectId === "number") {
    if (envelope.projectId === target.projectId) return null;
    return `is for project ${envelope.projectId} "${name}"`;
  }
  if (typeof envelope.projectName === "string") {
    if (envelope.projectName === target.projectName) return null;
    return `is for project "${envelope.projectName}"`;
  }
  return "names no project";
}

/**
 * Newest stored backup object for a project. A miss is never silent: it
 * reports how many objects were listed, how many belonged to this prefix and
 * what the downloaded candidates turned out to be, so a red drill in the
 * workflow log says exactly which of those three steps came up empty.
 */
export async function downloadLatestBackupObject(
  target: BackupObjectTarget
): Promise<BackupLookupResult> {
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
  return {
    object: null,
    miss: "no readable backup provider configured — set SUPABASE_URL + SUPABASE_ANON_KEY (Supabase) or the S3 credentials",
  };
}

async function downloadFromSupabase(
  prefix: string,
  target: BackupObjectTarget,
  supabase: { url: string; bucket: string }
): Promise<BackupLookupResult> {
  const storageKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  const headers = {
    Authorization: `Bearer ${storageKey}`,
    apikey: storageKey,
    "Content-Type": "application/json",
  };

  // Supabase's list API treats `prefix` as a *folder* path, so a file-name
  // prefix such as "project-1-backup-" returns nothing at all — the objects
  // sit at the bucket root. List the root (what the prune script does) and
  // match names here instead.
  const listed: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const response = await fetch(
      `${supabase.url}/storage/v1/object/list/${supabase.bucket}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          prefix: "",
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
    const batch = (Array.isArray(page) ? page : [])
      .map(entry => (entry as { name?: unknown }).name)
      .filter((name): name is string => typeof name === "string");
    listed.push(...batch);
    if (!Array.isArray(page) || batch.length < LIST_PAGE_SIZE) break;
  }

  const candidates = listed
    .filter(name => name.startsWith(prefix) && name.endsWith(".enc.json"))
    .sort()
    .reverse();
  if (candidates.length === 0) {
    return {
      object: null,
      miss: `no stored backup object found for ${describeTarget(target)} — ${supabase.bucket} holds ${listed.length} objects, none start with "${prefix}"`,
    };
  }

  const tried = candidates.slice(0, MAX_CANDIDATES);
  let lastMismatch = "";
  for (const fileName of tried) {
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
    const mismatch = envelopeMismatch(payload, target);
    if (!mismatch) {
      return {
        object: {
          provider: "supabase",
          fileName,
          payload,
          downloadedAt: new Date().toISOString(),
        },
        miss: null,
      };
    }
    lastMismatch = `${fileName} ${mismatch}`;
    logger.warn(
      { fileName, projectName: target.projectName, mismatch },
      "[RestoreDrill] Supabase object is not this project's backup — skipped"
    );
  }
  return {
    object: null,
    miss: `no stored backup object found for ${describeTarget(target)} — ${candidates.length} candidates start with "${prefix}" (${tried.length} downloaded), but ${lastMismatch}`,
  };
}

async function downloadFromS3(
  prefix: string,
  target: BackupObjectTarget,
  s3Config: { bucket: string; region: string; endpoint?: string }
): Promise<BackupLookupResult> {
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    return {
      object: null,
      miss: "S3 is configured but S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing",
    };
  }

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
  if (keys.length === 0) {
    return {
      object: null,
      miss: `no stored backup object found for ${describeTarget(target)} — s3://${s3Config.bucket}/backups holds nothing under "${prefix}"`,
    };
  }

  const tried = keys.slice(0, MAX_CANDIDATES);
  let lastMismatch = "";
  for (const key of tried) {
    const got = await s3.send(
      new GetObjectCommand({ Bucket: s3Config.bucket, Key: key })
    );
    const payload = await got.Body?.transformToString("utf8");
    if (!payload) continue;
    const mismatch = envelopeMismatch(payload, target);
    if (!mismatch) {
      return {
        object: {
          provider: "s3",
          fileName: key.replace(/^backups\//, ""),
          payload,
          downloadedAt: new Date().toISOString(),
        },
        miss: null,
      };
    }
    lastMismatch = `${key} ${mismatch}`;
    logger.warn(
      { key, projectName: target.projectName, mismatch },
      "[RestoreDrill] S3 object is not this project's backup — skipped"
    );
  }
  return {
    object: null,
    miss: `no stored backup object found for ${describeTarget(target)} — ${keys.length} candidates under "backups/${prefix}" (${tried.length} downloaded), but ${lastMismatch}`,
  };
}
