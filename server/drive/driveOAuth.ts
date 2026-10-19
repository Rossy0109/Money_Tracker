import { parseCookie as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { ENV } from "../_core/env";
import { activeBackupKeySecret } from "../backupKeys";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  bytesToHex,
  decodeBase64Url,
  encodeBase64Url,
  hexToBytes,
  randomBytesBase64Url,
  randomBytesHex,
  sha256Base64Url,
  sha256Hex,
  timingSafeEqual,
} from "../../shared/platform/crypto";
import type { DriveConnectionRecord } from "./types";

/**
 * Google Drive backup integration.
 *
 * This is a *second*, independent OAuth flow from sign-in: it only asks for
 * `drive.file`, so the app is confined to files it created itself. Tokens are
 * persisted encrypted (AES-256-GCM) and the access token is refreshed lazily.
 */
export const DRIVE_LOGIN_PATH = "/api/drive/oauth/start";
export const DRIVE_CALLBACK_PATH = "/api/drive/oauth/callback";
export const DRIVE_TRANSACTION_COOKIE = "__Host-drive_oauth";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_FOLDER_NAME = "Money_Tracker";
/** Refresh an access token this many ms before it actually expires. */
const EXPIRY_SKEW_MS = 60 * 1000;

type FetchLike = typeof fetch;

export interface DriveTransaction {
  state: string;
  verifier: string;
  userId: number;
  rootFolderName: string;
}

export interface DriveTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresIn: number;
}

function requireDriveConfiguration() {
  if (
    !ENV.googleDriveClientId ||
    !ENV.googleDriveClientSecret ||
    !ENV.googleDriveRedirectUri
  ) {
    throw new Error("Google Drive OAuth configuration is incomplete");
  }
}

/** True when the client id/secret/redirect are all configured. */
export function isDriveConfigured(): boolean {
  return Boolean(
    ENV.googleDriveClientId &&
      ENV.googleDriveClientSecret &&
      ENV.googleDriveRedirectUri
  );
}

export function driveRedirectUri(): string {
  return ENV.googleDriveRedirectUri;
}

export function createDriveTransaction(
  userId: number,
  rootFolderName = DEFAULT_FOLDER_NAME
): DriveTransaction {
  return {
    state: randomBytesBase64Url(32),
    verifier: randomBytesBase64Url(64),
    userId,
    rootFolderName: rootFolderName.trim() || DEFAULT_FOLDER_NAME,
  };
}

export function encodeDriveTransaction(transaction: DriveTransaction): string {
  return encodeBase64Url(JSON.stringify(transaction));
}

export function decodeDriveTransaction(
  value: string | undefined
): DriveTransaction | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value)) as Partial<DriveTransaction>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.userId !== "number" ||
      !Number.isFinite(parsed.userId) ||
      parsed.userId <= 0 ||
      parsed.state.length < 32 ||
      parsed.verifier.length < 64 ||
      (parsed.rootFolderName !== undefined &&
        typeof parsed.rootFolderName !== "string")
    ) {
      return null;
    }
    return {
      state: parsed.state,
      verifier: parsed.verifier,
      userId: parsed.userId,
      rootFolderName:
        (parsed.rootFolderName || "").trim() || DEFAULT_FOLDER_NAME,
    };
  } catch {
    return null;
  }
}

export function transactionMatchesState(
  transaction: DriveTransaction | null,
  state: string | undefined
): boolean {
  if (!transaction || !state) return false;
  return timingSafeEqual(transaction.state, state);
}

export function readDriveTransaction(req: Request): DriveTransaction | null {
  return decodeDriveTransaction(
    parseCookieHeader(req.headers.cookie ?? "")[DRIVE_TRANSACTION_COOKIE]
  );
}

/** Consent URL including the PKCE S256 challenge. */
export async function buildDriveAuthorizationUrl(
  transaction: DriveTransaction
): Promise<string> {
  requireDriveConfiguration();
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", ENV.googleDriveClientId);
  url.searchParams.set("redirect_uri", ENV.googleDriveRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("code_challenge", await sha256Base64Url(transaction.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

function parseTokenResponse(data: Record<string, unknown>): DriveTokenResponse {
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Google Drive token response missing access_token");
  }
  const expiresIn =
    typeof data.expires_in === "number"
      ? data.expires_in
      : typeof data.expires_in === "string"
        ? Number.parseInt(data.expires_in, 10)
        : Number.NaN;
  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === "string" && data.refresh_token
        ? data.refresh_token
        : null,
    scope: typeof data.scope === "string" ? data.scope : null,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
  };
}

export async function exchangeDriveAuthorizationCode(
  code: string,
  transaction: DriveTransaction,
  fetchImpl: FetchLike = fetch
): Promise<DriveTokenResponse> {
  requireDriveConfiguration();
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleDriveClientId,
      client_secret: ENV.googleDriveClientSecret,
      redirect_uri: ENV.googleDriveRedirectUri,
      grant_type: "authorization_code",
      code_verifier: transaction.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google Drive token exchange failed");
  return parseTokenResponse((await response.json()) as Record<string, unknown>);
}

export async function refreshDriveAccessToken(
  refreshToken: string,
  fetchImpl: FetchLike = fetch
): Promise<DriveTokenResponse> {
  requireDriveConfiguration();
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: ENV.googleDriveClientId,
      client_secret: ENV.googleDriveClientSecret,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Google Drive token refresh failed");
  const parsed = parseTokenResponse(
    (await response.json()) as Record<string, unknown>
  );
  // Google omits refresh_token on refresh; keep the caller's.
  return { ...parsed, refreshToken: parsed.refreshToken ?? refreshToken };
}

/**
 * Derive the 32-byte AES-GCM key (hex) used for token-at-rest encryption.
 * Prefers a dedicated `GOOGLE_DRIVE_TOKEN_KEY`, then the active backup key so a
 * deployment that already holds `BACKUP_ENCRYPTION_KEY` needs no new secret.
 */
async function driveTokenKeyHex(): Promise<string> {
  const material =
    process.env.GOOGLE_DRIVE_TOKEN_KEY ||
    activeBackupKeySecret() ||
    ENV.sessionSecret;
  if (!material) {
    throw new Error(
      "Google Drive token encryption key is not configured " +
        "(set GOOGLE_DRIVE_TOKEN_KEY or BACKUP_ENCRYPTION_KEY)"
    );
  }
  return sha256Hex(`money-tracker:google-drive-token:v1:${material}`);
}

/** Encrypt a token as `ivHex:tagHex:cipherHex`. */
export async function encryptDriveToken(plain: string): Promise<string> {
  const keyHex = await driveTokenKeyHex();
  const iv = hexToBytes(randomBytesHex(12));
  const { encrypted, tag } = await aesGcmEncrypt(keyHex, iv, plain);
  return `${bytesToHex(iv)}:${tag}:${encrypted}`;
}

/** Decrypt a value produced by {@link encryptDriveToken}. */
export async function decryptDriveToken(blob: string): Promise<string> {
  const parts = blob.split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted Drive token");
  const [ivHex, tag, encrypted] = parts;
  const keyHex = await driveTokenKeyHex();
  return aesGcmDecrypt(keyHex, hexToBytes(ivHex), encrypted, tag);
}

function tokenIsFresh(connection: DriveConnectionRecord): boolean {
  if (!connection.accessTokenEnc) return false;
  if (!connection.tokenExpiresAt) return false;
  return new Date(connection.tokenExpiresAt).getTime() - EXPIRY_SKEW_MS > Date.now();
}

/**
 * Resolve a usable bearer token for a stored connection, refreshing (and
 * persisting) the access token when it is missing or near expiry. Throws when
 * the connection is revoked or the refresh token is gone — callers should treat
 * that as "reconnect required".
 */
export async function getAccessToken(
  connection: DriveConnectionRecord | null | undefined,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  if (!connection) throw new Error("Google Drive is not connected");
  if (connection.revokedAt) throw new Error("Google Drive connection was revoked");
  if (tokenIsFresh(connection)) {
    return decryptDriveToken(connection.accessTokenEnc as string);
  }
  if (!connection.refreshTokenEnc) {
    throw new Error("Google Drive refresh token is missing; reconnect required");
  }

  const refreshToken = await decryptDriveToken(connection.refreshTokenEnc);
  const refreshed = await refreshDriveAccessToken(refreshToken, fetchImpl);
  const accessTokenEnc = await encryptDriveToken(refreshed.accessToken);
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);

  // Best-effort persistence; a failed write only costs an extra refresh later.
  if (Number.isFinite(connection.userId) && connection.userId > 0) {
    try {
      const { updateDriveAccessToken } = await import("../backupDb");
      await updateDriveAccessToken(connection.userId, accessTokenEnc, tokenExpiresAt);
    } catch {
      /* non-fatal */
    }
  }

  return refreshed.accessToken;
}

export const driveTransactionCookieMaxAge = TRANSACTION_TTL_MS;
export { DEFAULT_FOLDER_NAME };
