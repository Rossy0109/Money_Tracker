import { describe, expect, it } from "vitest";
import { buildSupabaseObjectUrl, selectStorageBackend } from "./storageBackend";

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
      })
    ).toBe("vercel-blob");
  });

  it("fails closed when a configured Blob store lacks its credential", () => {
    expect(
      selectStorageBackend({ ...baseEnvironment, blobStoreId: "store_staging" })
    ).toBe("missing");
  });

  it("uses Supabase Storage when URL, key and bucket are configured", () => {
    expect(
      selectStorageBackend({
        ...baseEnvironment,
        supabaseUrl: "https://project.supabase.co",
        supabaseStorageKey: "sb_secret_example",
        supabaseStorageBucket: "amar-hisab-files",
      })
    ).toBe("supabase-storage");
  });

  it("keeps Vercel Blob ahead of Supabase so existing objects stay resolvable", () => {
    expect(
      selectStorageBackend({
        ...baseEnvironment,
        blobReadWriteToken: "configured-private-blob-credential",
        supabaseUrl: "https://project.supabase.co",
        supabaseStorageKey: "sb_secret_example",
        supabaseStorageBucket: "amar-hisab-files",
      })
    ).toBe("vercel-blob");
  });

  it("fails closed when Supabase storage is only partially configured", () => {
    expect(
      selectStorageBackend({
        ...baseEnvironment,
        supabaseUrl: "https://project.supabase.co",
        supabaseStorageBucket: "amar-hisab-files",
      })
    ).toBe("missing");
  });

  it("prefers an R2 binding over every HTTP backend", () => {
    expect(
      selectStorageBackend({
        ...baseEnvironment,
        blobReadWriteToken: "configured-private-blob-credential",
        supabaseUrl: "https://project.supabase.co",
        supabaseStorageKey: "sb_secret_example",
        supabaseStorageBucket: "amar-hisab-files",
        r2Bucket: {},
      })
    ).toBe("cloudflare-r2");
  });
});

describe("buildSupabaseObjectUrl", () => {
  it("keeps key path separators and strips a trailing slash from the base", () => {
    expect(
      buildSupabaseObjectUrl(
        "https://project.supabase.co/",
        "amar-hisab-files",
        "projects/42/receipt.png"
      )
    ).toBe(
      "https://project.supabase.co/storage/v1/object/amar-hisab-files/projects/42/receipt.png"
    );
  });

  it("percent-encodes bucket and key segments", () => {
    expect(
      buildSupabaseObjectUrl(
        "https://project.supabase.co",
        "amar hisab",
        "house hold/মাস জুলাই/invoice #1.pdf"
      )
    ).toBe(
      "https://project.supabase.co/storage/v1/object/amar%20hisab/house%20hold/%E0%A6%AE%E0%A6%BE%E0%A6%B8%20%E0%A6%9C%E0%A7%81%E0%A6%B2%E0%A6%BE%E0%A6%87/invoice%20%231.pdf"
    );
  });

  it("fails closed on missing base, bucket or key", () => {
    expect(buildSupabaseObjectUrl("", "bucket", "key")).toBeNull();
    expect(buildSupabaseObjectUrl("https://p.supabase.co", "", "key")).toBeNull();
    expect(buildSupabaseObjectUrl("https://p.supabase.co", "bucket", "")).toBeNull();
    expect(
      buildSupabaseObjectUrl("https://p.supabase.co", "bucket", "///")
    ).toBeNull();
  });
});
