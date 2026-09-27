export type StorageBackend = "vercel-blob" | "cloudflare-r2" | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
  r2Bucket?: unknown;
};

/**
 * Selects a storage transport.
 * - Cloudflare R2 binding (Worker path)
 * - Vercel Blob store (Node/Vercel path)
 * - Anything else fails closed.
 */
export function selectStorageBackend(env: StorageEnvironment): StorageBackend {
  if (env.r2Bucket) return "cloudflare-r2";
  if (env.blobReadWriteToken) return "vercel-blob";
  return "missing";
}
