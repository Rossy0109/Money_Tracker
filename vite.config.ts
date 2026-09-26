import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { dirnameFromMetaUrl } from "./dirname.ts";

const __dirname = dirnameFromMetaUrl(import.meta.url);

/**
 * Umami analytics is injected through `%VITE_*%` placeholders in index.html.
 * Vite only substitutes a placeholder when the variable is present in the
 * resolved env, so an unconfigured (or differently named) variable both emits a
 * build warning and leaves the raw "%VITE_...%" text in the shipped HTML, which
 * then becomes an invalid script source in production browsers.
 *
 * Vite resolves HTML placeholders from `import.meta.env.*` entries in `define`,
 * so declaring the two keys here — falling back to an empty string — keeps
 * builds warning-free and the output valid. The values are read with the same
 * `loadEnv` call Vite itself uses, so a properly configured deployment still
 * gets its real endpoint, and the inline bootstrapper in index.html skips
 * injection when the values are blank.
 */
const ANALYTICS_ENV_KEYS = [
  "VITE_ANALYTICS_ENDPOINT",
  "VITE_ANALYTICS_WEBSITE_ID",
];

const analyticsPlaceholders = (envDir: string): Plugin => ({
  name: "html-env-placeholders",
  config: (config, configEnv) => {
    const loaded = loadEnv(configEnv.mode, config.envDir ?? envDir, "VITE_");
    const runtime = configEnv as unknown as Record<string, unknown>;
    return {
      define: Object.fromEntries(
        ANALYTICS_ENV_KEYS.map(key => [
          `import.meta.env.${key}`,
          JSON.stringify(
            typeof runtime[key] === "string"
              ? (runtime[key] as string)
              : (loaded[key] ?? process.env[key] ?? "")
          ),
        ])
      ),
    };
  },
});

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  analyticsPlaceholders(path.resolve(__dirname)),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(__dirname),
  root: path.resolve(__dirname, "client"),
  publicDir: path.resolve(__dirname, "client", "public"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (!path.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|wouter)\//.test(path))
            return "vendor-react";
          if (/node_modules\/recharts\//.test(path)) return "vendor-charts";
          if (/node_modules\/(@tanstack|@trpc)\//.test(path))
            return "vendor-query";
          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
