import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type VercelRoute = {
  src?: string;
  dest?: string;
};

describe("Vercel nested API routing", () => {
  it("routes every nested API path through the committed catch-all function", () => {
    const configPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { routes?: VercelRoute[] };

    expect(config.routes).toContainEqual({
      src: "/api/(.*)",
      dest: "/api/[...path]?path=$1",
    });
  });
});
