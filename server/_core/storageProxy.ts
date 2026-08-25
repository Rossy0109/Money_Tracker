import type { Express } from "express";
import { get as getBlob } from "@vercel/blob";
import { Readable } from "node:stream";
import { ENV } from "./env";
import { selectStorageBackend } from "./storageBackend";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const backend = selectStorageBackend(ENV);
    if (backend === "missing") {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      if (backend === "vercel-blob") {
        const blob = await getBlob(key, {
          access: "private",
          useCache: false,
          token: ENV.blobReadWriteToken,
        });
        if (!blob) {
          res.status(404).send("Storage object not found");
          return;
        }

        if (!blob.stream) {
          res.status(502).send("Storage object stream unavailable");
          return;
        }

        res.set("Cache-Control", "no-store");
        res.set("Content-Type", blob.blob.contentType ?? "application/octet-stream");
        if (blob.blob.contentDisposition) {
          res.set("Content-Disposition", blob.blob.contentDisposition);
        }
        res.set("Content-Length", String(blob.blob.size));
        if (blob.blob.etag) res.set("ETag", blob.blob.etag);
        Readable.fromWeb(
          blob.stream as unknown as import("node:stream/web").ReadableStream,
        ).pipe(res);
        return;
      }

      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
