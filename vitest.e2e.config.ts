import { defineConfig } from "vitest/config";
import path from "path";
import { dirnameFromMetaUrl } from "./dirname.ts";

const templateRoot = path.resolve(dirnameFromMetaUrl(import.meta.url));

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.e2e.ts"],
    // The default 5s budget is only enough when the host is fast. The
    // "plays all client-called procedures" case seeds a book and replays every
    // client procedure, so it measures ~3s on a fast runner but blows past 5s
    // on a slow or loaded host — the assertion is identical either way. Only
    // the wall-clock budget widens; no expectation is relaxed.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
