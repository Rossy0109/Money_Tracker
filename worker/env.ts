/**
 * Worker environment resolution.
 *
 * Resolves all configuration from Cloudflare Worker bindings and secrets.
 * Secrets are passed via wrangler.toml [vars] or `wrangler secret put`.
 */

export interface WorkerEnv {
  // Database
  DATABASE_URL: string;

  // Auth
  AUTH_MODE: "google" | "password";
  SESSION_SECRET: string;
  JWT_SECRET: string;
  ADMIN_BOOTSTRAP_EMAIL: string;
  ADMIN_ACCESS_PASSWORD: string;
  OWNER_OPEN_ID: string;

  // Google OAuth
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;

  // GitHub OAuth
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;

  // App
  APP_URL: string;
  NODE_ENV: string;

  // Cron / Backup
  CRON_SECRET: string;
  BACKUP_ENCRYPTION_KEY: string;
  BACKUP_RETENTION_DAYS: string;

  // Storage
  BLOB_STORE_ID: string;
  BLOB_READ_WRITE_TOKEN: string;

  // R2
  R2_BUCKET?: unknown;

  // KV
  RATE_LIMIT_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  };

  // Assets
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };

  // Email
  EMAIL_WEBHOOK_URL: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;

  // Sentry
  SENTRY_DSN: string;
}

/**
 * Resolve the Google OAuth redirect URI from APP_URL if not explicitly set.
 * This ensures the redirect URI is always derived from the deployment environment.
 */
export function resolveGoogleRedirectUri(env: WorkerEnv): string {
  if (env.GOOGLE_OAUTH_REDIRECT_URI) {
    return env.GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${env.APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function isProduction(env: WorkerEnv): boolean {
  return env.NODE_ENV === "production";
}
