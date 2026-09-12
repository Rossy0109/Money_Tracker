import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_MS } from "../../shared/const";
import { ENV } from "./env";
import { getAdminSessionCookieOptions } from "./cookies";
import { timingSafeCompare } from "../timingSafe";

export type AdminElevationPayload = {
  userId: number;
  openId: string;
  role: "admin";
  issuedAt: number;
  expiresAt: number;
};

/**
 * Returns HMAC secret key for signing admin elevation tokens.
 * Uses SESSION_SECRET or JWT_SECRET.
 */
function getAdminSecret(): string {
  const secret = ENV.sessionSecret || ENV.cookieSecret || "admin-elevation-fallback-secret";
  return secret;
}

/**
 * Create a signed HMAC-SHA256 admin elevation token valid for 15 minutes.
 * Format: `<base64url(payload)>.<hex(hmac)>`
 */
export function issueAdminToken(userId: number, openId: string, ttlMs: number = ADMIN_SESSION_TTL_MS): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const payload: AdminElevationPayload = {
    userId,
    openId,
    role: "admin",
    issuedAt,
    expiresAt,
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getAdminSecret()).update(payloadEncoded).digest("hex");

  return `${payloadEncoded}.${signature}`;
}

/**
 * Verifies an admin elevation token using constant-time timing-safe comparison.
 * Returns the payload if valid and unexpired; otherwise null.
 */
export function verifyAdminToken(token: string | null | undefined): AdminElevationPayload | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getAdminSecret()).update(payloadEncoded).digest("hex");

  // Constant-time comparison between signature and expectedSignature
  if (!timingSafeCompare(signature, expectedSignature)) {
    return null;
  }

  try {
    const raw = Buffer.from(payloadEncoded, "base64url").toString("utf8");
    const payload = JSON.parse(raw) as AdminElevationPayload;

    if (
      typeof payload.userId !== "number" ||
      typeof payload.openId !== "string" ||
      payload.role !== "admin" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Reads and validates admin token from request cookie or headers.
 */
export function extractAdminTokenFromRequest(req: Request): string | null {
  // 1. Check custom header x-admin-token
  const customHeader = req.headers?.["x-admin-token"];
  if (typeof customHeader === "string" && customHeader.trim().length > 0) {
    return customHeader.trim();
  }

  // 2. Check Authorization header: AdminBearer <token>
  const authHeader = req.headers?.["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("AdminBearer ")) {
    return authHeader.slice(12).trim();
  }

  // 3. Check cookies
  const cookieHeader = req.headers?.["cookie"];
  if (cookieHeader) {
    const parsed = parseCookieHeader(cookieHeader);
    const token = parsed[ADMIN_SESSION_COOKIE];
    if (token) {
      return token;
    }
  }

  return null;
}

/**
 * Sets the admin elevation token cookie with HttpOnly; SameSite=Strict; Secure
 */
export function setAdminElevationCookie(req: Request, res: Response, token: string): void {
  if (!res || typeof res.cookie !== "function") {
    return;
  }
  const options = getAdminSessionCookieOptions(req);
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    ...options,
    maxAge: ADMIN_SESSION_TTL_MS,
  });
}

/**
 * Clears the admin elevation token cookie
 */
export function clearAdminElevationCookie(req: Request, res: Response): void {
  if (!res || typeof res.clearCookie !== "function") {
    return;
  }
  const options = getAdminSessionCookieOptions(req);
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    ...options,
    maxAge: -1,
  });
}
