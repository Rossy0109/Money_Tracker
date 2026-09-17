export const ENV = {
  authMode: process.env.AUTH_MODE === "google" ? "google" : "manus",
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  adminAccessPassword: process.env.ADMIN_ACCESS_PASSWORD ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  blobStoreId: process.env.BLOB_STORE_ID ?? "",
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
  googleOAuthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveRedirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI ?? "",
  backupCronSecret: process.env.CRON_SECRET ?? process.env.BACKUP_CRON_SECRET ?? "",
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? "",
};

export type AuthModeConsistency = { ok: boolean; serverMode?: string; clientMode?: string };

/**
 * Validates that critical environment variables are present at startup.
 * Returns an array of missing variable names (empty if all present).
 */
export function validateCriticalEnv(): string[] {
  const required = ["DATABASE_URL"];
  const authRequired = ["SESSION_SECRET", "JWT_SECRET"];
  
  const missing: string[] = [];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  // At least one auth secret must be set
  const hasAuthSecret = authRequired.some(key => process.env[key]);
  if (!hasAuthSecret) {
    missing.push(...authRequired);
  }
  
  return missing;
}

/**
 * The server-side mode (`AUTH_MODE`, read by Express at runtime) and the
 * browser-side mode (`VITE_AUTH_MODE`, compiled into the client bundle) must
 * always agree. They are independent environment variables, so nothing in the
 * runtime enforces this on its own.
 *
 * `ensure` reads current process.env so tests can control it with vi.stubEnv.
 */
export function ensureAuthModeConsistency(): AuthModeConsistency {
  const serverMode = process.env.AUTH_MODE;
  const clientMode = process.env.VITE_AUTH_MODE;
  if (!serverMode || !clientMode) {
    return { ok: true, serverMode, clientMode };
  }
  const ok = serverMode === clientMode;
  return { ok, serverMode, clientMode };
}
