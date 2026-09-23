import { describe, expect, it } from "vitest";
import { selectStorageBackend } from "./storageBackend";

const baseEnvironment = {
  blobStoreId: "",
  blobReadWriteToken: "",
};

describe("selectStorageBackend", () => {
  it("reports missing when no Blob credential is configured", () => {
    expect(selectStorageBackend(baseEnvironment)).toBe("missing");
  });

  it("uses private Vercel Blob with Vercel's injected Blob credential", () => {
    expect(
      selectStorageBackend({
        ...baseEnvironment,
        blobReadWriteToken: "configured-private-blob-credential",
      }),
    ).toBe("vercel-blob");
  });

  it("fails closed when a configured Blob store lacks its credential", () => {
    expect(
      selectStorageBackend({ ...baseEnvironment, blobStoreId: "store_staging" }),
    ).toBe("missing");
  });
});
