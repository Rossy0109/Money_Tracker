import type { Context, Next } from "hono";
import type { WorkerEnv } from "./env";
import { checkRateLimit } from "../server/_core/rateLimiter";

export function rateLimitMiddleware(env: WorkerEnv, max: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    if (env.NODE_ENV === "test") {
      await next();
      return;
    }

    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown-ip";

    try {
      await checkRateLimit(ip, {
        windowMs,
        max,
        keyPrefix: "worker-ip",
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    await next();
  };
}
