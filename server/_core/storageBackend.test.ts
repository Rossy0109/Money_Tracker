import { describe, expect, it } from "vitest";
import { selectStorageBackend } from "./storageBackend";

const forgeEnvironment = {
  blobStoreId: "",
  blobReadWriteToken: "",
  forgeApiUrl: "https://forge.example.test",
  forgeApiKey: "forge-key",
};

describe("selectStorageBackend", () => {
  it("preserves the existing Forge fallback outside Vercel Blob deployments", () => {
    expect(selectStorageBackend(forgeEnvironment)).toBe("forge");
  });

  it("uses private Vercel Blob with Vercel's injected Blob credential", () => {
    expect(
      selectStorageBackend({
        ...forgeEnvironment,
        blobReadWriteToken: "configured-private-blob-credential",
      }),
    ).toBe("vercel-blob");
  });

  it("fails closed rather than falling back to Forge when a configured Blob store lacks its credential", () => {
    expect(
      selectStorageBackend({ ...forgeEnvironment, blobStoreId: "store_staging" }),
    ).toBe("missing");
  });
});
