import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID = "drive-client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = "drive-client-secret";
  process.env.GOOGLE_DRIVE_REDIRECT_URI =
    "https://app.example.com/api/drive/oauth/callback";
  process.env.GOOGLE_DRIVE_TOKEN_KEY = "unit-test-drive-token-key";
});

vi.mock("../backupDb", () => ({
  updateDriveAccessToken: vi.fn(async () => {}),
}));

import {
  DRIVE_SCOPE,
  buildDriveAuthorizationUrl,
  createDriveTransaction,
  decodeDriveTransaction,
  decryptDriveToken,
  encodeDriveTransaction,
  encryptDriveToken,
  exchangeDriveAuthorizationCode,
  getAccessToken,
  isDriveConfigured,
  transactionMatchesState,
} from "./driveOAuth";
import type { DriveConnectionRecord } from "./types";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
const fetchMock = (impl: FetchLike) => vi.fn(impl);

function connection(
  overrides: Partial<DriveConnectionRecord> = {}
): DriveConnectionRecord {
  return {
    userId: 7,
    revokedAt: null,
    rootFolderName: "Money_Tracker",
    rootFolderId: "folder-1",
    scope: DRIVE_SCOPE,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    lastVerifiedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("drive transaction", () => {
  it("round-trips through the cookie encoding", () => {
    const transaction = createDriveTransaction(42, "My Backups");
    const decoded = decodeDriveTransaction(encodeDriveTransaction(transaction));
    expect(decoded).toEqual(transaction);
    expect(transactionMatchesState(decoded, transaction.state)).toBe(true);
    expect(transactionMatchesState(decoded, "wrong-state-value")).toBe(false);
  });

  it("rejects malformed or short transactions", () => {
    expect(decodeDriveTransaction(undefined)).toBeNull();
    expect(decodeDriveTransaction("not base64 json")).toBeNull();
    const short = encodeDriveTransaction({
      state: "short",
      verifier: "x".repeat(64),
      userId: 1,
      rootFolderName: "f",
    });
    expect(decodeDriveTransaction(short)).toBeNull();
  });

  it("falls back to the default folder name", () => {
    const transaction = createDriveTransaction(5, "   ");
    expect(transaction.rootFolderName).toBe("Money_Tracker");
  });
});

describe("buildDriveAuthorizationUrl", () => {
  it("requests only drive.file with PKCE and offline access", async () => {
    const transaction = createDriveTransaction(1, "Money_Tracker");
    const url = new URL(await buildDriveAuthorizationUrl(transaction));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(url.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/drive/oauth/callback"
    );
  });
});

describe("isDriveConfigured", () => {
  it("is true when all three credentials are present", () => {
    expect(isDriveConfigured()).toBe(true);
  });
});

describe("exchangeDriveAuthorizationCode", () => {
  it("parses tokens from the token endpoint", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 3600,
        scope: DRIVE_SCOPE,
      })
    );
    const transaction = createDriveTransaction(1);
    const tokens = await exchangeDriveAuthorizationCode(
      "auth-code",
      transaction,
      fetchImpl as unknown as typeof fetch
    );
    expect(tokens).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1",
      scope: DRIVE_SCOPE,
      expiresIn: 3600,
    });
    const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("code_verifier")).toBe(transaction.verifier);
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("throws when the token endpoint fails", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({}, false, 400));
    await expect(
      exchangeDriveAuthorizationCode(
        "bad",
        createDriveTransaction(1),
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow(/token exchange failed/);
  });
});

describe("token encryption at rest", () => {
  it("round-trips a token and rejects malformed blobs", async () => {
    const encrypted = await encryptDriveToken("refresh-token-value");
    expect(encrypted).not.toContain("refresh-token-value");
    await expect(decryptDriveToken(encrypted)).resolves.toBe(
      "refresh-token-value"
    );
    await expect(decryptDriveToken("nonsense")).rejects.toThrow(/Malformed/);
  });
});

describe("getAccessToken", () => {
  it("returns a fresh stored access token without refreshing", async () => {
    const fetchImpl = vi.fn();
    const record = connection({
      accessTokenEnc: await encryptDriveToken("fresh-token"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });
    await expect(
      getAccessToken(record, fetchImpl as unknown as typeof fetch)
    ).resolves.toBe("fresh-token");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes (and persists) an expired access token", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({ access_token: "new-token", expires_in: 1800 })
    );
    const record = connection({
      accessTokenEnc: await encryptDriveToken("old-token"),
      tokenExpiresAt: new Date(Date.now() - 1000),
      refreshTokenEnc: await encryptDriveToken("refresh-token"),
    });
    await expect(
      getAccessToken(record, fetchImpl as unknown as typeof fetch)
    ).resolves.toBe("new-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const { updateDriveAccessToken } = await import("../backupDb");
    expect(updateDriveAccessToken).toHaveBeenCalledWith(
      7,
      expect.any(String),
      expect.any(Date)
    );
  });

  it("throws for revoked or unrefreshable connections", async () => {
    await expect(getAccessToken(null)).rejects.toThrow(/not connected/);
    await expect(
      getAccessToken(connection({ revokedAt: new Date() }))
    ).rejects.toThrow(/revoked/);
    await expect(getAccessToken(connection())).rejects.toThrow(
      /reconnect required/
    );
  });
});
