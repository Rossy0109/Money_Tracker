import { defineConfig } from "vitest/config";
import path from "path";
import { dirnameFromMetaUrl } from "./dirname";

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
  },
});
