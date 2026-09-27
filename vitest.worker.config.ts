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
      // `cloudflare:sockets` only exists inside workerd; Node tests get a stub.
      "cloudflare:sockets": path.resolve(
        templateRoot,
        "worker",
        "cloudflareSocketsStub.ts"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["worker/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      ADMIN_ACCESS_PASSWORD: "test-admin-access-password",
      JWT_SECRET: "test-jwt-secret-minimum-32-chars-long",
      SESSION_SECRET: "test-session-secret-minimum-32-chars-long",
      ADMIN_BOOTSTRAP_EMAIL: "admin@example.com",
    },
  },
});
