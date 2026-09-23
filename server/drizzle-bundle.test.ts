import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression: "ReferenceError: drizzle is not defined" in production.
 *
 * The DB factory must import `drizzle` from drizzle-orm/mysql2, and both
 * production bundles must retain that import (esbuild packages:external).
 */
describe("drizzle runtime availability", () => {
  it("server/_core/dbConnection.ts imports drizzle from drizzle-orm/mysql2", () => {
    const src = readFileSync(new URL("./_core/dbConnection.ts", import.meta.url), "utf8");
    expect(src).toMatch(/import\s*\{\s*drizzle\s*\}\s*from\s*["']drizzle-orm\/mysql2["']/);
    expect(src).toMatch(/_db\s*=\s*drizzle\(/);
  });

  it("server/db.ts re-exports getDb from dbConnection (no local drizzle)", () => {
    const src = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(src).toMatch(/from\s*["']\.\/_core\/dbConnection["']/);
    expect(src).toMatch(/export\s*\{[^}]*getDb[^}]*\}/);
    expect(src).not.toMatch(/_db\s*=\s*drizzle\(/);
  });

  it("does not reference an undeclared drizzle identifier", () => {
    const src = readFileSync(new URL("./_core/dbConnection.ts", import.meta.url), "utf8");
    // Every bare `drizzle(` call site must be covered by the named import above.
    const importLine = src
      .split("\n")
      .find(l => l.includes("drizzle-orm/mysql2"));
    expect(importLine).toBeDefined();
    expect(importLine).toContain("drizzle");
  });

  it.runIf(existsSync(new URL("../dist/vercel-handler.js", import.meta.url)))(
    "bundled vercel handler retains drizzle-orm/mysql2 import",
    () => {
      const bundle = readFileSync(new URL("../dist/vercel-handler.js", import.meta.url), "utf8");
      expect(bundle).toContain('from "drizzle-orm/mysql2"');
      expect(bundle).toMatch(/_db\s*=\s*drizzle\(/);
    },
  );

  it.runIf(existsSync(new URL("../dist/index.js", import.meta.url)))(
    "bundled node server retains drizzle-orm/mysql2 import",
    () => {
      const bundle = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
      expect(bundle).toContain('from "drizzle-orm/mysql2"');
      expect(bundle).toMatch(/_db\s*=\s*drizzle\(/);
    },
  );
});
