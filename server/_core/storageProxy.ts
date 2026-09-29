import type { Express, Response } from "express";
import { get as getBlob } from "@vercel/blob";
import { Readable } from "node:stream";
import { ENV } from "./env";
import {
  buildSupabaseObjectUrl,
  getR2Bucket,
  selectStorageBackend,
} from "./storageBackend";
import logger from "./logger";
import { sdk } from "./sdk";
import { getPrivateStorageObjectForDownload } from "../db";

function attachmentDisposition(fileName: string) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName.replace(/[\r\n]/g, "_"))}`;
}

/**
 * Local mirror of the Cloudflare worker's `ShimResponse` shape. Defined here
 * so the Node server never imports runtime code from `worker/`
 * (wrong-direction coupling: the worker reuses server business logic, never
 * the reverse). The `__shim: true` marker check below must stay identical to
 * the worker's `isShimResponse`.
 */
interface WorkerShimResponse {
  readonly __shim: true;
  body: unknown;
  set(name: string, value: string): void;
  status(code: number): WorkerShimResponse;
  send(data: unknown): WorkerShimResponse;
}

type ProxyResponse = Response | WorkerShimResponse;

function isShimResponse(res: unknown): res is WorkerShimResponse {
  return (
    typeof res === "object" &&
    res !== null &&
    (res as { __shim?: unknown }).__shim === true
  );
}

function applyDownloadHeaders(
  res: ProxyResponse,
  object: { contentType: string; fileName: string },
  meta: { size?: number; etag?: string }
) {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Security-Policy", "sandbox");
  res.set("Content-Type", object.contentType);
  res.set("Content-Disposition", attachmentDisposition(object.fileName));
  if (typeof meta.size === "number" && Number.isFinite(meta.size)) {
    res.set("Content-Length", String(meta.size));
  }
  if (meta.etag) res.set("ETag", meta.etag);
}

async function streamPrivateBlobObject(
  object: { storageKey: string; contentType: string; fileName: string },
  res: ProxyResponse
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

  applyDownloadHeaders(res, object, {
    size: blob.blob.size,
    etag: blob.blob.etag,
  });

  if (isShimResponse(res)) {
    res.body = blob.stream;
  } else {
    Readable.fromWeb(
      blob.stream as unknown as import("node:stream/web").ReadableStream
    ).pipe(res);
  }
}

async function streamPrivateR2Object(
  object: { storageKey: string; contentType: string; fileName: string },
  res: ProxyResponse
) {
  const bucket = getR2Bucket();
  if (!bucket) {
    res.status(503).send("Private storage backend unavailable");
    return;
  }

  const stored = await bucket.get(object.storageKey);
  if (!stored) {
    res.status(404).send("Storage object not found");
    return;
  }

  applyDownloadHeaders(res, object, {
    size: stored.size,
    etag: stored.etag,
  });

  if (isShimResponse(res)) {
    res.body = stored.body;
  } else {
    Readable.fromWeb(stored.body as import("node:stream/web").ReadableStream).pipe(
      res
    );
  }
}

export function supabaseObjectUrl(key: string): string | null {
  return buildSupabaseObjectUrl(
    ENV.supabaseUrl,
    ENV.supabaseStorageBucket,
    key
  );
}

async function streamPrivateSupabaseObject(
  object: { storageKey: string; contentType: string; fileName: string },
  res: ProxyResponse
) {
  const endpoint = supabaseObjectUrl(object.storageKey);
  const storageKey = ENV.supabaseStorageKey;
  if (!endpoint || !storageKey) {
    res.status(503).send("Private storage backend unavailable");
    return;
  }

  const upstream = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${storageKey}`,
      apikey: storageKey,
    },
  });

  if (upstream.status === 404) {
    res.status(404).send("Storage object not found");
    return;
  }
  if (!upstream.ok || !upstream.body) {
    res.status(502).send("Storage object stream unavailable");
    return;
  }

  const contentLength = upstream.headers.get("content-length");
  applyDownloadHeaders(res, object, {
    size: contentLength ? Number(contentLength) : undefined,
    etag: upstream.headers.get("etag") ?? undefined,
  });

  if (isShimResponse(res)) {
    res.body = upstream.body;
  } else {
    Readable.fromWeb(
      upstream.body as import("node:stream/web").ReadableStream
    ).pipe(res);
  }
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

      const backend = selectStorageBackend({
        ...ENV,
        r2Bucket: getR2Bucket(),
      });
      if (backend === "missing") {
        res.status(503).send("Private storage backend unavailable");
        return;
      }
      if (backend === "cloudflare-r2") {
        await streamPrivateR2Object(object, res);
      } else if (backend === "supabase-storage") {
        await streamPrivateSupabaseObject(object, res);
      } else {
        await streamPrivateBlobObject(object, res);
      }
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        "[StorageProxy] private object delivery failed"
      );
      res.status(502).send("Storage proxy error");
    }
  });
}
