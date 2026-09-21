import type { Request, Response } from "express";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import * as financeDb from "./db";
import { executeCloudBackup } from "./cloudBackupService";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { timingSafeCompare } from "./timingSafe";
import logger from "./_core/logger";
import { isAdminRoleUser } from "./_core/rbac";

export function encryptPayload(data: string, secretKey: string): { iv: string; encrypted: string; tag: string } {
  const key = createHash("sha256").update(secretKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    iv: iv.toString("hex"),
    encrypted,
    tag,
  };
}

function hasValidSecret(candidate: string, expectedSecret?: string) {
  if (!candidate || !expectedSecret) return false;
  return timingSafeCompare(candidate, expectedSecret);
}

function hasValidCronSecret(candidate: string) {
  const cronSecret = process.env.CRON_SECRET || process.env.BACKUP_CRON_SECRET;
  return hasValidSecret(candidate, cronSecret);
}

async function verifyBackupAuthorization(req: Request): Promise<boolean> {
  // 1. Check Authorization Bearer token (standard Vercel Cron / GitHub Actions header)
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (hasValidCronSecret(token)) {
      return true;
    }
  }

  // 2. Check dedicated Cron Secret header (X-Cron-Secret)
  const cronSecretHeader = req.headers["x-cron-secret"];
  if (typeof cronSecretHeader === "string" && hasValidCronSecret(cronSecretHeader)) {
    return true;
  }

  // 3. Check if cron secret provided in JSON body
  if (req.body) {
    if (typeof req.body.cronSecret === "string" && hasValidCronSecret(req.body.cronSecret)) {
      return true;
    }
  }

  // 4. Check authenticated session / cron
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron) {
      return true;
    }
    // Check legacy admin role OR RBAC admin role
    if (user.role === "admin" || await isAdminRoleUser(user.id)) {
      return true;
    }
  } catch {
    // Unauthenticated request
  }

  return false;
}

/**
 * Verify backup integrity after upload by re-reading and checking checksum.
 * Returns true if the backup is verifiable, false otherwise.
 */
async function verifyBackupIntegrity(
  userId: number,
  projectId: number,
  expectedChecksum: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const reExport = await financeDb.exportProjectBackup(userId, projectId);
    const reChecksum = createHash("sha256").update(JSON.stringify(reExport, null, 2)).digest("hex");
    if (reChecksum === expectedChecksum) {
      return { verified: true };
    }
    return { verified: false, error: `Checksum mismatch: expected ${expectedChecksum.slice(0, 12)}..., got ${reChecksum.slice(0, 12)}...` };
  } catch (error) {
    return { verified: false, error: `Verification failed: ${String(error)}` };
  }
}

export async function runScheduledBackup(req: Request, res: Response): Promise<void> {
  const isAuthorized = await verifyBackupAuthorization(req);
  if (!isAuthorized) {
    res.status(403).json({
      success: false,
      error: "অননুমোদিত ব্যাকআপ অনুরোধ: ক্রন সিক্রেট আবশ্যক",
    });
    return;
  }

  try {
    const adminUsers = await financeDb.listUsersForAdmin();
    const activeUsers = adminUsers.filter(u => u.status === "active");

    let totalProjectsBackedUp = 0;
    let verifiedCount = 0;
    let failedCount = 0;
    const backupResults = [];

    for (const user of activeUsers) {
      const projects = await financeDb.listProjects(user.id);
      for (const project of projects) {
        const cloudResult = await executeCloudBackup(user.id, project.id);

        // Post-upload integrity verification
        if (cloudResult.success && cloudResult.checksum) {
          const verification = await verifyBackupIntegrity(user.id, project.id, cloudResult.checksum);
          if (verification.verified) {
            verifiedCount++;
            (cloudResult as any).integrityVerified = true;
          } else {
            failedCount++;
            (cloudResult as any).integrityVerified = false;
            (cloudResult as any).integrityError = verification.error;
            logger.warn(`Backup integrity check failed for project ${project.id}: ${verification.error}`);
          }
        }

        backupResults.push(cloudResult);
        totalProjectsBackedUp++;
      }
    }

    // Log the scheduled backup audit
    await financeDb.logAudit({
      actorUserId: 0,
      action: "create",
      entityType: "cloud_backup",
      summary: `Scheduled backup completed: ${totalProjectsBackedUp} projects, ${verifiedCount} verified, ${failedCount} failed integrity`,
    });

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      backedUpProjectsCount: totalProjectsBackedUp,
      integrityVerified: verifiedCount,
      integrityFailed: failedCount,
      details: backupResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: String(error),
    });
  }
}

