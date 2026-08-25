import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { ENV } from "./env";

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_LOGIN_PATH = "/api/auth/google/login";
export const GOOGLE_TRANSACTION_COOKIE = "__Host-google_oauth";
const GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const TRANSACTION_TTL_MS = 10 * 60 * 1000;

type FetchLike = typeof fetch;

export type GoogleDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

export type GoogleTransaction = {
  state: string;
  nonce: string;
  verifier: string;
};

export type GoogleIdentity = {
  openId: string;
  email: string;
  name: string | null;
};

function randomBase64Url(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

function requireGoogleConfiguration() {
  if (ENV.authMode !== "google") {
    throw new Error("Google OAuth is disabled outside AUTH_MODE=google");
  }
  if (!ENV.googleOAuthClientId || !ENV.googleOAuthClientSecret || !ENV.googleOAuthRedirectUri) {
    throw new Error("Google OAuth Preview configuration is incomplete");
  }
  if (!ENV.sessionSecret) {
    throw new Error("SESSION_SECRET is required when AUTH_MODE=google");
  }

  const redirect = new URL(ENV.googleOAuthRedirectUri);
  if (redirect.pathname !== GOOGLE_CALLBACK_PATH || redirect.search || redirect.hash) {
    throw new Error(`GOOGLE_OAUTH_REDIRECT_URI must end in ${GOOGLE_CALLBACK_PATH}`);
  }
}

function assertGoogleEndpoint(value: string, field: keyof GoogleDiscovery) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith("google.com")) {
    throw new Error(`Unexpected Google discovery ${field}`);
  }
  return url;
}

export async function getGoogleDiscovery(fetchImpl: FetchLike = fetch): Promise<GoogleDiscovery> {
  const response = await fetchImpl(GOOGLE_DISCOVERY_URL, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google discovery request failed");
  const discovery = (await response.json()) as Partial<GoogleDiscovery>;
  if (
    typeof discovery.authorization_endpoint !== "string" ||
    typeof discovery.token_endpoint !== "string" ||
    typeof discovery.jwks_uri !== "string" ||
    !GOOGLE_ISSUERS.includes(discovery.issuer ?? "")
  ) {
    throw new Error("Google discovery response is incomplete");
  }
  assertGoogleEndpoint(discovery.authorization_endpoint, "authorization_endpoint");
  assertGoogleEndpoint(discovery.token_endpoint, "token_endpoint");
  assertGoogleEndpoint(discovery.jwks_uri, "jwks_uri");
  return discovery as GoogleDiscovery;
}

export function createGoogleTransaction(): GoogleTransaction {
  return {
    state: randomBase64Url(32),
    nonce: randomBase64Url(32),
    verifier: randomBase64Url(64),
  };
}

export function encodeGoogleTransaction(transaction: GoogleTransaction) {
  return Buffer.from(JSON.stringify(transaction)).toString("base64url");
}

export function decodeGoogleTransaction(value: string | undefined): GoogleTransaction | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GoogleTransaction>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.verifier !== "string" ||
      parsed.state.length < 32 ||
      parsed.nonce.length < 32 ||
      parsed.verifier.length < 64
    ) {
      return null;
    }
    return { state: parsed.state, nonce: parsed.nonce, verifier: parsed.verifier };
  } catch {
    return null;
  }
}

export function transactionMatchesState(transaction: GoogleTransaction | null, state: string | undefined) {
  if (!transaction || !state) return false;
  const expected = Buffer.from(transaction.state);
  const received = Buffer.from(state);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createGoogleAuthorizationUrl(discovery: GoogleDiscovery, transaction: GoogleTransaction) {
  requireGoogleConfiguration();
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", ENV.googleOAuthClientId);
  url.searchParams.set("redirect_uri", ENV.googleOAuthRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("nonce", transaction.nonce);
  url.searchParams.set("code_challenge", sha256Base64Url(transaction.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  transaction: GoogleTransaction,
  discovery: GoogleDiscovery,
  fetchImpl: FetchLike = fetch,
) {
  requireGoogleConfiguration();
  const response = await fetchImpl(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleOAuthClientId,
      client_secret: ENV.googleOAuthClientSecret,
      redirect_uri: ENV.googleOAuthRedirectUri,
      grant_type: "authorization_code",
      code_verifier: transaction.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const data = (await response.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string" || !data.id_token) {
    throw new Error("Google token response missing id_token");
  }
  return data.id_token;
}

function valuesMatch(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function audienceMatches(audience: unknown, clientId: string) {
  if (typeof audience === "string") return valuesMatch(clientId, audience);
  return Array.isArray(audience) && audience.some(value => typeof value === "string" && valuesMatch(clientId, value));
}

/**
 * Defense in depth for the claims jwtVerify has already cryptographically
 * checked. Keeping this validation pure makes the provider trust boundary
 * directly testable without any real Google credential or network request.
 */
export function validateGoogleIdTokenClaims(
  payload: JWTPayload,
  expectedNonce: string,
  expectedAudience: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): GoogleIdentity {
  if (
    typeof payload.iss !== "string" ||
    !GOOGLE_ISSUERS.includes(payload.iss) ||
    !audienceMatches(payload.aud, expectedAudience) ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSeconds ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.email !== "string" ||
    !payload.email ||
    payload.email_verified !== true ||
    typeof payload.nonce !== "string" ||
    !valuesMatch(payload.nonce, expectedNonce)
  ) {
    throw new Error("Google ID token claims are invalid");
  }
  return {
    openId: `google:${payload.sub}`,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
  };
}

export async function verifyGoogleIdToken(
  idToken: string,
  transaction: GoogleTransaction,
  discovery: GoogleDiscovery,
): Promise<GoogleIdentity> {
  requireGoogleConfiguration();
  const jwks = createRemoteJWKSet(assertGoogleEndpoint(discovery.jwks_uri, "jwks_uri"));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: GOOGLE_ISSUERS,
    audience: ENV.googleOAuthClientId,
  });
  return validateGoogleIdTokenClaims(payload, transaction.nonce, ENV.googleOAuthClientId);
}

export function readGoogleTransaction(req: Request) {
  return decodeGoogleTransaction(parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_TRANSACTION_COOKIE]);
}

export const googleTransactionCookieMaxAge = TRANSACTION_TTL_MS;
