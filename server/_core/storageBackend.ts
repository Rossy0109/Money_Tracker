export type StorageBackend = "vercel-blob" | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
};

/**
 * Selects a storage transport. Only the private Vercel Blob store (via its
 * injected read-write credential) is supported — anything else fails closed.
 * A read-write token embeds the store identity, so a store ID is optional
 * for the SDK path.
 */
export function selectStorageBackend(env: StorageEnvironment): StorageBackend {
  if (env.blobReadWriteToken) return "vercel-blob";

  return "missing";
}
