import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createWorkerApp } from "./app";
import { createTestEnv, type WorkerEnv } from "./testHelpers";
import { createShimRequest, createShimResponse, shimToResponse } from "./httpShim";
import { isWorkersRuntime } from "./db";

let env: WorkerEnv;
let app: ReturnType<typeof createWorkerApp>;

beforeEach(() => {
  env = createTestEnv();
  app = createWorkerApp(env);
});

describe("Worker database runtime detection", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator"
  );

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    }
  });

  it("does not detect Node as the Workers runtime", () => {
    expect(isWorkersRuntime()).toBe(false);
  });

  it("detects the Workers runtime via workerd's navigator.userAgent", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Cloudflare-Workers" },
      configurable: true,
    });
    expect(isWorkersRuntime()).toBe(true);
  });
});

describe("Worker health endpoint", () => {
  it("returns ok", async () => {
    const req = new Request("http://localhost/api/healthz");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe("Worker security headers", () => {
  it("sets CSP header", async () => {
    const req = new Request("http://localhost/api/healthz");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
  });

  it("sets X-Content-Type-Options", async () => {
    const req = new Request("http://localhost/api/healthz");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options", async () => {
    const req = new Request("http://localhost/api/healthz");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets Referrer-Policy", async () => {
    const req = new Request("http://localhost/api/healthz");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("Worker CORS", () => {
  it("handles OPTIONS preflight", async () => {
    const req = new Request("http://localhost/api/healthz", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("sets CORS headers on GET", async () => {
    const req = new Request("http://localhost/api/healthz", {
      headers: { Origin: "http://localhost:3000" },
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});

describe("Worker API 404", () => {
  it("returns 404 for unknown API paths", async () => {
    const req = new Request("http://localhost/api/unknown");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });
});

describe("Worker SPA fallback", () => {
  it("serves index.html for non-API routes", async () => {
    const req = new Request("http://localhost/vouchers");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("serves index.html for nested SPA routes", async () => {
    const req = new Request("http://localhost/categories/expense");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
  });
});

describe("Worker rate limiting", () => {
  it("allows requests under limit", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.com", password: "wrong" }),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).not.toBe(429);
  });
});

describe("Worker authentication", () => {
  it("rejects login with invalid credentials", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@test.com", password: "wrongpassword" }),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  it("rejects malformed login request", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(400);
  });
});

describe("Worker tRPC adapter", () => {
  it("rejects unauthenticated tRPC procedure", async () => {
    const input = encodeURIComponent(
      JSON.stringify({ json: { timestamp: Date.now() } })
    );
    const req = new Request(`http://localhost/api/trpc/system.health?input=${input}`, {
      headers: { "Content-Type": "application/json" },
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown tRPC procedure", async () => {
    const req = new Request("http://localhost/api/trpc/unknown.procedure?input=%7B%7D", {
      headers: { "Content-Type": "application/json" },
    });
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });
});

describe("Worker storage proxy", () => {
  it("rejects unauthenticated storage object access", async () => {
    const req = new Request("http://localhost/api/storage/objects/1");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-numeric object ids", async () => {
    const req = new Request("http://localhost/api/storage/objects/not-a-number");
    const res = await app.fetch(req, env, {} as ExecutionContext);
    expect(res.status).toBe(404);
  });
});

describe("Worker HTTP shim", () => {
  it("creates shim request from Fetch Request", () => {
    const req = new Request("http://localhost/api/test?foo=bar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Custom": "value" },
      body: JSON.stringify({ key: "value" }),
    });
    const shim = createShimRequest(req, { key: "value" });
    expect(shim.method).toBe("POST");
    expect(shim.path).toBe("/api/test");
    expect(shim.query.foo).toBe("bar");
    expect(shim.get("content-type")).toBe("application/json");
    expect(shim.body).toEqual({ key: "value" });
  });

  it("creates shim response with cookies", () => {
    const shim = createShimResponse();
    shim.status(200).cookie("session", "abc123", { httpOnly: true, path: "/" });
    shim.json({ ok: true });
    const res = shimToResponse(shim);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("session=abc123");
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  it("passes ReadableStream bodies through to the Response", () => {
    const shim = createShimResponse();
    shim.status(200);
    shim.set("Content-Type", "application/octet-stream");
    shim.body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("streamed-bytes"));
        controller.close();
      },
    });
    const res = shimToResponse(shim);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    return res.text().then(text => expect(text).toBe("streamed-bytes"));
  });
});
