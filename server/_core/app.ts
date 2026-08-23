import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { runScheduledBillReminder, runScheduledRecurring } from "../scheduledFinance";

/**
 * Creates the HTTP application without binding a port.
 *
 * Keeping route registration separate from process startup lets the existing
 * persistent runtime and Vercel's captured Express function use the identical
 * tRPC, OAuth, storage, and scheduler route contracts.
 */
export function createApiApp() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // A deployment-safe, non-mutating health endpoint. It intentionally does
  // not access user, project, financial, or database data.
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "money-tracker" });
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/finance-recurring", runScheduledRecurring);
  app.post("/api/scheduled/finance-bill-reminder", runScheduledBillReminder);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
