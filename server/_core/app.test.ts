import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApiApp } from "./app";
import { normalizeVercelRequestPath } from "./vercelPath";

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
  it("preserves the public storage-proxy path after the Vercel function rewrite", () => {
    expect(normalizeVercelRequestPath("/api/manus-storage/exports/report.pdf?download=1")).toBe(
      "/manus-storage/exports/report.pdf?download=1",
    );
    expect(normalizeVercelRequestPath("/api/trpc/auth.me")).toBe("/api/trpc/auth.me");
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
});
