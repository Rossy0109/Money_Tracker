export type StorageBackend = "forge" | "vercel-blob" | "missing";

export type StorageEnvironment = {
  blobStoreId: string;
  blobReadWriteToken: string;
  forgeApiUrl: string;
  forgeApiKey: string;
};

/**
 * Selects a storage transport without permitting a Vercel Blob store to fall
 * back to an unrelated Forge account when its injected Blob credential is
 * unavailable. A read-write token embeds the store identity, so a store ID is
 * optional for the SDK path.
 */
export function selectStorageBackend(env: StorageEnvironment): StorageBackend {
  if (env.blobReadWriteToken) return "vercel-blob";
  if (env.blobStoreId) return "missing";

  return env.forgeApiUrl && env.forgeApiKey ? "forge" : "missing";
}
