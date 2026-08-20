import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "../..");

describe("OAuth login safety", () => {
  it("only begins OAuth from explicit auth flows, not global API error observers", () => {
    const source = readFileSync(resolve(appRoot, "client/src/main.tsx"), "utf8");

    expect(source).not.toContain('import { startLogin } from "./const"');
    expect(source).not.toContain("redirectToLoginIfUnauthorized");
    expect(source).not.toContain("startLogin();");
    expect(source).toContain('console.error("[API Query Error]", error)');
    expect(source).toContain('console.error("[API Mutation Error]", error)');
  });
});
