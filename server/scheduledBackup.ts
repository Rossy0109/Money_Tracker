import type { Request, Response } from "express";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import * as financeDb from "./db";
import { executeCloudBackup } from "./cloudBackupService";

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

export async function runScheduledBackup(_req: Request, res: Response): Promise<void> {
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
