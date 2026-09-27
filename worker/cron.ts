import type { WorkerEnv } from "./env";

/**
 * Map Cloudflare cron trigger expressions to scheduled job handlers.
 *
 * Cloudflare Cron Triggers invoke the Worker's `scheduled` export with a
 * ScheduledEvent containing the cron expression. We map each expression to
 * the corresponding job.
 */
const CRON_SCHEDULES: Record<string, string> = {
  "0 18 * * *": "finance-backup",
  "0 1 * * *": "daily-sweep",
};

export async function handleScheduled(
  event: ScheduledEvent,
  _env: WorkerEnv,
  _ctx: ExecutionContext
): Promise<void> {
  const job = CRON_SCHEDULES[event.cron];
  if (!job) {
    console.warn(`Unknown cron schedule: ${event.cron}`);
    return;
  }

  switch (job) {
    case "finance-backup": {
      const { executeScheduledBackup } = await import("../server/scheduledBackup");
      await executeScheduledBackup();
      break;
    }
    case "daily-sweep": {
      const { executeDailySweep } = await import("../server/scheduledFinance");
      await executeDailySweep();
      break;
    }
  }
}
