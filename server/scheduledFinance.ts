import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { processScheduledBillReminder, processScheduledRecurring } from "./db";
import logger from "./_core/logger";

async function requireTaskUid(req: Request) {
  const user = await sdk.authenticateRequest(req);
  if (!user.isCron || !user.taskUid) throw new Error("অননুমোদিত নির্ধারিত কাজ");
  return user.taskUid;
}

export async function runScheduledRecurring(req: Request, res: Response) {
  try {
    const result = await processScheduledRecurring(await requireTaskUid(req));
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Scheduled recurring] failed");
    res.status(500).json({ ok: false, error: "নির্ধারিত পুনরাবৃত্ত লেনদেন চালানো যায়নি" });
  }
}

export async function runScheduledBillReminder(req: Request, res: Response) {
  try {
    const result = await processScheduledBillReminder(await requireTaskUid(req));
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Scheduled bill reminder] failed");
    res.status(500).json({ ok: false, error: "নির্ধারিত বিল স্মরণ পরীক্ষা করা যায়নি" });
  }
}
