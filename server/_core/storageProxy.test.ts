import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getPrivateStorageObjectForDownload: vi.fn(),
}));
vi.mock("./sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));
// Keep buildSupabaseObjectUrl real so the pure supabaseObjectUrl
// tests exercise the genuine URL construction; only the backend
// selectors are mocked for the route-guard tests.
vi.mock("./storageBackend", async importOriginal => {
  const actual = await importOriginal<typeof import("./storageBackend")>();
  return {
    ...actual,
    getR2Bucket: vi.fn().mockReturnValue(null),
    selectStorageBackend: vi.fn(),
  };
});
vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}));

import { get as getBlob } from "@vercel/blob";
import { getPrivateStorageObjectForDownload } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getR2Bucket, selectStorageBackend } from "./storageBackend";
import { registerStorageProxy, supabaseObjectUrl } from "./storageProxy";

// ── Pure function: supabaseObjectUrl (original coverage, PR #177) ──

const savedUrl = ENV.supabaseUrl;
const savedBucket = ENV.supabaseStorageBucket;

afterEach(() => {
  ENV.supabaseUrl = savedUrl;
  ENV.supabaseStorageBucket = savedBucket;
});

describe("supabaseObjectUrl", () => {
  it("returns null without configuration", () => {
    ENV.supabaseUrl = "";
    ENV.supabaseStorageBucket = "";
    expect(supabaseObjectUrl("backups/a.sql")).toBeNull();
  });

  it("builds a public object URL with encoded segments", () => {
    ENV.supabaseUrl = "https://xyz.supabase.co/";
    ENV.supabaseStorageBucket = "backups";
    expect(supabaseObjectUrl("a/b.sql")).toBe(
      "https://xyz.supabase.co/storage/v1/object/backups/a/b.sql"
    );
    expect(supabaseObjectUrl("dir spaced/f ile.sql")).toBe(
      "https://xyz.supabase.co/storage/v1/object/backups/dir%20spaced/f%20ile.sql"
    );
  });

  it("returns null for empty keys", () => {
    ENV.supabaseUrl = "https://xyz.supabase.co";
    ENV.supabaseStorageBucket = "backups";
    expect(supabaseObjectUrl("")).toBeNull();
    expect(supabaseObjectUrl("///")).toBeNull();
  });
});

// ── Route guards: registerStorageProxy (GUARDIAN) ──

function makeObject(
  overrides: Partial<{
    storageKey: string;
    contentType: string;
    fileName: string;
  }> = {}
) {
  return {
    id: 1,
    ownerUserId: 42,
    projectId: null,
    householdId: null,
    storageKey: "uploads/1/report.pdf",
    kind: "export" as const,
    scope: "owner" as const,
    contentType: "application/pdf",
    fileName: "report.pdf",
    sizeBytes: 12,
    createdAt: new Date(),
    ...overrides,
  };
}

const authedUser = { id: 42, isCron: false };

let server: ReturnType<Express["listen"]>;
let baseUrl: string;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getR2Bucket).mockReturnValue(null);
});

afterEach(() => {
  server?.close();
});

describe("storage proxy route guards", () => {
  beforeEach(() => {
    const app = express();
    registerStorageProxy(app);
    server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  it("rejects a non-numeric object id before auth", async () => {
    const res = await fetch(`${baseUrl}/api/storage/objects/not-a-number`);
    expect(res.status).toBe(404);
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("rejects object id zero and negatives before auth", async () => {
    for (const id of ["0", "-1"]) {
      const res = await fetch(`${baseUrl}/api/storage/objects/${id}`);
      expect(res.status).toBe(404);
    }
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(
      new Error("no session")
    );
    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Authentication required");
  });

  it("denies cron callers", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({
      ...authedUser,
      isCron: true,
    } as any);
    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Storage object access denied");
  });

  it("returns 404 when the caller cannot access the object (IDOR guard)", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/api/storage/objects/999`);
    expect(res.status).toBe(404);
    // The lookup is scoped to the authenticated user's id.
    expect(getPrivateStorageObjectForDownload).toHaveBeenCalledWith(42, 999);
  });

  it("fails closed when no storage backend is configured", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject()
    );
    vi.mocked(selectStorageBackend).mockReturnValue("missing");
    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Private storage backend unavailable");
  });

  it("delivers a private blob object with download headers", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject({ storageKey: "uploads/1/report.pdf" })
    );
    vi.mocked(selectStorageBackend).mockReturnValue("vercel-blob");
    const body = new TextEncoder().encode("hello-object");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    });
    vi.mocked(getBlob).mockResolvedValue({
      stream,
      blob: { size: body.byteLength, etag: "etag-1" },
    } as any);

    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''report.pdf"
    );
    expect(res.headers.get("content-length")).toBe(String(body.byteLength));
    expect(res.headers.get("etag")).toBe("etag-1");
    expect(await res.text()).toBe("hello-object");
  });

  it("maps an unexpected delivery failure to a 502", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockRejectedValue(
      new Error("db exploded")
    );
    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Storage proxy error");
  });

  it("streams a private object from the Cloudflare R2 backend", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject({ fileName: "r2-report.pdf" })
    );
    vi.mocked(selectStorageBackend).mockReturnValue("cloudflare-r2");
    const encoded = new TextEncoder().encode("r2-object-bytes");
    vi.mocked(getR2Bucket).mockReturnValue({
      get: vi.fn().mockResolvedValue({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoded);
            controller.close();
          },
        }),
        size: encoded.byteLength,
        etag: "r2-etag",
      }),
    } as any);

    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe("r2-etag");
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''r2-report.pdf"
    );
    expect(await res.text()).toBe("r2-object-bytes");
  });

  it("returns 404 when the R2 object is missing", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject()
    );
    vi.mocked(selectStorageBackend).mockReturnValue("cloudflare-r2");
    vi.mocked(getR2Bucket).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
    } as any);

    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Storage object not found");
  });

  it("streams a private object from the Supabase Storage backend", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject({ storageKey: "uploads/1/sb.pdf", fileName: "sb.pdf" })
    );
    vi.mocked(selectStorageBackend).mockReturnValue("supabase-storage");
    ENV.supabaseUrl = "https://xyz.supabase.co";
    ENV.supabaseStorageBucket = "private";
    ENV.supabaseStorageKey = "service-key";

    const upstreamBody = new TextEncoder().encode("supabase-object-bytes");
    const realFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: any, init?: any) => {
        const url = typeof input === "string" ? input : String(input?.url ?? input);
        if (url.includes("127.0.0.1")) return realFetch(input, init);
        return Promise.resolve(
          new Response(upstreamBody, {
            status: 200,
            headers: {
              "content-length": String(upstreamBody.byteLength),
              etag: "sb-etag",
            },
          }) as any
        );
      });

    try {
      const res = await fetch(`${baseUrl}/api/storage/objects/1`);
      expect(res.status).toBe(200);
      expect(res.headers.get("etag")).toBe("sb-etag");
      expect(await res.text()).toBe("supabase-object-bytes");
      // The upstream call must be authenticated with the service key.
      const sbCall = fetchSpy.mock.calls.find(([input]) =>
        String(input).includes("supabase.co")
      );
      expect(sbCall).toBeDefined();
      const [url, init] = sbCall as [string, RequestInit];
      expect(String(url)).toContain("xyz.supabase.co/storage/v1/object/private");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer service-key"
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("maps a Supabase 404 upstream to a 404", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject({ storageKey: "uploads/1/missing.pdf" })
    );
    vi.mocked(selectStorageBackend).mockReturnValue("supabase-storage");
    ENV.supabaseUrl = "https://xyz.supabase.co";
    ENV.supabaseStorageBucket = "private";
    ENV.supabaseStorageKey = "service-key";

    const realFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: any, init?: any) => {
        const url = typeof input === "string" ? input : String(input?.url ?? input);
        if (url.includes("127.0.0.1")) return realFetch(input, init);
        return Promise.resolve(new Response("nope", { status: 404 }) as any);
      });

    try {
      const res = await fetch(`${baseUrl}/api/storage/objects/1`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Storage object not found");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("fails closed when the Supabase backend is not fully configured", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue(authedUser as any);
    vi.mocked(getPrivateStorageObjectForDownload).mockResolvedValue(
      makeObject()
    );
    vi.mocked(selectStorageBackend).mockReturnValue("supabase-storage");
    ENV.supabaseUrl = "";
    ENV.supabaseStorageBucket = "";
    ENV.supabaseStorageKey = "";

    const res = await fetch(`${baseUrl}/api/storage/objects/1`);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Private storage backend unavailable");
  });
});
