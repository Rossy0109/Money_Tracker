import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "./_core/app";
import { normalizeVercelRequestPath } from "./_core/vercelPath";

const app = createApiApp();

/**
 * Bundled by the Vercel build script and emitted as api/[...path].mjs.
 * This preserves the shared Express request pipeline without binding a port.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) {
    req.url = normalizeVercelRequestPath(req.url);
  }
  app(req, res);
}
