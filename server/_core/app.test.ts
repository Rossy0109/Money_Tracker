process.env.NODE_ENV = "test";

import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { normalizeVercelRequestPath } from "./vercelPath";
import { createApiApp } from "./app";
import vercelHandler from "../vercel-handler";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("Vercel-compatible Express application", () => {
  it("exports a port-free handler for the generated Vercel function", () => {
    expect(typeof vercelHandler).toBe("function");
  });

  it("preserves the public path after the Vercel function rewrite", () => {
    // API paths are passed through to the Express handler
    expect(normalizeVercelRequestPath("/api/trpc/auth.me")).toBe("/api/trpc/auth.me");
    expect(normalizeVercelRequestPath("/api/healthz")).toBe("/api/healthz");
  });

  it("exposes a non-mutating health endpoint without starting a process listener", async () => {
    const app = createApiApp();
    const server = createServer(app);
    servers.push(server);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("A TCP address was expected for the isolated health check");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "money-tracker" });
  });

  it("keeps Google OAuth endpoints disabled when password mode is active", async () => {
    const app = createApiApp();
    const server = createServer(app);
    servers.push(server);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("A TCP address was expected");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/google/login`, {
      redirect: "manual",
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Google OAuth is not enabled" });
  });

  it("rejects unauthorized access to /api/scheduled/finance-backup", async () => {
    const app = createApiApp();
    const server = createServer(app);
    servers.push(server);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("A TCP address was expected");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/scheduled/finance-backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.success).toBe(false);

    // Also verify GET request (Vercel Cron method) without auth is rejected
    const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/scheduled/finance-backup`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(403);
  });

  it("authorizes /api/scheduled/finance-backup with valid Bearer token via POST and GET", async () => {
    const app = createApiApp();
    const server = createServer(app);
    servers.push(server);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("A TCP address was expected");

    process.env.CRON_SECRET = "test-cron-secret-token";

    // Vercel Cron method — must not 404/403 when authorized.
    const getResponse = await fetch(`http://127.0.0.1:${address.port}/api/scheduled/finance-backup`, {
      method: "GET",
      headers: {
        Authorization: "Bearer test-cron-secret-token",
      },
    });
    expect(getResponse.status).not.toBe(403);
    expect(getResponse.status).not.toBe(404);

    // GitHub Actions / manual POST still accepted (app.all).
    const postResponse = await fetch(`http://127.0.0.1:${address.port}/api/scheduled/finance-backup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-cron-secret-token",
      },
    });
    expect(postResponse.status).not.toBe(403);
    expect(postResponse.status).not.toBe(404);

    // Other scheduled paths must also accept GET (Vercel Cron parity).
    for (const path of [
      "/api/scheduled/finance-recurring",
      "/api/scheduled/finance-bill-reminder",
    ]) {
      const scheduledGet = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "GET",
      });
      // Route must exist (not 404); auth may still reject with 500/403.
      expect(scheduledGet.status).not.toBe(404);
    }
  });
});