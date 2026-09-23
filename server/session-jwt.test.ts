import { describe, expect, it, vi } from "vitest";

/**
 * Regression: createSessionToken must honor the caller's expiresInMs.
 *
 * Root cause of production "JWT expired" errors: login flows passed
 * expiresInMs: ONE_YEAR_MS (to match the session cookie) but the SDK
 * hard-coded ACCESS_TOKEN_TTL_MS (15 minutes), so cookies outlived JWTs.
 */
vi.mock("./_core/env", () => ({
  ENV: {
    authMode: "password",
    cookieSecret: "test-cookie-secret",
    sessionSecret: "test-session-secret-at-least-32-chars-long",
    databaseUrl: "",
    ownerOpenId: "",
    adminAccessPassword: "",
    isProduction: false,
    blobStoreId: "",
    blobReadWriteToken: "",
    googleOAuthClientId: "client-id",
    googleOAuthClientSecret: "client-secret",
    googleOAuthRedirectUri: "https://example.com/api/auth/google/callback",
    googleDriveClientId: "",
    googleDriveClientSecret: "",
    googleDriveRedirectUri: "",
    backupCronSecret: "",
    backupEncryptionKey: "",
    backupRetentionDays: 30,
    adminBootstrapEmail: "",
  },
}));

vi.mock("./_core/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { sdk } = await import("./_core/sdk");

function decodeJwtPayload(token: string): { exp?: number } {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

describe("session JWT TTL", () => {
  it("honors explicit expiresInMs from login callers", async () => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.createSessionToken("google:test-user", {
      name: "Test User",
      expiresInMs: oneYearMs,
    });
    const { exp } = decodeJwtPayload(token);
    expect(exp).toBeDefined();
    // Allow 5s clock slack; must be ~1 year, not 15 minutes.
    expect(exp! - before).toBeGreaterThan(oneYearMs / 1000 - 5);
    expect(exp! - before).toBeLessThanOrEqual(oneYearMs / 1000 + 5);
  });

  it("falls back to the 15-minute access-token default", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.createSessionToken("google:test-user", { name: "Test" });
    const { exp } = decodeJwtPayload(token);
    expect(exp! - before).toBeLessThanOrEqual(15 * 60 + 5);
    expect(exp! - before).toBeGreaterThan(14 * 60);
  });

  it("rejects expired sessions without throwing unexpectedly", async () => {
    const expired = await sdk.signSession(
      { openId: "google:old", appId: "test-app", name: "Old" },
      { expiresInMs: -1000 },
    );
    await expect(sdk.verifySession(expired)).resolves.toBeNull();
  });

  it("rejects tampered tokens", async () => {
    const token = await sdk.createSessionToken("google:u", { name: "n" });
    await expect(sdk.verifySession(`${token}x`)).resolves.toBeNull();
  });
});
