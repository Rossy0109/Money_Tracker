/**
 * Supabase Staging Adapter
 * Provider-neutral staging adapter for Supabase PostgreSQL, Supabase Auth, and Supabase Storage.
 */

export interface SupabaseStagingConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storageBucket?: string;
}

export interface SupabaseAuthClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
  exp?: number;
}

export function parseSupabaseConfig(env: Record<string, string | undefined>): SupabaseStagingConfig | null {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
    supabaseAnonKey,
    storageBucket: env.SUPABASE_STORAGE_BUCKET || "amar-hisab-backups",
  };
}

export function mapSupabaseUserToPrincipal(claims: SupabaseAuthClaims) {
  if (!claims.sub || typeof claims.sub !== "string" || claims.sub.trim() === "") {
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
