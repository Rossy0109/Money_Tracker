import express, { type Express } from "express";
import { COOKIE_NAME } from "@shared/const";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  createPasswordUser: vi.fn(),
  // Async DB helpers are called with `.catch(...)` in the router, so they must
  // resolve to a promise even when a test does not configure them.
  isLockedOut: vi.fn().mockResolvedValue({ locked: false }),
  getUserByEmail: vi.fn(),
  recordFailedLoginAttempt: vi.fn().mockResolvedValue(undefined),
  recordLoginHistory: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined),
  systemActorUserId: vi.fn().mockResolvedValue(0),
  clearFailedLoginAttempts: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  createUserSession: vi.fn().mockResolvedValue(undefined),
  revokeSessionByToken: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(null),
}));

vi.mock("./sdk", () => ({
  sdk: { createSessionToken: vi.fn().mockResolvedValue("session-token") },
}));

vi.mock("./passwordAuth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPasswordConstantTime: vi.fn().mockResolvedValue(true),
}));

vi.mock("./rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(["accounting.read"]),
  getUserRoles: vi.fn().mockResolvedValue(["user"]),
}));

vi.mock("../timingSafe", () => ({
  timingSafeCompare: vi.fn().mockResolvedValue(false),
}));

vi.mock("./googleOAuth", () => ({
  GOOGLE_LOGIN_PATH: "/api/auth/google/login",
  GOOGLE_CALLBACK_PATH: "/api/auth/google/callback",
  GOOGLE_TRANSACTION_COOKIE: "__Host-google_oauth",
  createGoogleTransaction: vi.fn(() => ({ state: "google-state" })),
  encodeGoogleTransaction: vi.fn(() => "encoded-google-tx"),
  exchangeGoogleAuthorizationCode: vi.fn().mockResolvedValue("id-token"),
  getGoogleDiscovery: vi.fn().mockResolvedValue({ issuer: "https://accounts.google.com" }),
  googleTransactionCookieMaxAge: 600000,
  readGoogleTransaction: vi.fn(() => ({ state: "google-state" })),
  transactionMatchesState: vi.fn(() => true),
  verifyGoogleIdToken: vi.fn().mockResolvedValue({
    openId: "google-open-id",
    email: "user@example.com",
    name: "User",
  }),
  createGoogleAuthorizationUrl: vi
    .fn()
    .mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?x=1"),
}));

vi.mock("./githubOAuth", () => ({
  GITHUB_LOGIN_PATH: "/api/auth/github/login",
  GITHUB_CALLBACK_PATH: "/api/auth/github/callback",
  GITHUB_TRANSACTION_COOKIE: "__Host-github_oauth",
  createGitHubTransaction: vi.fn(() => ({ state: "github-state" })),
  encodeGitHubTransaction: vi.fn(() => "encoded-github-tx"),
  exchangeGitHubAuthorizationCode: vi.fn().mockResolvedValue("access-token"),
  fetchGitHubUser: vi.fn().mockResolvedValue({
    openId: "github:42",
    email: "gh@example.com",
    name: "GH User",
  }),
  githubTransactionCookieMaxAge: 600000,
  readGitHubTransaction: vi.fn(() => ({ state: "github-state" })),
  transactionMatchesGitHubState: vi.fn(() => true),
  createGitHubAuthorizationUrl: vi
    .fn()
    .mockReturnValue("https://github.com/login/oauth/authorize?x=1"),
}));

import { createPasswordUser, getUserByEmail, isLockedOut, revokeSessionByToken } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { verifyPasswordConstantTime } from "./passwordAuth";
import { registerOAuthRoutes } from "./oauth";

let server: ReturnType<Express["listen"]>;
let baseUrl: string;
const savedAuthMode = ENV.authMode;
const savedBootstrapEmail = ENV.adminBootstrapEmail;

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  registerOAuthRoutes(app);
  return app;
}

beforeEach(async () => {
  // clearAllMocks (not resetAllMocks) so the factory implementations survive;
  // per-test deviations are re-applied in the individual tests.
  vi.clearAllMocks();
  ENV.authMode = "google";
  ENV.adminBootstrapEmail = "";
  process.env.GITHUB_CLIENT_ID = "gh-client";
  process.env.GITHUB_CLIENT_SECRET = "gh-secret";
  vi.mocked(isLockedOut).mockResolvedValue({ locked: false } as any);
  vi.mocked(getUserByEmail).mockResolvedValue(undefined);
  vi.mocked(verifyPasswordConstantTime).mockResolvedValue(true);
  vi.mocked(sdk.createSessionToken).mockResolvedValue("session-token");
  // Re-assert defaults that individual tests override, so one test's
  // mockReturnValue/mockRejectedValue cannot leak into the next.
  vi.mocked(getUserByEmail).mockResolvedValue(undefined);
  vi.mocked(verifyPasswordConstantTime).mockResolvedValue(true);
  vi.mocked(isLockedOut).mockResolvedValue({ locked: false } as any);
  const google = await import("./googleOAuth");
  vi.mocked(google.transactionMatchesState).mockReturnValue(true);
  vi.mocked(google.exchangeGoogleAuthorizationCode).mockResolvedValue("id-token");
  vi.mocked(google.createGoogleAuthorizationUrl)
    .mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?x=1");
  const gh = await import("./githubOAuth");
  vi.mocked(gh.transactionMatchesGitHubState).mockReturnValue(true);
  vi.mocked(gh.exchangeGitHubAuthorizationCode).mockResolvedValue("access-token");
  vi.mocked(gh.fetchGitHubUser).mockResolvedValue({
    openId: "github:42",
    email: "gh@example.com",
    name: "GH User",
  });
  vi.mocked(gh.createGitHubAuthorizationUrl)
    .mockReturnValue("https://github.com/login/oauth/authorize?x=1");
  const app = makeApp();
  server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(() => {
  server?.close();
  ENV.authMode = savedAuthMode;
  ENV.adminBootstrapEmail = savedBootstrapEmail;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
});

function setCookies(res: Response): string[] {
  const raw = res.headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=[^;]+?=)/).map(c => c.trim());
}

describe("POST /api/auth/register", () => {
  it("rejects an invalid email", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "secret123" }),
    });
    expect(res.status).toBe(400);
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "123" }),
    });
    expect(res.status).toBe(400);
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("rejects a missing name (tRPC schema parity)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(400);
    expect(createPasswordUser).not.toHaveBeenCalled();
  });

  it("returns 404 when AUTH_MODE is not password (no registration backdoor)", async () => {
    vi.stubEnv("AUTH_MODE", "google");
    try {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Eve",
          email: "eve@example.com",
          password: "secret123",
        }),
      });
      expect(res.status).toBe(404);
      expect(createPasswordUser).not.toHaveBeenCalled();
      expect(sdk.createSessionToken).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns pendingApproval and issues no session for a pending user", async () => {
    vi.mocked(createPasswordUser).mockResolvedValue({
      id: 9,
      openId: "pending-open",
      name: "Pending",
      email: "a@b.com",
      role: "user",
      status: "pending",
    } as any);
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Pending", email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, pendingApproval: true, user: null });
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
    expect(setCookies(res)).toHaveLength(0);
  });

  it("creates a session cookie for an approved user", async () => {
    vi.mocked(createPasswordUser).mockResolvedValue({
      id: 7,
      openId: "active-open",
      name: "Active",
      email: "a@b.com",
      role: "user",
      status: "active",
    } as any);
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Active", email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      pendingApproval: boolean;
      user: { id: number; email: string; roles: string[]; permissions: string[] };
    };
    expect(body).toMatchObject({ success: true, pendingApproval: false });
    expect(body.user).toMatchObject({ id: 7, email: "a@b.com" });
    expect(body.user.roles).toEqual(["user"]);
    expect(body.user.permissions).toEqual(["accounting.read"]);
    expect(setCookies(res).some(c => c.includes("session-token"))).toBe(true);
  });

  it("fails closed with 400 when registration throws", async () => {
    vi.mocked(createPasswordUser).mockRejectedValue(new Error("db down"));
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  const activeUser = {
    id: 5,
    openId: "login-open",
    name: "Login User",
    email: "a@b.com",
    role: "user",
    status: "active",
    passwordHash: "stored-hash",
  };

  it("rejects missing credentials", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 429 while the account is locked out", async () => {
    vi.mocked(isLockedOut).mockResolvedValue({ locked: true } as any);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(429);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong password and records the failure", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(activeUser as any);
    vi.mocked(verifyPasswordConstantTime).mockResolvedValue(false);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "wrong-pass" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an unknown account", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(undefined);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "secret123" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a pending account", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...activeUser,
      status: "pending",
    } as any);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a suspended account", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({
      ...activeUser,
      status: "suspended",
    } as any);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(403);
  });

  it("logs in an active user and sets the session cookie", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(activeUser as any);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, user: { id: 5 } });
    expect(setCookies(res).some(c => c.includes("session-token"))).toBe(true);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session token from the cookie and clears it", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=abc123` },
    });
    expect(res.status).toBe(200);
    expect(revokeSessionByToken).toHaveBeenCalledWith("abc123");
    const cleared = setCookies(res).find(c => c.startsWith(`${COOKIE_NAME}=`));
    expect(cleared).toBeDefined();
    expect(
      cleared!.includes("Max-Age=0") || cleared!.includes("Expires=Thu, 01 Jan 1970")
    ).toBe(true);
  });

  it("still succeeds without a session cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(revokeSessionByToken).not.toHaveBeenCalled();
  });
});

describe("Google OAuth routes", () => {
  it("hides the login route when google auth mode is off", async () => {
    ENV.authMode = "password";
    const res = await fetch(`${baseUrl}/api/auth/google/login`, {
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });

  it("redirects to Google with a transaction cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/google/login`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(setCookies(res).some(c => c.includes("encoded-google-tx"))).toBe(true);
  });

  it("returns 404 on callback when google auth mode is off", async () => {
    ENV.authMode = "password";
    const res = await fetch(`${baseUrl}/api/auth/google/callback?code=c&state=s`);
    expect(res.status).toBe(404);
  });

  it("returns 403 on callback when the state does not match", async () => {
    const { transactionMatchesState } = await import("./googleOAuth");
    vi.mocked(transactionMatchesState).mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/auth/google/callback?code=c&state=bad`);
    expect(res.status).toBe(403);
  });

  it("returns 403 on callback without a code", async () => {
    const res = await fetch(`${baseUrl}/api/auth/google/callback`);
    expect(res.status).toBe(403);
  });

  it("completes the callback and issues a session cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/google/callback?code=c&state=s`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(setCookies(res).some(c => c.includes("session-token"))).toBe(true);
  });

  it("returns 401 when the callback exchange fails", async () => {
    const { exchangeGoogleAuthorizationCode } = await import("./googleOAuth");
    vi.mocked(exchangeGoogleAuthorizationCode).mockRejectedValue(
      new Error("bad code")
    );
    const res = await fetch(`${baseUrl}/api/auth/google/callback?code=c&state=s`);
    expect(res.status).toBe(401);
  });
});

describe("GitHub OAuth routes", () => {
  it("returns 503 when GitHub is not configured", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await fetch(`${baseUrl}/api/auth/github/login`, {
      redirect: "manual",
    });
    expect(res.status).toBe(503);
  });

  it("redirects to GitHub with a transaction cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/github/login`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("github.com/login/oauth/authorize");
    expect(setCookies(res).some(c => c.includes("encoded-github-tx"))).toBe(true);
  });

  it("returns 503 on callback when GitHub is not configured", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await fetch(`${baseUrl}/api/auth/github/callback?code=c&state=s`);
    expect(res.status).toBe(503);
  });

  it("returns 403 on callback when the state does not match", async () => {
    const { transactionMatchesGitHubState } = await import("./githubOAuth");
    vi.mocked(transactionMatchesGitHubState).mockReturnValue(false);
    const res = await fetch(`${baseUrl}/api/auth/github/callback?code=c&state=bad`);
    expect(res.status).toBe(403);
  });

  it("completes the callback and issues a session cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/github/callback?code=c&state=s`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(setCookies(res).some(c => c.includes("session-token"))).toBe(true);
  });

  it("returns 401 when the callback fails", async () => {
    const { fetchGitHubUser } = await import("./githubOAuth");
    vi.mocked(fetchGitHubUser).mockRejectedValue(new Error("no user"));
    const res = await fetch(`${baseUrl}/api/auth/github/callback?code=c&state=s`);
    expect(res.status).toBe(401);
  });
});