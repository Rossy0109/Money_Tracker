import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GITHUB_CALLBACK_PATH,
  GITHUB_LOGIN_PATH,
  GITHUB_TRANSACTION_COOKIE,
  createGitHubTransaction,
  decodeGitHubTransaction,
  encodeGitHubTransaction,
  transactionMatchesGitHubState,
  createGitHubAuthorizationUrl,
  exchangeGitHubAuthorizationCode,
  fetchGitHubUser,
  readGitHubTransaction,
} from "./githubOAuth";

describe("GitHub OAuth transaction codec (original, PR #177)", () => {
  it("creates unique states of sufficient length", () => {
    const first = createGitHubTransaction();
    const second = createGitHubTransaction();
    expect(first.state.length).toBeGreaterThanOrEqual(32);
    expect(first.state).not.toBe(second.state);
  });

  it("round-trips through encode/decode", () => {
    const transaction = createGitHubTransaction();
    expect(decodeGitHubTransaction(encodeGitHubTransaction(transaction))).toEqual(
      transaction
    );
  });

  it("rejects missing, corrupt, and short states", () => {
    expect(decodeGitHubTransaction(undefined)).toBeNull();
    expect(decodeGitHubTransaction("")).toBeNull();
    expect(decodeGitHubTransaction("!!!not-base64!!!")).toBeNull();
    expect(
      decodeGitHubTransaction(encodeGitHubTransaction({ state: "short" }))
    ).toBeNull();
    expect(
      decodeGitHubTransaction(
        Buffer.from(JSON.stringify({ nope: 1 })).toString("base64url")
      )
    ).toBeNull();
  });

  it("exposes stable route constants", () => {
    expect(GITHUB_LOGIN_PATH).toBe("/api/auth/github/login");
    expect(GITHUB_CALLBACK_PATH).toBe("/api/auth/github/callback");
    expect(GITHUB_TRANSACTION_COOKIE).toBe("__Host-github_oauth");
  });
});

describe("githubOAuth pure functions", () => {
  it("uses timing-safe equality for state matching", () => {
    const tx = { state: "a".repeat(43) };
    expect(transactionMatchesGitHubState(tx, "a".repeat(43))).toBe(true);
    expect(transactionMatchesGitHubState(tx, "b".repeat(43))).toBe(false);
    expect(transactionMatchesGitHubState(null, "anything")).toBe(false);
    expect(transactionMatchesGitHubState(tx, undefined)).toBe(false);
    expect(transactionMatchesGitHubState({ state: "" }, "")).toBe(false);
  });

  it("builds the authorization URL with required params", () => {
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    const tx = { state: "test-state" };
    const url = createGitHubAuthorizationUrl(tx, "https://app.example.com/callback");
    const u = new URL(url);
    expect(u.origin).toBe("https://github.com");
    expect(u.pathname).toBe("/login/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.com/callback");
    expect(u.searchParams.get("scope")).toBe("read:user user:email");
    expect(u.searchParams.get("state")).toBe("test-state");
  });

  it("throws when GITHUB_CLIENT_ID is missing for authorization URL", () => {
    delete process.env.GITHUB_CLIENT_ID;
    const tx = { state: "test" };
    expect(() => createGitHubAuthorizationUrl(tx)).toThrow(
      "GITHUB_CLIENT_ID is required for GitHub login"
    );
  });
});

describe("exchangeGitHubAuthorizationCode", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  });

  it("throws when client credentials are missing", async () => {
    delete process.env.GITHUB_CLIENT_SECRET;
    await expect(
      exchangeGitHubAuthorizationCode("code", mockFetch)
    ).rejects.toThrow("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
  });

  it("exchanges code for access token on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_test_token" }),
    });
    const token = await exchangeGitHubAuthorizationCode("auth-code", mockFetch);
    expect(token).toBe("gho_test_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          accept: "application/json",
        }),
        body: expect.stringContaining("auth-code"),
      })
    );
  });

  it("throws on non-ok GitHub response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });
    await expect(
      exchangeGitHubAuthorizationCode("code", mockFetch)
    ).rejects.toThrow("GitHub token exchange request failed");
  });

  it("throws when access_token is missing from response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "bad_verification_code" }),
    });
    await expect(
      exchangeGitHubAuthorizationCode("code", mockFetch)
    ).rejects.toThrow("GitHub error: bad_verification_code");
  });
});

describe("fetchGitHubUser", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns user identity with email from /user endpoint", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          login: "octocat",
          name: "Mona Lisa",
          email: "mona@github.com",
        }),
      });

    const identity = await fetchGitHubUser("token", mockFetch);
    expect(identity).toEqual({
      openId: "github:12345",
      email: "mona@github.com",
      name: "Mona Lisa",
    });
  });

  it("falls back to /user/emails when email is null", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          login: "octocat",
          name: "Mona Lisa",
          email: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { email: "mona@github.com", primary: true, verified: true },
        ],
      });

    const identity = await fetchGitHubUser("token", mockFetch);
    expect(identity.email).toBe("mona@github.com");
  });

  it("falls back to login@users.noreply.github.com when no email found", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 999,
          login: "noemailuser",
          name: null,
          email: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const identity = await fetchGitHubUser("token", mockFetch);
    expect(identity.email).toBe("noemailuser@users.noreply.github.com");
    expect(identity.name).toBe("noemailuser");
  });

  it("throws on non-ok user response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchGitHubUser("token", mockFetch)).rejects.toThrow(
      "Failed to fetch user from GitHub"
    );
  });
});

describe("readGitHubTransaction", () => {
  it("extracts and decodes the transaction cookie", () => {
    const tx = createGitHubTransaction();
    const encoded = encodeGitHubTransaction(tx);
    const req = {
      headers: {
        cookie: `__Host-github_oauth=${encoded}; other=value`,
      },
    } as any;

    const result = readGitHubTransaction(req);
    expect(result).not.toBeNull();
    expect(result!.state).toBe(tx.state);
  });

  it("returns null when cookie is missing", () => {
    const req = { headers: { cookie: "other=value" } } as any;
    expect(readGitHubTransaction(req)).toBeNull();
  });

  it("returns null when cookie is malformed", () => {
    const req = {
      headers: { cookie: `__Host-github_oauth=not-valid` },
    } as any;
    expect(readGitHubTransaction(req)).toBeNull();
  });
});