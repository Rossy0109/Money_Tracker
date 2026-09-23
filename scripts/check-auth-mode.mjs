#!/usr/bin/env node
/**
 * Verifies AUTH_MODE and VITE_AUTH_MODE agree after loading the same env layers
 * Vite would use for the given mode. Run before `vite build` or `tsx watch`.
 *
 * Usage:  node scripts/check-auth-mode.mjs [development|production]
 */
import { config as dotenvConfig } from "dotenv";

const mode = process.argv[2] || (process.env.NODE_ENV === "production" ? "production" : "development");
const DEV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const PROD_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];
const files = mode === "production" ? PROD_FILES : DEV_FILES;

for (const [i, file] of files.entries()) {
  dotenvConfig({ path: file, override: i > 0 });
}

const serverMode = process.env.AUTH_MODE;
const clientMode = process.env.VITE_AUTH_MODE;

// Treat Vercel CLI placeholders and empty strings as "not set"
const PLACEHOLDER = "[SENSITIVE]";
const isReal = v => typeof v === "string" && v.length > 0 && v !== PLACEHOLDER;
const sm = isReal(serverMode) ? serverMode : undefined;
const cm = isReal(clientMode) ? clientMode : undefined;

if (!sm && !cm) {
  process.exit(0);
}

// If only one side has a real value and the other is a Vercel placeholder or
// absent, warn but don't fail — on Vercel the real values are injected.
if (!sm || !cm) {
  console.warn(
    `[check-auth-mode] Warning: only one mode is set (AUTH_MODE=${serverMode ?? "unset"}, ` +
      `VITE_AUTH_MODE=${clientMode ?? "unset"}). Both should be set in the same layer.`,
  );
  process.exit(0);
}

if (sm !== cm) {
  console.error(
    `[check-auth-mode] Mode mismatch: AUTH_MODE=${sm} but VITE_AUTH_MODE=${cm}. ` +
      "Set both to the same value in the same environment layer (.env / .env.development.local / Vercel env).",
  );
  process.exit(1);
}

console.log(`[check-auth-mode] OK: AUTH_MODE=${sm} === VITE_AUTH_MODE=${cm} (${mode} mode)`);
process.exit(0);
