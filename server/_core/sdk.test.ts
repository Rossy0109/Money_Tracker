import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  findRevokedSessionByToken: vi.fn(),
  getUserByOpenId: vi.fn(),
  createUserSession: vi.fn(),
}));

import {
  COOKIE_NAME,
  SESSION_REFRESH_THRESHOLD_MS,
  SESSION_TTL_MS,
} from "@shared/const";
import type { Request, Response } from "express";
import {
  createUserSession,
  findRevokedSessionByToken,
  getUserByOpenId,
} from "../db";
import { sdk } from "./sdk";

const mockRevoked = vi.mocked(findRevokedSessionByToken);
const mockUser = vi.mocked(getUserByOpenId);
const mockCreateUserSession = vi.mocked(createUserSession);

const user = { id: 1, openId: "google:123", role: "user" } as never;

function reqWithCookie(token: string): Request {
  return { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRevoked.mockResolvedValue([]);
  mockUser.mockResolvedValue(user);
  mockCreateUserSession.mockResolvedValue(1);
});

describe("sdk session tokens", () => {
  it("round-trips sign and verify", async () => {
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
    });
    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "google:123",
      name: "Test User",
    });
  });

  it("rejects missing, corrupt, and incomplete payloads", async () => {
    expect(await sdk.verifySession(undefined)).toBeNull();
    expect(await sdk.verifySession("garbage")).toBeNull();
    const noName = await sdk.signSession({
      openId: "a",
      appId: "b",
      name: "",
    });
    expect(await sdk.verifySession(noName)).toBeNull();
  });

  it("creates long-lived refresh tokens", async () => {
    const token = await sdk.createRefreshToken("google:123", {
      name: "Test User",
    });
    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "google:123",
    });
  });
});

describe("sdk.authenticateRequest", () => {
  it("authenticates via session cookie", async () => {
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
    });
    await expect(sdk.authenticateRequest(reqWithCookie(token))).resolves.toBe(
      user
    );
    expect(mockUser).toHaveBeenCalledWith("google:123");
  });

  it("falls back to the Bearer header", async () => {
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
    });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    await expect(sdk.authenticateRequest(req)).resolves.toBe(user);
  });

  it("rejects missing sessions", async () => {
    await expect(
      sdk.authenticateRequest({ headers: {} } as Request)
    ).rejects.toThrow();
  });

  it("rejects revoked sessions", async () => {
    mockRevoked.mockResolvedValue([{ id: 1 }] as never);
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
    });
    await expect(sdk.authenticateRequest(reqWithCookie(token))).rejects.toThrow(
      "revoked"
    );
  });

  it("rejects unknown users", async () => {
    mockUser.mockResolvedValue(undefined);
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
    });
    await expect(sdk.authenticateRequest(reqWithCookie(token))).rejects.toThrow(
      "User not found"
    );
  });
});

describe("sdk sliding session refresh (P2-S-2)", () => {
  function mockRes() {
    const res = { cookie: vi.fn() };
    return { res, cookie: res.cookie };
  }

  it("verifySession exposes expiresAt for refresh decisions", async () => {
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: 60_000,
    });
    const session = await sdk.verifySession(token);
    expect(session?.expiresAt).toBeDefined();
    expect(session!.expiresAt!).toBeGreaterThan(Date.now());
    expect(session!.expiresAt!).toBeLessThanOrEqual(Date.now() + 61_000);
  });

  it("re-issues the cookie once less than half the TTL remains", async () => {
    const { res, cookie } = mockRes();
    // Inside the refresh window (half of 30 days).
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: SESSION_REFRESH_THRESHOLD_MS - 1_000,
    });
    await expect(
      sdk.authenticateRequest(reqWithCookie(token), res as unknown as Response)
    ).resolves.toBe(user);

    expect(cookie).toHaveBeenCalledTimes(1);
    const [name, freshValue, opts] = cookie.mock.calls[0]!;
    expect(name).toBe(COOKIE_NAME);
    expect(typeof freshValue).toBe("string");
    expect(freshValue).not.toBe(token);
    expect(opts).toMatchObject({
      maxAge: SESSION_TTL_MS,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    });

    // The refreshed token is recorded so logout revocation covers it.
    expect(mockCreateUserSession).toHaveBeenCalledTimes(1);
    const [userId, storedToken, storedRefresh] = mockCreateUserSession.mock
      .calls[0]!;
    expect(userId).toBe(1); // user fixture id
    expect(storedToken).toBe(freshValue);
    expect(storedRefresh).toBe(freshValue);

    // And the fresh cookie really is a full-TTL session.
    const freshSession = await sdk.verifySession(freshValue as string);
    expect(freshSession!.expiresAt!).toBeGreaterThan(
      Date.now() + SESSION_TTL_MS - 60_000
    );
  });

  it("leaves sessions with more than half their TTL untouched", async () => {
    const { res, cookie } = mockRes();
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: SESSION_TTL_MS, // freshly logged in, 30 days left
    });
    await expect(
      sdk.authenticateRequest(reqWithCookie(token), res as unknown as Response)
    ).resolves.toBe(user);
    expect(cookie).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("never refreshes without a response object", async () => {
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: SESSION_REFRESH_THRESHOLD_MS - 1_000,
    });
    await expect(sdk.authenticateRequest(reqWithCookie(token))).resolves.toBe(
      user
    );
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("never sets a cookie for Bearer tokens", async () => {
    const { res, cookie } = mockRes();
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: SESSION_REFRESH_THRESHOLD_MS - 1_000,
    });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    await expect(
      sdk.authenticateRequest(req, res as unknown as Response)
    ).resolves.toBe(user);
    expect(cookie).not.toHaveBeenCalled();
    expect(mockCreateUserSession).not.toHaveBeenCalled();
  });

  it("still authenticates when the refresh path fails", async () => {
    mockCreateUserSession.mockRejectedValueOnce(new Error("db down"));
    const { res, cookie } = mockRes();
    const token = await sdk.createSessionToken("google:123", {
      name: "Test User",
      expiresInMs: SESSION_REFRESH_THRESHOLD_MS - 1_000,
    });
    await expect(
      sdk.authenticateRequest(reqWithCookie(token), res as unknown as Response)
    ).resolves.toBe(user);
    // Row insert failure is non-blocking (mirrors login): cookie still set.
    expect(cookie).toHaveBeenCalledTimes(1);
  });
});
