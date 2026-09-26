import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirnameFromMetaUrl } from "../../dirname";

const appRoot = resolve(dirnameFromMetaUrl(import.meta.url), "../..");

describe("OAuth login safety", () => {
  it("only begins OAuth from explicit auth flows, not global API error observers", () => {
    const source = readFileSync(
      resolve(appRoot, "client/src/main.tsx"),
      "utf8"
    );

    expect(source).not.toContain('import { startLogin } from "./const"');
    expect(source).not.toContain("redirectToLoginIfUnauthorized");
    expect(source).not.toContain("startLogin();");
    expect(source).toContain('console.error("[API Query Error]", error)');
    expect(source).toContain('console.error("[API Mutation Error]", error)');
  });
});
