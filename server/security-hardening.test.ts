import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Security Headers", () => {
  it("helmet is used with CSP configured (not disabled)", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("helmet({");
    expect(s).not.toMatch(/contentSecurityPolicy:\s*false/);
    expect(s).toContain("contentSecurityPolicy:");
  });
  it("HSTS is configured", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("hsts:");
    expect(s).toContain("maxAge:");
  });
  it("X-Frame-Options is set to deny", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("frameguard:");
    expect(s).toContain("deny");
  });
  it("nosniff is set", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("nosniff");
  });
  it("Permissions-Policy blocks dangerous features", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("Permissions-Policy");
    expect(s).toContain("camera=()");
    expect(s).toContain("microphone=()");
    expect(s).toContain("geolocation=()");
  });
  it("Referrer-Policy is configured", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("referrerPolicy");
  });
  it("X-Download-Options noopen is set", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("X-Download-Options");
    expect(s).toContain("noopen");
  });
});

describe("CORS Configuration", () => {
  it("CORS middleware exists", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("Access-Control-Allow-Origin");
    expect(s).toContain("Access-Control-Allow-Methods");
    expect(s).toContain("Access-Control-Allow-Credentials");
  });
  it("production CORS restricts to same-origin", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("APP_URL");
    expect(s).toContain("isProduction");
  });
  it("preflight returns 204", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("OPTIONS");
    expect(s).toContain("204");
  });
});

describe("Cookie Security", () => {
  it("session cookie uses sameSite lax (not none)", () => {
    const s = readFile("./_core/cookies.ts");
    expect(s).toContain('sameSite: "lax"');
    const sessionSection = s.split("getSessionCookieOptions")[1];
    expect(sessionSection).not.toContain('sameSite: "none"');
  });
  it("all cookies are httpOnly", () => {
    const s = readFile("./_core/cookies.ts");
    expect(s).toContain("httpOnly: true");
  });
  it("secure flag uses isSecureRequest", () => {
    const s = readFile("./_core/cookies.ts");
    expect(s).toContain("secure: isSecureRequest(req)");
  });
  it("admin elevation cookie uses sameSite strict", () => {
    const s = readFile("./_core/cookies.ts");
    expect(s).toContain('sameSite: "strict"');
  });
});

describe("Error Leakage Prevention", () => {
  it("Express error handler returns generic message", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain('"Internal server error"');
  });
  it("OAuth register error uses static message (not error.message)", () => {
    const s = readFile("./_core/oauth.ts");
    expect(s).not.toMatch(/error\.message.*রেজিস্ট্রেশন/);
    expect(s).toContain('"রেজিস্ট্রেশন সম্পন্ন করা যায়নি"');
  });
  it("OAuth login error returns generic message (not error.message)", () => {
    const s = readFile("./_core/oauth.ts");
    // Login catch block should return a static message, not error.message
    expect(s).not.toMatch(/error\.message.*লগইন/);
  });
  it("404 handler returns generic message", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain('"Not found"');
  });
  it("tRPC errors don't expose stack traces", () => {
    const s = readFile("./_core/trpc.ts");
    expect(s).not.toContain("stackTrace");
  });
});

describe("Secret Exposure Prevention", () => {
  it("logger redacts backupEncryptionKey", () => {
    const s = readFile("./_core/logger.ts");
    expect(s).toContain("backupEncryptionKey");
  });
  it("logger redacts s3SecretAccessKey", () => {
    const s = readFile("./_core/logger.ts");
    expect(s).toContain("s3SecretAccessKey");
  });
  it("logger redacts googleOAuthClientSecret", () => {
    const s = readFile("./_core/logger.ts");
    expect(s).toContain("googleOAuthClientSecret");
  });
  it("logger redacts authorization header", () => {
    const s = readFile("./_core/logger.ts");
    expect(s).toContain("req.headers.authorization");
  });
  it("logger redacts cookie header", () => {
    const s = readFile("./_core/logger.ts");
    expect(s).toContain("req.headers.cookie");
  });
  it("no hardcoded secrets in source files", () => {
    const files = [
      "./_core/app.ts",
      "./_core/oauth.ts",
      "./_core/trpc.ts",
      "./scheduledBackup.ts",
      "./cloudBackupService.ts",
    ];
    for (const f of files) {
      const s = readFile(f);
      expect(s).not.toContain("secure-cloud-backup-key");
    }
  });
});

describe("Rate Limiting", () => {
  it("auth endpoints have rate limiting", () => {
    const s = readFile("./_core/app.ts");
    expect(s).toContain("authLimiter");
    expect(s).toContain("/api/auth");
    expect(s).toContain("/api/trpc/auth");
  });
  it("rate limiter throws TOO_MANY_REQUESTS", () => {
    const s = readFile("./_core/rateLimiter.ts");
    expect(s).toContain("TOO_MANY_REQUESTS");
  });
});

describe("Timing-Safe Comparison", () => {
  it("uses timingSafeEqual for comparisons", () => {
    const s = readFile("./timingSafe.ts");
    expect(s).toContain("timingSafeEqual");
  });
  it("hashes before comparison to prevent length leakage", () => {
    const s = readFile("./timingSafe.ts");
    expect(s).toContain("createHash");
  });
});

describe("Storage Proxy Security", () => {
  it("objectId is validated as integer", () => {
    const s = readFile("./_core/storageProxy.ts");
    expect(s).toContain("Number.isSafeInteger");
  });
  it("storage proxy requires authentication", () => {
    const s = readFile("./_core/storageProxy.ts");
    expect(s).toContain("authenticateRequest");
  });
  it("Cache-Control no-store is set", () => {
    const s = readFile("./_core/storageProxy.ts");
    expect(s).toContain("no-store");
  });
  it("X-Content-Type-Options nosniff is set", () => {
    const s = readFile("./_core/storageProxy.ts");
    expect(s).toContain("X-Content-Type-Options");
    expect(s).toContain("nosniff");
  });
});
