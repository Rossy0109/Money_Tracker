import type { Express, Response } from "express";
import { get as getBlob } from "@vercel/blob";
import { Readable } from "node:stream";
import { ENV } from "./env";
import { selectStorageBackend } from "./storageBackend";
import { sdk } from "./sdk";
import { getPrivateStorageObjectForDownload } from "../db";

function attachmentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName.replace(/[\r\n]/g, "_"))}`;
}

async function streamPrivateBlobObject(
  object: { storageKey: string; contentType: string; fileName: string },
  res: Response,
) {
  const blob = await getBlob(object.storageKey, {
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
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "sandbox");
  res.set("Content-Type", object.contentType);
  res.set("Content-Disposition", attachmentDisposition(object.fileName));
  res.set("Content-Length", String(blob.blob.size));
  if (blob.blob.etag) res.set("ETag", blob.blob.etag);
  Readable.fromWeb(
    blob.stream as unknown as import("node:stream/web").ReadableStream,
  ).pipe(res);
}

export function registerStorageProxy(app: Express) {
  app.get("/api/storage/objects/:objectId", async (req, res) => {
    const objectId = Number(req.params.objectId);
    if (!Number.isSafeInteger(objectId) || objectId < 1) {
      res.status(404).send("Storage object not found");
      return;
    }

    try {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).send("Authentication required");
        return;
      }
      if (user.isCron) {
        res.status(403).send("Storage object access denied");
        return;
      }

      const object = await getPrivateStorageObjectForDownload(user.id, objectId);
      if (!object) {
        res.status(404).send("Storage object not found");
        return;
      }

      if (selectStorageBackend(ENV) !== "vercel-blob") {
        res.status(503).send("Private storage backend unavailable");
        return;
      }

      await streamPrivateBlobObject(object, res);
    } catch (error) {
      console.error("[StorageProxy] private object delivery failed:", error);
      res.status(502).send("Storage proxy error");
    }
  });

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
        res.status(410).send("Private storage objects require a protected download endpoint");
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
