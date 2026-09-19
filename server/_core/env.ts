export type AuthMode = "google" | "password" | "manus";

export const ENV = {
  authMode: (process.env.AUTH_MODE as AuthMode) ?? "password",
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
  backupEncryptionKey: process.env.BACKUP_ENCRYPTION_KEY ?? "",
  backupRetentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10),
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? "",
};

export type AuthModeConsistency = { ok: boolean; serverMode?: AuthMode; clientMode?: AuthMode };

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
  const hasAuthSecret = ["SESSION_SECRET", "JWT_SECRET"].some(key => process.env[key]);
  if (!hasAuthSecret) {
    missing.push("SESSION_SECRET", "JWT_SECRET");
  }
  
  // If using Google OAuth, check required Google OAuth env vars
  if (process.env.AUTH_MODE === "google") {
    const googleRequired = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"];
    for (const key of googleRequired) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }
  
  // If using Manus OAuth, check required Manus OAuth env vars
  if (process.env.AUTH_MODE === "manus") {
    const manusRequired = ["OAUTH_SERVER_URL"];
    for (const key of manusRequired) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
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
  const serverMode = (process.env.AUTH_MODE as "google" | "password" | "manus") ?? "password";
  const clientMode = (process.env.VITE_AUTH_MODE as "google" | "password" | "manus" | undefined);
  if (!clientMode) {
    return { ok: true, serverMode, clientMode: serverMode };
  }
  const ok = serverMode === clientMode;
  return { ok, serverMode, clientMode };
}
