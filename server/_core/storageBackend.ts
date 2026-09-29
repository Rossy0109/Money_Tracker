export type StorageBackend =
  | "vercel-blob"
  | "cloudflare-r2"
  | "supabase-storage"
  | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
  r2Bucket?: unknown;
  supabaseUrl?: string;
  supabaseStorageKey?: string;
  supabaseStorageBucket?: string;
};

/** Minimal R2 bucket surface used by private object delivery. */
export interface R2BucketHandle {
  get(
    key: string
  ): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    etag?: string;
    httpMetadata?: { contentType?: string };
  } | null>;
}

let r2Bucket: R2BucketHandle | null = null;

/** Injects the R2 bucket binding (Worker runtime only). */
export function setR2Bucket(bucket: unknown): void {
  r2Bucket = (bucket as R2BucketHandle | undefined) ?? null;
}

export function getR2Bucket(): R2BucketHandle | null {
  return r2Bucket;
}

/**
 * Builds the Supabase Storage REST URL for a private object.
 * Bucket and key segments are percent-encoded; key slashes are preserved.
 */
export function buildSupabaseObjectUrl(
  baseUrl: string,
  bucket: string,
  key: string
): string | null {
  const base = baseUrl.replace(/\/+$/, "");
  if (!base || !bucket || !key) return null;
  const path = key
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  if (!path) return null;
  return `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
}

/**
 * Selects a storage transport.
 * - Cloudflare R2 binding (Worker path, only if the binding exists)
 * - Vercel Blob store (Node/Vercel path — checked before Supabase so existing
 *   Blob objects keep resolving on Vercel, which also sets SUPABASE_*)
 * - Supabase Storage (Worker path: R2 unavailable, no Blob token)
 * - Anything else fails closed.
 */
export function selectStorageBackend(env: StorageEnvironment): StorageBackend {
  if (env.r2Bucket) return "cloudflare-r2";
  if (env.blobReadWriteToken) return "vercel-blob";
  if (
    env.supabaseUrl &&
    env.supabaseStorageKey &&
    env.supabaseStorageBucket
  ) {
    return "supabase-storage";
  }
  return "missing";
}
