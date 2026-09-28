import { createWorkerApp } from "./app";
import { createWorkerDb } from "./db";
import { setDbHandle } from "../server/_core/dbConnection";
import { setRateLimitStore } from "../server/_core/rateLimiter";
import { createKVRateLimitStore } from "./rateLimitStore";
import { handleScheduled } from "./cron";
import type { WorkerEnv } from "./env";

let app: ReturnType<typeof createWorkerApp> | null = null;
let rbacInitialized = false;

function getApp(env: WorkerEnv) {
  if (!app) {
    setDbHandle(createWorkerDb(env));
    if (env.RATE_LIMIT_KV) {
      setRateLimitStore(createKVRateLimitStore(env.RATE_LIMIT_KV));
    }
    app = createWorkerApp(env);
  }
  return app;
}

async function ensureRbacInitialized() {
  if (rbacInitialized) return;
  rbacInitialized = true;
  try {
    const { initializeRBACSystem } = await import("../server/_core/rbac-initializer");
    await initializeRBACSystem();
  } catch (err) {
    console.error("RBAC initialization failed:", err);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    try {
      await ensureRbacInitialized();
      const app = getApp(env);
      return await app.fetch(request, env, ctx);
    } catch (err) {
      console.error(
        "Worker fetch failed:",
        err instanceof Error ? (err.stack || err.message) : String(err)
      );
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    await ensureRbacInitialized();
    ctx.waitUntil(handleScheduled(event, env, ctx));
  },
};
