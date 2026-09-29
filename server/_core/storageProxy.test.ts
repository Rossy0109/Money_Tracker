import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./env";
import { supabaseObjectUrl } from "./storageProxy";

const savedUrl = ENV.supabaseUrl;
const savedBucket = ENV.supabaseStorageBucket;

afterEach(() => {
  ENV.supabaseUrl = savedUrl;
  ENV.supabaseStorageBucket = savedBucket;
});

describe("supabaseObjectUrl", () => {
  it("returns null without configuration", () => {
    ENV.supabaseUrl = "";
    ENV.supabaseStorageBucket = "";
    expect(supabaseObjectUrl("backups/a.sql")).toBeNull();
  });

  it("builds a public object URL with encoded segments", () => {
    ENV.supabaseUrl = "https://xyz.supabase.co/";
    ENV.supabaseStorageBucket = "backups";
    expect(supabaseObjectUrl("a/b.sql")).toBe(
      "https://xyz.supabase.co/storage/v1/object/backups/a/b.sql"
    );
    expect(supabaseObjectUrl("dir spaced/f ile.sql")).toBe(
      "https://xyz.supabase.co/storage/v1/object/backups/dir%20spaced/f%20ile.sql"
    );
  });

  it("returns null for empty keys", () => {
    ENV.supabaseUrl = "https://xyz.supabase.co";
    ENV.supabaseStorageBucket = "backups";
    expect(supabaseObjectUrl("")).toBeNull();
    expect(supabaseObjectUrl("///")).toBeNull();
  });
});
