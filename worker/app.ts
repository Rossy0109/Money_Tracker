import { Hono } from "hono";
import type { Context } from "hono";
import { appRouter } from "../server/routers.ts";
import { createWorkerContext } from "./context";
import {
  createShimRequest,
  createShimResponse,
  shimToResponse,
  type ShimRequest,
  type ShimResponse,
} from "./httpShim";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { setR2Bucket } from "../server/_core/storageBackend";
import {
  runScheduledRecurring,
  runScheduledBillReminder,
  runDailySweep,
} from "../server/scheduledFinance";
import { runScheduledBackup } from "../server/scheduledBackup";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { TrpcContext } from "../server/_core/context";
import type { WorkerEnv } from "./env";
import { securityHeaders, corsMiddleware } from "./security";
import { rateLimitMiddleware } from "./rateLimit";

type RouteHandler = (
  req: ShimRequest,
  res: ShimResponse
) => void | Promise<void>;

interface CapturedRoute {
  method: string;
  path: string;
  handler: RouteHandler;
}

function createRouteCapture() {
  const routes: CapturedRoute[] = [];
  const mockApp = {
    post(path: string, handler: RouteHandler) {
      routes.push({ method: "POST", path, handler });
    },
    get(path: string, handler: RouteHandler) {
      routes.push({ method: "GET", path, handler });
    },
    all(path: string, handler: RouteHandler) {
      routes.push({ method: "ALL", path, handler });
    },
    use(path: string, handler: RouteHandler) {
      routes.push({ method: "USE", path, handler });
    },
  };
  return { routes, mockApp };
}

export function createWorkerApp(env: WorkerEnv) {
  setR2Bucket(env.R2_BUCKET);
  const app = new Hono();

  app.use("*", securityHeaders(env));
  app.use("*", corsMiddleware(env));

  app.get("/api/healthz", c => {
    return c.json({ ok: true, service: "money-tracker" });
  });

  app.use("/api/auth/*", rateLimitMiddleware(env, 50, 15 * 60 * 1000));
  app.use("/api/oauth/*", rateLimitMiddleware(env, 50, 15 * 60 * 1000));
  app.use("/api/trpc/auth.*", rateLimitMiddleware(env, 50, 15 * 60 * 1000));

  const { routes, mockApp } = createRouteCapture();
  registerOAuthRoutes(mockApp as never);
  registerStorageProxy(mockApp as never);

  const scheduledRoutes: Array<{
    method: string;
    path: string;
    handler: RouteHandler;
  }> = [
    { method: "ALL", path: "/api/scheduled/finance-recurring", handler: runScheduledRecurring as unknown as RouteHandler },
    { method: "ALL", path: "/api/scheduled/finance-bill-reminder", handler: runScheduledBillReminder as unknown as RouteHandler },
    { method: "ALL", path: "/api/scheduled/finance-backup", handler: runScheduledBackup as unknown as RouteHandler },
    { method: "ALL", path: "/api/scheduled/daily-sweep", handler: runDailySweep as unknown as RouteHandler },
  ];

  const allRoutes = [...routes, ...scheduledRoutes];

  for (const route of allRoutes) {
    const handler = async (c: Context): Promise<Response> => {
      const method = c.req.method;
      let body: unknown;
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = await c.req.json();
        } catch {
          body = undefined;
        }
      }

      const params: Record<string, string> = {};
      if (route.path.includes(":objectId")) {
        const match = c.req.path.match(/\/api\/storage\/objects\/(\d+)/);
        if (match) params.objectId = match[1];
      }

      const reqShim = createShimRequest(c.req.raw, body, params);
      const resShim = createShimResponse();

      await route.handler(reqShim, resShim);
      return shimToResponse(resShim);
    };

    if (route.method === "ALL" || route.method === "USE") {
      app.all(route.path, handler);
    } else {
      app.on(route.method, route.path, handler);
    }
  }

  app.all("/api/trpc/*", async c => {
    const response = await fetchRequestHandler({
      req: c.req.raw,
      endpoint: "/api/trpc",
      router: appRouter,
      createContext: async ({ req, resHeaders }): Promise<TrpcContext> => {
        const context = await createWorkerContext({ req, resHeaders });
        return context as unknown as TrpcContext;
      },
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });

  app.all("/api/*", c => {
    return c.json({ error: "Not found" }, 404);
  });

  app.all("*", async c => {
    if (env.ASSETS) {
      return env.ASSETS.fetch(c.req.raw);
    }
    return c.text("Static assets not configured", 500);
  });

  return app;
}
