import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { runScheduledBillReminder, runScheduledRecurring } from "../scheduledFinance";
import { runScheduledBackup } from "../scheduledBackup";
import { ENV } from "./env";
import logger from "./logger";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  // Trust the first reverse-proxy hop (Vercel). Validation is enabled so
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR / ERR_ERL_FORWARDED_HEADER surface as
  // config errors instead of silently keying on spoofable headers.
  validate: {
    trustProxy: true,
    xForwardedForHeader: true,
  },
  message: {
    message: "খুব বেশি চেষ্টার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.ISOLATED_E2E_DATABASE === "true",
});

const performanceStore = {
  routes: new Map<string, number[]>(),
  maxSamples: 1000,
  record(method: string, url: string, ms: number) {
    const key = `${method} ${url}`;
    const samples = this.routes.get(key);
    if (!samples) {
      this.routes.set(key, [ms]);
    } else {
      samples.push(ms);
      if (samples.length > this.maxSamples) samples.shift();
    }
  },
  getStats(method: string, url: string) {
    const key = `${method} ${url}`;
    const samples = this.routes.get(key);
    if (!samples || samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return { p50, p95, p99, avg: Math.round(avg * 100) / 100, count: sorted.length };
  },
};

export { performanceStore };

/**
 * Creates the HTTP application without binding a port.
 *
 * Keeping route registration separate from process startup lets the existing
 * persistent runtime and Vercel's captured Express function use the identical
 * tRPC, OAuth, storage, and scheduler route contracts.
 */
export function createApiApp() {
  const app = express();

  // Trust Vercel's proxy (first hop) for correct client IP, protocol, and host
  app.set("trust proxy", 1);

  // Canonical host enforcement — redirect non-canonical hostnames to production alias
  // This prevents cookie mismatches between deployment URLs and the canonical domain,
  // while safely supporting Vercel preview deployments (*.vercel.app) and local development.
  const CANONICAL_HOST = process.env.CANONICAL_HOST || "money-tracker-blond-pi.vercel.app";
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.get("host")?.toLowerCase() || "";
    const isVercelDomain = host.endsWith(".vercel.app");
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host === "::1";
    const isCanonical = host === CANONICAL_HOST || isLocal || isVercelDomain;
    
    // Allow health checks and cron endpoints to bypass host check
    if (req.path === "/api/healthz" || req.path.startsWith("/api/scheduled/")) {
      return next();
    }

    if (!isCanonical && process.env.NODE_ENV === "production") {
      const canonicalUrl = `https://${CANONICAL_HOST}${req.originalUrl}`;
      return res.redirect(301, canonicalUrl);
    }
    next();
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
      frameguard: { action: "deny" },
    }),
  );

  // CORS — restrict to same-origin in production, allow all in dev
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const isProd = ENV.isProduction;

    if (isProd) {
      // In production, allow same-origin, exact APP_URL, or any *.vercel.app deployment
      const isAllowedOrigin =
        !origin ||
        origin === process.env.APP_URL ||
        origin === `https://${CANONICAL_HOST}` ||
        (typeof origin === "string" && origin.endsWith(".vercel.app"));

      if (isAllowedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origin || process.env.APP_URL || "*");
      }
    } else {
      // In development, allow all origins
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret, X-Admin-Password");
    res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Additional security headers beyond Helmet
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    next();
  });

  // Structured request logging
  if (process.env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === "/api/healthz",
        },
      }),
    );
  }

  // Path-aware body limits: small global cap; large only for backup
  // restore/preview (client file cap is 20MB → allow 25mb for those).
  // Pre-create parsers once (creating them per-request can stall).
  const isBackupRestorePath = (req: Request): boolean =>
    req.path.includes("finance.restoreProjectBackup") ||
    req.path.includes("finance.previewProjectBackup");
  const jsonSmall = express.json({ limit: "2mb" });
  const urlencodedSmall = express.urlencoded({ limit: "2mb", extended: true });
  const jsonLarge = express.json({ limit: "25mb" });
  const urlencodedLarge = express.urlencoded({ limit: "25mb", extended: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const large = isBackupRestorePath(req);
    const json = large ? jsonLarge : jsonSmall;
    const urlencoded = large ? urlencodedLarge : urlencodedSmall;
    json(req, res, err => {
      if (err) return next(err);
      urlencoded(req, res, next);
    });
  });

  // Performance tracking middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const start = Date.now();
    const originalEnd = _res.end;
    _res.end = function (this: Response, ...args: unknown[]) {
      const ms = Date.now() - start;
      performanceStore.record(req.method, req.url.split("?")[0], ms);
      return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
    } as Response["end"];
    next();
  });

  // A deployment-safe, non-mutating health endpoint. It intentionally does
  // not access user, project, financial, or database data.
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "money-tracker" });
  });

  registerStorageProxy(app);

  // Rate-limiting for authentication endpoints
  app.use("/api/auth", authLimiter);
  app.use("/api/oauth", authLimiter);
  app.use("/api/trpc/auth.login", authLimiter);
  app.use("/api/trpc/auth.register", authLimiter);
  app.use(/^\/api\/trpc\/auth\./, authLimiter);

  registerOAuthRoutes(app);
  // Scheduled callbacks are POST; Vercel Cron always invokes GET.
  // Register every scheduled path for both methods so a method mismatch can
  // never 404 a production cron again.
  app.all("/api/scheduled/finance-recurring", runScheduledRecurring);
  app.all("/api/scheduled/finance-bill-reminder", runScheduledBillReminder);
  app.all("/api/scheduled/finance-backup", runScheduledBackup);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // 404 for unknown API paths. This stays inside the shared pipeline so
  // /api/* semantics are identical in every runtime. The generic (non-API)
  // fallback lives in registerFallbackHandlers, which runtimes register AFTER
  // their SPA layer (Vite dev middleware / static files) — otherwise Express
  // would answer 404 before the SPA layer ever runs.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

/**
 * Terminal middleware for a fully-assembled app: generic 404 plus the global
 * Express error handler. Call AFTER setupVite/serveStatic (persistent runtimes)
 * or directly after createApiApp (API-only runtimes like the Vercel handler).
 */
export function registerFallbackHandlers(app: Express) {
  // 404 handler for unmatched routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global Express error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled Express error");
    res.status(500).json({ error: "Internal server error" });
  });
}
