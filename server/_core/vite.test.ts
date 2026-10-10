import express, { type Express } from "express";
import http, { type Server } from "http";
import fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vite", async importOriginal => {
  const actual = await importOriginal<typeof import("vite")>();
  return {
    ...actual,
    createServer: vi.fn(),
  };
});

vi.mock("fs", async importOriginal => {
  const actual = await importOriginal<typeof import("fs")>();
  const mock = {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
  return { ...mock, default: mock };
});

import { createServer as createViteServer } from "vite";
import { setupVite, serveStatic } from "./vite";
import logger from "./logger";

const TEMPLATE =
  '<html><body><script type="module" src="/src/main.tsx"></script></body></html>';

let server: Server;
let baseUrl: string;

async function start(app: Express): Promise<void> {
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}

afterEach(() => {
  server?.close();
});

describe("serveStatic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("logs an error when the client build directory is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const error = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const app = express();
    serveStatic(app);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toMatch(
      /Could not find the build directory/
    );
    error.mockRestore();
  });

  it("does not warn when the build directory exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const error = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const app = express();
    serveStatic(app);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("setupVite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a middleware-mode vite server with the right options", async () => {
    const middlewares = vi.fn((_req: any, _res: any, next: any) => next());
    vi.mocked(createViteServer).mockResolvedValue({
      middlewares,
      transformIndexHtml: vi.fn((_url: string, tpl: string) => tpl),
      ssrFixStacktrace: vi.fn(),
    } as any);

    const app = express();
    const hmrServer = http.createServer(app);
    await setupVite(app, hmrServer);

    expect(createViteServer).toHaveBeenCalledWith(
      expect.objectContaining({
        configFile: false,
        appType: "custom",
        server: expect.objectContaining({
          middlewareMode: true,
          allowedHosts: true,
          hmr: { server: hmrServer },
        }),
      })
    );
    hmrServer.close();
  });

  it("serves the dev index.html with a cache-busting query on the entry", async () => {
    vi.mocked(createViteServer).mockResolvedValue({
      middlewares: vi.fn((_req: any, _res: any, next: any) => next()),
      transformIndexHtml: vi.fn((_url: string, tpl: string) => tpl),
      ssrFixStacktrace: vi.fn(),
    } as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(TEMPLATE);

    const app = express();
    await start(app);
    await setupVite(app, server);

    const res = await fetch(`${baseUrl}/any-route`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('src="/src/main.tsx?v=');
  });

  it("fixes the stacktrace and forwards the error when the template read fails", async () => {
    const ssrFixStacktrace = vi.fn();
    vi.mocked(createViteServer).mockResolvedValue({
      middlewares: vi.fn((_req: any, _res: any, next: any) => next()),
      transformIndexHtml: vi.fn((_url: string, tpl: string) => tpl),
      ssrFixStacktrace,
    } as any);
    vi.mocked(fs.promises.readFile).mockRejectedValue(new Error("enoent"));

    const app = express();
    await start(app);
    await setupVite(app, server);

    const res = await fetch(`${baseUrl}/any-route`);
    expect(res.status).toBe(500);
    expect(ssrFixStacktrace).toHaveBeenCalledTimes(1);
  });
});
