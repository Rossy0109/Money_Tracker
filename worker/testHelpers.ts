import { drizzle } from "drizzle-orm/mysql2";
import { setDbHandle } from "../server/_core/dbConnection";
import { setRateLimitStore, type RateLimitStore } from "../server/_core/rateLimiter";
import type { WorkerEnv } from "./env";

export type { WorkerEnv };

class MemoryRateLimitStore implements RateLimitStore {
  private map = new Map<string, { count: number; resetAt: number }>();

  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, record: { count: number; resetAt: number }) {
    this.map.set(key, record);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

class MemoryR2 {
  private objects = new Map<string, string>();

  async get(key: string) {
    const value = this.objects.get(key);
    if (value === undefined) return null;
    const bytes = new TextEncoder().encode(value);
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      size: bytes.byteLength,
      etag: "test-etag",
      httpMetadata: { contentType: "application/octet-stream" },
    };
  }
  async put(key: string, value: string) {
    this.objects.set(key, value);
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

export function createTestEnv(overrides?: Partial<WorkerEnv>): WorkerEnv {
  const dbUrl = process.env.ISOLATED_E2E_DATABASE_URL ?? "mysql://root@127.0.0.1:3306/money_tracker";

  const db = drizzle(dbUrl, { logger: false });
  setDbHandle(db);

  const kvStore = new MemoryRateLimitStore();
  setRateLimitStore(kvStore);

  return {
    DATABASE_URL: dbUrl,
    AUTH_MODE: "password",
    SESSION_SECRET: "test-session-secret-minimum-32-characters",
    JWT_SECRET: "test-jwt-secret-minimum-32-chars-long",
    ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
    ADMIN_ACCESS_PASSWORD: "test-admin-access-password",
    OWNER_OPEN_ID: "",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
    APP_URL: "http://localhost:3000",
    NODE_ENV: "test",
    CRON_SECRET: "test-cron-secret",
    BACKUP_ENCRYPTION_KEY: "test-backup-encryption-key-32-chars-long",
    BACKUP_RETENTION_DAYS: "30",
    BLOB_STORE_ID: "",
    BLOB_READ_WRITE_TOKEN: "",
    R2_BUCKET: new MemoryR2(),
    RATE_LIMIT_KV: {
      get: (_key: string) => Promise.resolve(null),
      put: (_key: string, _value: string) => Promise.resolve(),
      delete: (_key: string) => Promise.resolve(),
    },
    ASSETS: {
      fetch: () => Promise.resolve(new Response("index.html", { headers: { "Content-Type": "text/html" } })),
    },
    EMAIL_WEBHOOK_URL: "",
    RESEND_API_KEY: "",
    EMAIL_FROM: "test@example.com",
    SENTRY_DSN: "",
    ...overrides,
  };
}
