import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("api", { recursive: true });

await build({
  entryPoints: ["server/vercel-handler.ts"],
  outfile: "api/[...path].mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  sourcemap: false,
  legalComments: "none",
});
