import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp, registerFallbackHandlers } from "./_core/app";
import { normalizeVercelRequestPath } from "./_core/vercelPath";
import { initializeRBACSystem } from "./_core/rbac-initializer";
import logger from "./_core/logger";

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
  }
  if (req.url) {
    req.url = normalizeVercelRequestPath(req.url);
  }
  app(req, res);
}
