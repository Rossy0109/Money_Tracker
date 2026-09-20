import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parseCookie as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { ENV } from "./env";

export const GITHUB_CALLBACK_PATH = "/api/auth/github/callback";
export const GITHUB_LOGIN_PATH = "/api/auth/github/login";
export const GITHUB_TRANSACTION_COOKIE = "__Host-github_oauth";
const TRANSACTION_TTL_MS = 10 * 60 * 1000;

export type GitHubTransaction = {
  state: string;
};

export type GitHubIdentity = {
  openId: string;
  email: string;
  name: string | null;
};

type FetchLike = typeof fetch;

function randomBase64Url(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

export function createGitHubTransaction(): GitHubTransaction {
  return {
    state: randomBase64Url(32),
  };
}

export function encodeGitHubTransaction(transaction: GitHubTransaction) {
  return Buffer.from(JSON.stringify(transaction)).toString("base64url");
}

export function decodeGitHubTransaction(value: string | undefined): GitHubTransaction | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GitHubTransaction>;
    if (typeof parsed.state !== "string" || parsed.state.length < 32) {
      return null;
    }
    return { state: parsed.state };
  } catch {
    return null;
  }
}

export function transactionMatchesGitHubState(transaction: GitHubTransaction | null, state: string | undefined) {
  if (!transaction || !state) return false;
  const expected = Buffer.from(transaction.state);
  const received = Buffer.from(state);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createGitHubAuthorizationUrl(transaction: GitHubTransaction, redirectUri?: string) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error("GITHUB_CLIENT_ID is required for GitHub login");
  }
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
  }
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", transaction.state);
  return url.toString();
}

export async function exchangeGitHubAuthorizationCode(
  code: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
  }

  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("GitHub token exchange request failed");
  }

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(data.error ? `GitHub error: ${data.error}` : "Missing access_token from GitHub");
  }

  return data.access_token;
}

export async function fetchGitHubUser(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GitHubIdentity> {
  const userResponse = await fetchImpl("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "user-agent": "Money-Tracker-App",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!userResponse.ok) {
    throw new Error("Failed to fetch user from GitHub");
  }

  const userJson = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };

  let primaryEmail = userJson.email;
  if (!primaryEmail) {
    // If email is private on GitHub, fetch user emails list
    const emailsResponse = await fetchImpl("https://api.github.com/user/emails", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": "Money-Tracker-App",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (emailsResponse.ok) {
      const emailsList = (await emailsResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primaryVerified = emailsList.find(e => e.primary && e.verified);
      const verified = emailsList.find(e => e.verified);
      primaryEmail = primaryVerified?.email || verified?.email || emailsList[0]?.email || null;
    }
  }

  if (!primaryEmail) {
    primaryEmail = `${userJson.login}@users.noreply.github.com`;
  }

  return {
    openId: `github:${userJson.id}`,
    email: primaryEmail.trim().toLowerCase(),
    name: userJson.name?.trim() || userJson.login,
  };
}

export function readGitHubTransaction(req: Request) {
  return decodeGitHubTransaction(parseCookieHeader(req.headers.cookie ?? "")[GITHUB_TRANSACTION_COOKIE]);
}

export const githubTransactionCookieMaxAge = TRANSACTION_TTL_MS;
