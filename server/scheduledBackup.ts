import type { Request, Response } from "express";
import * as financeDb from "./db";
import {
  executeCloudBackup,
  normalizeBackupForChecksum,
  type CloudBackupResult,
} from "./cloudBackupService";
import { sdk } from "./_core/sdk";
import { timingSafeCompare } from "./timingSafe";
import logger from "./_core/logger";
import { ENV } from "./_core/env";
import { isAdminRoleUser } from "./_core/rbac";
import { keyIdForSecret } from "./backupIntegrity";
import { extractAuditContext } from "./_core/auditContext";
import {
  sha256Hex,
  randomBytesHex,
  aesGcmEncrypt,
  hexToBytes,
  bytesToHex,
} from "../shared/platform/crypto";

export async function encryptPayload(
  data: string,
  secretKey: string
): Promise<{ iv: string; encrypted: string; tag: string; keyId: string }> {
  const keyHex = await sha256Hex(secretKey);
  const ivBytes = hexToBytes(randomBytesHex(12));
  const result = await aesGcmEncrypt(keyHex, ivBytes, data);

  return {
    iv: bytesToHex(ivBytes),
    encrypted: result.encrypted,
    tag: result.tag,
    keyId: await keyIdForSecret(secretKey),
  };
}

async function hasValidSecret(candidate: string, expectedSecret?: string) {
  if (!candidate || !expectedSecret) return false;
  return timingSafeCompare(candidate, expectedSecret);
}

function hasValidCronSecret(candidate: string) {
  // Dedicated cron secrets only — admin elevation password is never accepted.
  // Read process.env at call time so tests can stub env after import.
  const cronSecret =
    process.env.CRON_SECRET ||
    process.env.BACKUP_CRON_SECRET ||
    ENV.backupCronSecret;
  return hasValidSecret(candidate, cronSecret);
}

export async function verifyBackupAuthorization(req: Request): Promise<boolean> {
  // 1. Check Authorization Bearer token (standard Vercel Cron / GitHub Actions header)
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (await hasValidCronSecret(token)) {
      return true;
    }
  }

  // 2. Check dedicated Cron Secret header (X-Cron-Secret)
  const cronSecretHeader = req.headers["x-cron-secret"];
  if (
    typeof cronSecretHeader === "string" &&
    (await hasValidCronSecret(cronSecretHeader))
  ) {
    return true;
  }

  // 3. Check if cron secret provided in JSON body
  if (req.body) {
    if (
      typeof req.body.cronSecret === "string" &&
      (await hasValidCronSecret(req.body.cronSecret))
    ) {
      return true;
    }
  }

  // 4. Check authenticated session / cron
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron) {
      return true;
    }
    // RBAC is authoritative — legacy users.role must not grant backup access.
    if (await isAdminRoleUser(user.id)) {
      return true;
    }
  } catch {
    // Unauthenticated request
  }

  return false;
}

/**
 * Build a safe, one-line diagnostic from a thrown value. Prefers the typed
 * MySQL error fields (code / errno / sqlState / sqlMessage) that String(error)
 * silently drops, but never includes data values or stack traces.
 */
function dbErrorFragment(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      code?: unknown;
      errno?: unknown;
      sqlState?: unknown;
      sqlMessage?: unknown;
    };
    const parts: string[] = [];
    if (typeof e.code === "string" && e.code) parts.push(e.code);
    if (typeof e.errno === "number") parts.push(`errno=${e.errno}`);
    if (typeof e.sqlState === "string" && e.sqlState)
      parts.push(`sqlState=${e.sqlState}`);
    if (typeof e.sqlMessage === "string" && e.sqlMessage)
      parts.push(e.sqlMessage);
    if (parts.length) return parts.join(" ");
  }
  return String(error);
}

/**
 * Verify backup integrity after upload by re-reading and checking checksum.
 * Returns true if the backup is verifiable, false otherwise.
 */
async function verifyBackupIntegrity(
  userId: number,
  projectId: number,
  expectedVerifyChecksum: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const reExport = await financeDb.exportProjectBackup(userId, projectId);
    // Compare normalized exports: `exportedAt` is regenerated on every export
    // and row order is not guaranteed, so hashing the raw re-export could
    // never match the upload-time hash.
    const reChecksum = await sha256Hex(
      JSON.stringify(normalizeBackupForChecksum(reExport), null, 2)
    );
    if (reChecksum === expectedVerifyChecksum) {
      return { verified: true };
    }
    return {
      verified: false,
      error: `Checksum mismatch: expected ${expectedVerifyChecksum.slice(0, 12)}..., got ${reChecksum.slice(0, 12)}...`,
    };
  } catch (error) {
    return { verified: false, error: `Verification failed: ${dbErrorFragment(error)}` };
  }
}

/**
 * Counts from the most recent scheduled run. HTTP 200 alone never proved the
 * payload reached cloud storage (upload failures are counted, not thrown), so
 * callers — including the daily-backup workflow — must assert on these numbers.
 */
export interface ScheduledBackupSummary {
  projects: number;
  stored: number;
  verified: number;
  failed: number;
}

export async function executeScheduledBackup(): Promise<ScheduledBackupSummary> {
  const adminUsers = await financeDb.listUsersForAdmin();
  const activeUsers = adminUsers.filter(u => u.status === "active");

  let totalProjectsBackedUp = 0;
  let verifiedCount = 0;
  let failedCount = 0;
  const backupResults = [];

  for (const user of activeUsers) {
    const projects = await financeDb.listProjects(user.id);
    for (const project of projects) {
      const cloudResult: CloudBackupResult & {
        integrityVerified?: boolean;
        integrityError?: string;
      } = await executeCloudBackup(user.id, project.id);

      if (cloudResult.success && cloudResult.checksum) {
        const verification = await verifyBackupIntegrity(
          user.id,
          project.id,
          cloudResult.verifyChecksum
        );
        if (verification.verified) {
          verifiedCount++;
          cloudResult.integrityVerified = true;
        } else {
          failedCount++;
          cloudResult.integrityVerified = false;
          cloudResult.integrityError = verification.error;
          logger.warn(
            `Backup integrity check failed for project ${project.id}: ${verification.error}`
          );
        }
      } else if (!cloudResult.success) {
        failedCount++;
      }

      backupResults.push(cloudResult);
      totalProjectsBackedUp++;
    }
  }

  const storedCount = backupResults.filter(r => r.success).length;
  await financeDb.logAudit({
    actorUserId: activeUsers[0]?.id ?? (await financeDb.systemActorUserId()),
    action:
      failedCount === 0 && totalProjectsBackedUp > 0
        ? "backup_created"
        : "update",
    entityType:
      failedCount === 0 && totalProjectsBackedUp > 0
        ? "cloud_backup"
        : "cloud_backup_failed",
    summary: `Scheduled backup completed: ${totalProjectsBackedUp} projects, ${storedCount} stored, ${verifiedCount} verified, ${failedCount} failed integrity`,
  });

  return {
    projects: totalProjectsBackedUp,
    stored: storedCount,
    verified: verifiedCount,
    failed: failedCount,
  };
}

export async function runScheduledBackup(
  req: Request,
  res: Response
): Promise<void> {
  const isAuthorized = await verifyBackupAuthorization(req);
  if (!isAuthorized) {
    res.status(403).json({
      success: false,
      error: "অননুমোদিত ব্যাকআপ অনুরোধ: ক্রন সিক্রেট আবশ্যক",
    });
    return;
  }

  try {
    const summary = await executeScheduledBackup();
    if (summary.failed > 0) {
      // Anything that failed to store or verify must surface as an HTTP error:
      // Vercel Cron and the GitHub workflow both treat non-2xx as failure.
      res.status(500).json({
        success: false,
        error: `Scheduled backup completed with ${summary.failed} failed project(s)`,
        ...summary,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.status(200).json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Scheduled backup failed: ${dbErrorFragment(error)}`,
    });
  }
}
