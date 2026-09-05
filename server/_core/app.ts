import express from "express";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { runScheduledBillReminder, runScheduledRecurring } from "../scheduledFinance";
import { runScheduledBackup } from "../scheduledBackup";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "খুব বেশি চেষ্টার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.ISOLATED_E2E_DATABASE === "true",
});

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

  // Rate-limiting for authentication endpoints
  app.use("/api/auth", authLimiter);
  app.use("/api/oauth", authLimiter);
  app.use("/api/trpc/auth.login", authLimiter);
  app.use("/api/trpc/auth.register", authLimiter);
  app.use(/^\/api\/trpc\/auth\./, authLimiter);

  registerOAuthRoutes(app);
  app.post("/api/scheduled/finance-recurring", runScheduledRecurring);
  app.post("/api/scheduled/finance-bill-reminder", runScheduledBillReminder);
  app.post("/api/scheduled/finance-backup", runScheduledBackup);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
