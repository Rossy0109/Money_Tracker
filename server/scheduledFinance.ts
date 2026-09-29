import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { timingSafeCompare } from "./timingSafe";
import {
  cleanupOldFailedLoginAttempts,
  processBillReminderSweep,
  processRecurringSweep,
  processScheduledBillReminder,
  processScheduledRecurring,
} from "./db";
import logger from "./_core/logger";

async function hasValidCronSecret(candidate: string) {
  const expected =
    process.env.CRON_SECRET ||
    process.env.BACKUP_CRON_SECRET ||
    ENV.backupCronSecret;
  if (!candidate || !expected) return false;
  return timingSafeCompare(candidate, expected);
}

async function requireTaskUid(req: Request) {
  // Vercel Cron / GitHub Actions authenticate with the cron secret.
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    if (await hasValidCronSecret(authHeader.slice(7).trim())) {
      const taskUid =
        typeof req.body?.taskUid === "string"
          ? req.body.taskUid
          : "vercel-cron";
      return taskUid;
    }
  }
  const headerSecret = req.headers["x-cron-secret"];
  if (typeof headerSecret === "string" && (await hasValidCronSecret(headerSecret))) {
    const taskUid =
      typeof req.body?.taskUid === "string" ? req.body.taskUid : "vercel-cron";
    return taskUid;
  }
  const user = await sdk.authenticateRequest(req);
  if (!user.isCron || !user.taskUid) throw new Error("অননুমোদিত নির্ধারিত কাজ");
  return user.taskUid;
}

async function requireCronSecret(req: Request) {
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    if (await hasValidCronSecret(authHeader.slice(7).trim())) return;
  }
  const headerSecret = req.headers["x-cron-secret"];
  if (typeof headerSecret === "string" && (await hasValidCronSecret(headerSecret)))
    return;
  throw new Error("অননুমোদিত নির্ধারিত কাজ");
}

export async function runScheduledRecurring(req: Request, res: Response) {
  try {
    const result = await processScheduledRecurring(await requireTaskUid(req));
    try {
      await cleanupOldFailedLoginAttempts();
    } catch {
      // Non-blocking: lockout cleanup is best-effort
    }
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "[Scheduled recurring] failed"
    );
    res
      .status(500)
      .json({ ok: false, error: "নির্ধারিত পুনরাবৃত্ত লেনদেন চালানো যায়নি" });
  }
}

export async function runScheduledBillReminder(req: Request, res: Response) {
  try {
    const result = await processScheduledBillReminder(
      await requireTaskUid(req)
    );
    try {
      await cleanupOldFailedLoginAttempts();
    } catch {
      // Non-blocking: lockout cleanup is best-effort
    }
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "[Scheduled bill reminder] failed"
    );
    res
      .status(500)
      .json({ ok: false, error: "নির্ধারিত বিল স্মরণ পরীক্ষা করা যায়নি" });
  }
}

export async function executeDailySweep(): Promise<{
  recurring: { templates: number; created: number; failed: number };
  billReminders: { checked: number; reminded: number };
}> {
  const [recurring, bills] = await Promise.all([
    processRecurringSweep().catch(error => ({
      templates: 0,
      created: 0,
      failed: -1,
      error: error instanceof Error ? error.message : String(error),
    })),
    processBillReminderSweep().catch(error => ({
      checked: 0,
      reminded: 0,
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);
  try {
    await cleanupOldFailedLoginAttempts();
  } catch {
    // Non-blocking: lockout cleanup is best-effort
  }
  return { recurring, billReminders: bills };
}

export async function runDailySweep(req: Request, res: Response) {
  try {
    await requireCronSecret(req);
    const result = await executeDailySweep();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message === "অননুমোদিত নির্ধারিত কাজ";
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)) },
      "[Daily sweep] failed"
    );
    res
      .status(unauthorized ? 403 : 500)
      .json({ ok: false, error: "নির্ধারিত দৈনিক যাচাই চালানো যায়নি" });
  }
}
