import { describe, it, expect } from "vitest";
import {
  parseSupabaseConfig,
  mapSupabaseUserToPrincipal,
  buildSupabaseSignedStorageUrl,
} from "./supabaseAdapter";

describe("Supabase Staging Adapter", () => {
  it("returns null when configuration is missing", () => {
    expect(parseSupabaseConfig({})).toBeNull();
    expect(parseSupabaseConfig({ SUPABASE_URL: "https://xyz.supabase.co" })).toBeNull();
  });

  it("parses valid Supabase configuration and normalizes URLs", () => {
    const config = parseSupabaseConfig({
      SUPABASE_URL: "https://xyz.supabase.co///",
      SUPABASE_ANON_KEY: "anon-key-123",
      SUPABASE_STORAGE_BUCKET: "custom-bucket",
    });

    expect(config).toEqual({
      supabaseUrl: "https://xyz.supabase.co",
      supabaseAnonKey: "anon-key-123",
      storageBucket: "custom-bucket",
    });
  });

  it("maps valid Supabase claims to a stable internal principal", () => {
    const principal = mapSupabaseUserToPrincipal({
      sub: "usr_abc_123",
      email: "test@example.com",
      email_verified: true,
      role: "authenticated",
    });

    expect(principal).toEqual({
      openId: "supabase:usr_abc_123",
      email: "test@example.com",
      isEmailVerified: true,
      role: "user",
    });
  });

  it("rejects malformed Supabase claims with missing subject", () => {
    expect(() => mapSupabaseUserToPrincipal({ sub: "" })).toThrow(
      "Invalid Supabase claims: missing subject identifier"
    );
  });

  it("builds signed storage proxy URLs safely", () => {
    const config = {
      supabaseUrl: "https://xyz.supabase.co",
      supabaseAnonKey: "anon-key-123",
      storageBucket: "amar-hisab-backups",
    };

    const url = buildSupabaseSignedStorageUrl(config, "/exports/backup-2026.json", 1800);
    expect(url).toBe(
      "https://xyz.supabase.co/storage/v1/object/sign/amar-hisab-backups/exports/backup-2026.json?expiresIn=1800"
    );
  });
});
