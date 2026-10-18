/**
 * Supabase Staging Adapter
 * Provider-neutral staging adapter for Supabase PostgreSQL, Supabase Auth, and Supabase Storage.
 */

export interface SupabaseStagingConfig {
  supabaseUrl: string;
  /**
   * Key used for server-side Storage REST calls. Prefers the anon key but
   * falls back to the service-role key so a Worker deployment that only holds
   * the service-role secret (see docs/CLOUDFLARE_DEPLOYMENT.md) still resolves.
   * Server-side only — never sent to a client.
   */
  supabaseKey: string;
  /** General private-object bucket (SUPABASE_STORAGE_BUCKET). */
  storageBucket?: string;
  /** Dedicated backup bucket (SUPABASE_BACKUP_BUCKET). */
  backupBucket: string;
}

export const DEFAULT_BACKUP_BUCKET = "amar-hisab-backups";

export interface SupabaseAuthClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
  exp?: number;
}

export function parseSupabaseConfig(
  env: Record<string, string | undefined>
): SupabaseStagingConfig | null {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseKey,
    storageBucket: env.SUPABASE_STORAGE_BUCKET || undefined,
    backupBucket: env.SUPABASE_BACKUP_BUCKET || DEFAULT_BACKUP_BUCKET,
  };
}

export function mapSupabaseUserToPrincipal(claims: SupabaseAuthClaims) {
  if (
    !claims.sub ||
    typeof claims.sub !== "string" ||
    claims.sub.trim() === ""
  ) {
    throw new Error("Invalid Supabase claims: missing subject identifier");
  }
  return {
    openId: `supabase:${claims.sub}`,
    email: claims.email || null,
    isEmailVerified: Boolean(claims.email_verified),
    role: claims.role === "service_role" ? "admin" : "user",
  };
}

export function buildSupabaseSignedStorageUrl(
  config: SupabaseStagingConfig,
  objectPath: string,
  expiresInSeconds = 3600
): string {
  const cleanPath = objectPath.replace(/^\/+/, "");
  return `${config.supabaseUrl}/storage/v1/object/sign/${config.storageBucket}/${cleanPath}?expiresIn=${expiresInSeconds}`;
}
