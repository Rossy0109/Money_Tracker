import type { Request, Response } from "express";
import { createCipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import * as financeDb from "./db";
import { executeCloudBackup } from "./cloudBackupService";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

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

function hasValidAdminPassword(candidate: string) {
  if (!candidate || !ENV.adminAccessPassword) return false;
  const expected = Buffer.from(ENV.adminAccessPassword);
  const received = Buffer.from(candidate);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

async function verifyBackupAuthorization(req: Request): Promise<boolean> {
  // 1. Check if admin password provided in header
  const adminPasswordHeader = req.headers["x-admin-password"];
  if (typeof adminPasswordHeader === "string" && hasValidAdminPassword(adminPasswordHeader)) {
    return true;
  }

  // 2. Check if admin password provided in JSON body
  if (req.body && typeof req.body.adminPassword === "string" && hasValidAdminPassword(req.body.adminPassword)) {
    return true;
  }

  // 3. Check authenticated session / cron
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron) {
      return true;
    }
    if (user.role === "admin") {
      return true;
    }
  } catch {
    // Unauthenticated request
  }

  return false;
}

export async function runScheduledBackup(req: Request, res: Response): Promise<void> {
  const isAuthorized = await verifyBackupAuthorization(req);
  if (!isAuthorized) {
    res.status(403).json({
      success: false,
      error: "অননুমোদিত ব্যাকআপ অনুরোধ: অ্যাডমিন বা ক্রন অধিকার আবশ্যক",
    });
    return;
  }

  try {
    const adminUsers = await financeDb.listUsersForAdmin();
    const activeUsers = adminUsers.filter(u => u.status === "active");

    let totalProjectsBackedUp = 0;
    const backupResults = [];

    for (const user of activeUsers) {
      const projects = await financeDb.listProjects(user.id);
      for (const project of projects) {
        const cloudResult = await executeCloudBackup(user.id, project.id);
        backupResults.push(cloudResult);
        totalProjectsBackedUp++;
      }
    }

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      backedUpProjectsCount: totalProjectsBackedUp,
      details: backupResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: String(error),
    });
  }
}

