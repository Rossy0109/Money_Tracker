import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPasswordResetUrl,
  isEmailDeliveryConfigured,
  sendPasswordResetEmail,
} from "./mailer";

const KEYS = [
  "EMAIL_WEBHOOK_URL",
  "RESEND_API_KEY",
  "PASSWORD_RESET_BASE_URL",
  "APP_BASE_URL",
  "VITE_APP_URL",
] as const;
const savedEnv = Object.fromEntries(
  KEYS.map(key => [key, process.env[key]])
) as Record<(typeof KEYS)[number], string | undefined>;
const savedFetch = globalThis.fetch;

function clearMailEnv() {
  for (const key of KEYS) delete process.env[key];
}

afterEach(() => {
  for (const key of KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

const input = {
  to: "user@example.com",
  resetUrl: "https://app.example/reset?token=abc",
  token: "abc",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

describe("isEmailDeliveryConfigured", () => {
  it("is false without any transport", () => {
    clearMailEnv();
    expect(isEmailDeliveryConfigured()).toBe(false);
  });

  it("is true with a webhook or resend key", () => {
    clearMailEnv();
    process.env.EMAIL_WEBHOOK_URL = "https://hooks.example/x";
    expect(isEmailDeliveryConfigured()).toBe(true);
    clearMailEnv();
    process.env.RESEND_API_KEY = "re-key";
    expect(isEmailDeliveryConfigured()).toBe(true);
  });
});

describe("buildPasswordResetUrl", () => {
  it("falls back to localhost and encodes the token", () => {
    clearMailEnv();
    expect(buildPasswordResetUrl("a b+c")).toBe(
      "http://localhost:3000/reset-password?token=a%20b%2Bc"
    );
  });

  it("prefers the reset base and trims trailing slashes", () => {
    clearMailEnv();
    process.env.APP_BASE_URL = "https://ignored.example";
    process.env.PASSWORD_RESET_BASE_URL = "https://app.example/";
    expect(buildPasswordResetUrl("t")).toBe(
      "https://app.example/reset-password?token=t"
    );
  });
});

describe("sendPasswordResetEmail", () => {
  it("returns false when unconfigured without touching the network", () => {
    clearMailEnv();
    const spy = vi.fn();
    globalThis.fetch = spy as never;
    return expect(sendPasswordResetEmail(input)).resolves.toBe(false);
  });

  it("posts to the webhook transport", async () => {
    clearMailEnv();
    process.env.EMAIL_WEBHOOK_URL = "https://hooks.example/x";
    globalThis.fetch = vi.fn(async () => ({ ok: true })) as never;
    await expect(sendPasswordResetEmail(input)).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example/x");
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: "user@example.com",
      kind: "password_reset",
    });
  });

  it("maps transport failure and exceptions to false", async () => {
    clearMailEnv();
    process.env.EMAIL_WEBHOOK_URL = "https://hooks.example/x";
    globalThis.fetch = vi.fn(async () => ({ ok: false })) as never;
    await expect(sendPasswordResetEmail(input)).resolves.toBe(false);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("down");
    }) as never;
    await expect(sendPasswordResetEmail(input)).resolves.toBe(false);
  });
});
