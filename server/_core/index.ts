import "./loadEnv";
import { createServer } from "http";
import net from "net";
import * as Sentry from "@sentry/node";
import { createApiApp, registerFallbackHandlers } from "./app";
import { ensureAuthModeConsistency, validateCriticalEnv } from "./env";
import { serveStatic, setupVite } from "./vite";
import logger from "./logger";
import { initializeRBACSystem } from "./rbac-initializer";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    enabled: process.env.NODE_ENV !== "test",
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const missingEnv = validateCriticalEnv();
  if (missingEnv.length > 0) {
    throw new Error(
      `FATAL: Missing critical environment variables: ${missingEnv.join(", ")}. ` +
        "Set them in .env or your deployment environment."
    );
  }

  const consistency = ensureAuthModeConsistency();
  if (!consistency.ok) {
    throw new Error(
      `AUTH_MODE=${consistency.serverMode} and VITE_AUTH_MODE=${consistency.clientMode} must match. ` +
        "Set both to the same value in the same environment layer (.env / .env.development.local / Vercel)."
    );
  }
  try {
    await initializeRBACSystem();
    logger.info("RBAC system initialized");
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "RBAC initialization failed — refusing to start with authorization disabled",
        { cause: err }
      );
    }
    logger.error(
      { err },
      "RBAC initialization failed in non-production — authorization checks will be unavailable"
    );
  }

  const app = createApiApp();
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  // Terminal handlers go last so the SPA layer serves non-API routes first.
  registerFallbackHandlers(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.info(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    logger.info(`Server running on http://localhost:${port}/`);
  });
}

process.on("uncaughtException", err => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  Sentry.captureException(err);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  logger.error(
    { err: reason instanceof Error ? reason : new Error(String(reason)) },
    "Unhandled promise rejection"
  );
  if (reason instanceof Error) {
    Sentry.captureException(reason);
  } else {
    Sentry.captureException(new Error(String(reason)));
  }
});

startServer().catch(err => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
