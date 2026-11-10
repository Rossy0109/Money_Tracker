import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../.github/workflows/db-reconcile.yml", import.meta.url),
  "utf8"
);

describe("db-reconcile workflow credentials", () => {
  it("uses the production-only secret", () => {
    expect(source).toContain("secrets.PROD_DATABASE_URL");
  });

  it("never falls back to the legacy generic DATABASE_URL secret", () => {
    // The repo-level DATABASE_URL secret is a legacy PostgreSQL URL; letting
    // it take precedence made the workflow fail with
    // `unsupported scheme "postgresql"` (F-7).
    expect(source).not.toMatch(/secrets\.DATABASE_URL/);
  });

  it("tells the operator which secret to set when missing", () => {
    expect(source).toContain("PROD_DATABASE_URL secret is not set");
  });
});
