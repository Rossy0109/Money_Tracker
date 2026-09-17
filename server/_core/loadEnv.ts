import dotenv from "dotenv";

const DEV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const PROD_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

const AUTH_MODE = new Set(["google", "manus"]);

export function getAuthEnvMode(): "development" | "production" {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Mirrors Vite's client env layering so the server runtime (`AUTH_MODE`,
 * `GOOGLE_OAUTH_*`) reads the same effective values the client bundle was
 * compiled with (`VITE_AUTH_MODE`). Later files win, matching Vite semantics.
 *
 * Missing files are normal (e.g. only `.env` exists); dotenv never throws.
 */
export function loadEnvFiles(mode: "development" | "production" = getAuthEnvMode()) {
  const files = mode === "production" ? PROD_FILES : DEV_FILES;
  for (const [index, file] of files.entries()) {
    dotenv.config({ path: file, override: index > 0 });
  }
}

export function validateAuthMode(mode: string | undefined): mode is "google" | "manus" {
  return typeof mode === "string" && AUTH_MODE.has(mode);
}

loadEnvFiles();