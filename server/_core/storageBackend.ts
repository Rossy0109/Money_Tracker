export type StorageBackend =
  | "vercel-blob"
  | "supabase-storage"
  | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
  supabaseUrl?: string;
  supabaseStorageKey?: string;
  supabaseStorageBucket?: string;
};

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
 * - Vercel Blob store (Node/Vercel path — checked before Supabase so existing
 *   Blob objects keep resolving on Vercel, which also sets SUPABASE_*)
 * - Supabase Storage (fallback for private objects when Blob is not configured)
 * - Anything else fails closed.
 */
export function selectStorageBackend(env: StorageEnvironment): StorageBackend {
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
