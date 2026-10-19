import { randomBytesHex } from "../../shared/platform/crypto";

/**
 * Minimal Google Drive v3 client for the backup flow: locate/create the
 * app-owned folder and upload an encrypted snapshot. Only `drive.file` scope is
 * used, so every call sees just the files this app created.
 */
const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/drive/v3/files";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

type FetchLike = typeof fetch;

export interface DriveFileRef {
  id: string;
}

function requireToken(token: string) {
  if (!token) throw new Error("Google Drive access token is required");
}

/** Escape a value for a Drive `q` string literal (single-quoted). */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Find the first non-trashed file with an exact name (optionally scoped to a
 * parent folder and MIME type). Returns null when none exists.
 */
export async function findDriveFileByName(
  token: string,
  name: string,
  parentId: string | null,
  mimeType?: string,
  fetchImpl: FetchLike = fetch
): Promise<DriveFileRef | null> {
  requireToken(token);
  const clauses = [`name = '${escapeQueryValue(name)}'`, "trashed = false"];
  if (mimeType) clauses.push(`mimeType = '${escapeQueryValue(mimeType)}'`);
  if (parentId) clauses.push(`'${escapeQueryValue(parentId)}' in parents`);
  const url = new URL(DRIVE_FILES_ENDPOINT);
  url.searchParams.set("q", clauses.join(" and "));
  url.searchParams.set("fields", "files(id,name,mimeType)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("spaces", "drive");

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: authHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Google Drive list failed (${response.status})`);
  }
  const data = (await response.json()) as { files?: Array<{ id?: unknown }> };
  const first = data.files?.[0];
  if (!first || typeof first.id !== "string" || !first.id) return null;
  return { id: first.id };
}

/**
 * Return the id of the app-owned folder `name`, creating it (under `parentId`
 * when given) if it does not exist yet.
 */
export async function ensureDriveFolder(
  token: string,
  name: string,
  parentId: string | null = null,
  fetchImpl: FetchLike = fetch
): Promise<DriveFileRef> {
  requireToken(token);
  const existing = await findDriveFileByName(
    token,
    name,
    parentId,
    DRIVE_FOLDER_MIME,
    fetchImpl
  );
  if (existing) return existing;

  const url = new URL(DRIVE_FILES_ENDPOINT);
  url.searchParams.set("fields", "id");
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Google Drive folder create failed (${response.status})`);
  }
  const data = (await response.json()) as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) {
    throw new Error("Google Drive folder create returned no id");
  }
  return { id: data.id };
}

export interface UploadDriveFileInput {
  folderId?: string | null;
  name: string;
  content: string;
  mimeType?: string;
}

/**
 * Upload `content` as a new file using a `multipart/related` request with
 * metadata + media in one round trip.
 */
export async function uploadDriveFile(
  token: string,
  input: UploadDriveFileInput,
  fetchImpl: FetchLike = fetch
): Promise<DriveFileRef> {
  requireToken(token);
  const boundary = `mt_boundary_${randomBytesHex(16)}`;
  const metadata = JSON.stringify({
    name: input.name,
    ...(input.folderId ? { parents: [input.folderId] } : {}),
  });
  const contentType = input.mimeType || "application/json";
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n` +
    `${input.content}\r\n` +
    `--${boundary}--`;

  const url = new URL(DRIVE_UPLOAD_ENDPOINT);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id");
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Google Drive upload failed (${response.status})`);
  }
  const data = (await response.json()) as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) {
    throw new Error("Google Drive upload returned no id");
  }
  return { id: data.id };
}
