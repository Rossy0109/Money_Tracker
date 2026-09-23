/**
 * Audit Context — Extracts request metadata for audit trail.
 *
 * Provides a helper to extract ip, userAgent, and requestId from the
 * Express request object for use in logAudit calls.
 */
import type { Request } from "express";
import { randomUUID } from "node:crypto";

export interface AuditContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/**
 * Extract audit context from an Express request.
 * Returns ipAddress, userAgent, and requestId for the audit trail.
 */
export function extractAuditContext(req?: Request | null): AuditContext {
  if (!req) {
    return { ipAddress: null, userAgent: null, requestId: null };
  }

  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] as string ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = (req.headers["user-agent"] as string) || null;

  const requestId =
    (req.headers["x-request-id"] as string) ||
    randomUUID();

  return { ipAddress, userAgent, requestId };
}
