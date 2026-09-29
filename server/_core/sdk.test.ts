import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  findRevokedSessionByToken: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

import { COOKIE_NAME } from "@shared/const";
import type { Request } from "express";
import { findRevokedSessionByToken, getUserByOpenId } from "../db";
import { sdk } from "./sdk";

const mockRevoked = vi.mocked(findRevokedSessionByToken);
const mockUser = vi.mocked(getUserByOpenId);

const user = { id: 1, openId: "google:123", role: "user" } as never;

function reqWithCookie(token: string): Request {
  return { headers: { cookie: `${COOKIE_NAME}=${token}` } } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRevoked.mockResolvedValue([]);
  mockUser.mockResolvedValue(user);
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
