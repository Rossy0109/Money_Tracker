import { config } from "dotenv";
import { fileURLToPath } from "node:url";

for (const name of [".env.test.local", ".env.local", ".env"]) {
  config({
    path: fileURLToPath(new URL(`../${name}`, import.meta.url)),
    override: false,
    quiet: true,
  });
}

export function getIsolatedE2EDatabaseUrl() {
  const value =
    process.env.ISOLATED_E2E_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!value)
    throw new Error(
      "ISOLATED_E2E_DATABASE_URL or a local DATABASE_URL is required for E2E tests"
    );
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("E2E database URL is invalid");
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("E2E tests refuse to use a non-local database");
  }
  const database = url.pathname.replace(/^\//, "");
  if (!database || database.startsWith("money_tracker_e2e_")) {
    throw new Error("E2E source database must be a non-test local database");
  }
  return url;
}
