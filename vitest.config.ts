import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

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
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts"],
    env: {
      ADMIN_ACCESS_PASSWORD: "test-admin-access-password",
      JWT_SECRET: "test-jwt-secret-minimum-32-chars-long",
      SESSION_SECRET: "test-session-secret-minimum-32-chars-long",
      ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
    },
  },
});
