import type { IncomingMessage, ServerResponse } from "node:http";
import * as Sentry from "@sentry/node";
import { createApiApp, registerFallbackHandlers } from "./_core/app";
import { normalizeVercelRequestPath } from "./_core/vercelPath";
import { initializeRBACSystem } from "./_core/rbac-initializer";
import { validateCriticalEnv } from "./_core/env";
import logger from "./_core/logger";

const missingEnv = validateCriticalEnv();
if (missingEnv.length > 0) {
  logger.error(
    { missing: missingEnv },
    "Critical environment variables missing — refusing to start"
  );
  // Hard-fail on the production runtime (configured to crash on cold start);
  // tests and local dev may legitimately lack the full environment.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Missing critical environment variables: ${missingEnv.join(", ")}`
    );
  }
}

// Initialize Sentry for server-side error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

const app = createApiApp();
registerFallbackHandlers(app);

/**
 * Bundled by the Vercel build script and emitted as api/[...path].mjs.
 * This preserves the shared Express request pipeline without binding a port.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    await initializeRBACSystem();
  } catch (err) {
    // Deny-by-default: RBAC helpers throw when uninitialized, which surfaces
    // as FORBIDDEN rather than silently allowing legacy-role privilege.
    logger.error(
      { err },
      "RBAC initialization failed on serverless cold start"
    );
    Sentry.captureException(err);
  }
  if (req.url) {
    req.url = normalizeVercelRequestPath(req.url);
  }
  try {
    app(req, res);
  } catch (err) {
    Sentry.captureException(err);
    throw err;
  }
}
