import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("ensureAuthModeConsistency", () => {
  it("passes when both AUTH_MODE and VITE_AUTH_MODE are equal", async () => {
    vi.stubEnv("AUTH_MODE", "google");
    vi.stubEnv("VITE_AUTH_MODE", "google");
    const { ensureAuthModeConsistency } = await import("./env");
    expect(ensureAuthModeConsistency()).toEqual({
      ok: true,
      serverMode: "google",
      clientMode: "google",
    });
  });

  it("passes when VITE_AUTH_MODE is not set (build-time value absent)", async () => {
    vi.stubEnv("AUTH_MODE", "google");
    delete process.env.VITE_AUTH_MODE;
    const { ensureAuthModeConsistency } = await import("./env");
    const result = ensureAuthModeConsistency();
    expect(result.ok).toBe(true);
  });

  it("passes when both are set to the same value", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("VITE_AUTH_MODE", "password");
    const { ensureAuthModeConsistency } = await import("./env");
    expect(ensureAuthModeConsistency()).toEqual({
      ok: true,
      serverMode: "password",
      clientMode: "password",
    });
  });

  it("fails when AUTH_MODE=google but VITE_AUTH_MODE=password", async () => {
    vi.stubEnv("AUTH_MODE", "google");
    vi.stubEnv("VITE_AUTH_MODE", "password");
    const { ensureAuthModeConsistency } = await import("./env");
    const result = ensureAuthModeConsistency();
    expect(result.ok).toBe(false);
    expect(result.serverMode).toBe("google");
    expect(result.clientMode).toBe("password");
  });

  it("fails when AUTH_MODE=password but VITE_AUTH_MODE=google", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("VITE_AUTH_MODE", "google");
    const { ensureAuthModeConsistency } = await import("./env");
    expect(ensureAuthModeConsistency().ok).toBe(false);
  });
});

describe("validateCriticalEnv — ADMIN_ACCESS_PASSWORD", () => {
  it("requires ADMIN_ACCESS_PASSWORD in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://local");
    vi.stubEnv("SESSION_SECRET", "test-secret");
    delete process.env.ADMIN_ACCESS_PASSWORD;
    const { validateCriticalEnv } = await import("./env");
    expect(validateCriticalEnv()).toContain("ADMIN_ACCESS_PASSWORD");
  });

  it("does not require ADMIN_ACCESS_PASSWORD outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "mysql://local");
    vi.stubEnv("SESSION_SECRET", "test-secret");
    delete process.env.ADMIN_ACCESS_PASSWORD;
    const { validateCriticalEnv } = await import("./env");
    expect(validateCriticalEnv()).not.toContain("ADMIN_ACCESS_PASSWORD");
  });

  it("accepts production when ADMIN_ACCESS_PASSWORD is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://local");
    vi.stubEnv("SESSION_SECRET", "test-secret");
    vi.stubEnv("ADMIN_ACCESS_PASSWORD", "sup3r-s3cret");
    const { validateCriticalEnv } = await import("./env");
    expect(validateCriticalEnv()).not.toContain("ADMIN_ACCESS_PASSWORD");
  });
});
