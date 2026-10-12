import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import logger from "./logger";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { resolveProjectRoot } from "../../dirname";

const FONT_ASSET_PATH = /\.(?:woff2?|ttf|otf|eot)$/i;

/**
 * A font request that reached a fallback means the asset is missing. Serving
 * index.html with 200/text-html there makes the browser report an opaque
 * "failed to decode font" instead of a clear 404, and would hide a broken
 * build, so font URLs must never fall through to the SPA layer.
 */
export function isFontAssetRequest(rawUrl: string): boolean {
  const pathname = rawUrl.split(/[?#]/, 1)[0] ?? "";
  return FONT_ASSET_PATH.test(pathname);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    const url = req.originalUrl;

    if (isFontAssetRequest(url)) {
      res
        .status(404)
        .set({ "Content-Type": "text/plain; charset=utf-8" })
        .end("Not Found");
      return;
    }

    try {
      const clientTemplate = path.resolve(
        resolveProjectRoot(import.meta.url),
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(
    resolveProjectRoot(import.meta.url),
    "dist",
    "public"
  );
  if (!fs.existsSync(distPath)) {
    logger.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use((req, res) => {
    if (isFontAssetRequest(req.originalUrl)) {
      res
        .status(404)
        .set({ "Content-Type": "text/plain; charset=utf-8" })
        .end("Not Found");
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
