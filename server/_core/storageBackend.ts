export type StorageBackend = "vercel-blob" | "cloudflare-r2" | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
  r2Bucket?: unknown;
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
