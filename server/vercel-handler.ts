import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp, registerFallbackHandlers } from "./_core/app";
import { normalizeVercelRequestPath } from "./_core/vercelPath";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { initializeRBAC } from "./_core/rbac";
import { migrateExistingUsersToRBAC } from "./_core/migrate-existing-users-rbac";
import logger from "./_core/logger";

const app = createApiApp();
registerFallbackHandlers(app);

/**
 * Serverless cold-start: seed/migrate RBAC once per instance so authorization
 * is never consulted before roles/permissions exist. Failures are logged and
 * retried on the next request (initializeRBAC is idempotent).
 */
let rbacReady: Promise<void> | null = null;
function ensureRbacInitialized(): Promise<void> {
  if (!rbacReady) {
    rbacReady = (async () => {
      await seedDefaultRBAC();
      await migrateExistingUsersToRBAC();
      await initializeRBAC();
    })().catch(err => {
      rbacReady = null;
      throw err;
    });
  }
  return rbacReady;
}

/**
 * Bundled by the Vercel build script and emitted as api/[...path].mjs.
 * This preserves the shared Express request pipeline without binding a port.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureRbacInitialized();
  } catch (err) {
    // Deny-by-default: RBAC helpers throw when uninitialized, which surfaces
    // as FORBIDDEN rather than silently allowing legacy-role privilege.
    logger.error({ err }, "RBAC initialization failed on serverless cold start");
  }
  if (req.url) {
    req.url = normalizeVercelRequestPath(req.url);
  }
  app(req, res);
}
