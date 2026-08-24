import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../server/_core/app";
import { normalizeVercelRequestPath } from "../server/_core/vercelPath";

const app = createApiApp();

/**
 * Vercel maps every `/api/*` request to this Node function. The public
 * `/manus-storage/*` route is rewritten here as well, then restored before
 * Express evaluates the existing storage-proxy route.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) {
    req.url = normalizeVercelRequestPath(req.url);
  }
  app(req, res);
}
