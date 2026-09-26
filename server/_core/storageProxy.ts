import type { Express, Response } from "express";
import { get as getBlob } from "@vercel/blob";
import { Readable } from "node:stream";
import { ENV } from "./env";
import { selectStorageBackend } from "./storageBackend";
import logger from "./logger";
import { sdk } from "./sdk";
import { getPrivateStorageObjectForDownload } from "../db";

function attachmentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName.replace(/[\r\n]/g, "_"))}`;
}

async function streamPrivateBlobObject(
  object: { storageKey: string; contentType: string; fileName: string },
  res: Response
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
    blob.stream as unknown as import("node:stream/web").ReadableStream
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

      const object = await getPrivateStorageObjectForDownload(
        user.id,
        objectId
      );
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
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        "[StorageProxy] private object delivery failed"
      );
      res.status(502).send("Storage proxy error");
    }
  });
}
