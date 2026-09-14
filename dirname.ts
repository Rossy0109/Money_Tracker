import fs from "node:fs";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the directory of an ES module from its `import.meta.url`.
 *
 * This is a portable replacement for `import.meta.dirname` (Node >= 20.11) that
 * works on every Node version that can run this project's ESM output, including
 * tooling that transpiles the module before executing it.
 */
export function dirnameFromMetaUrl(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Resolve the project root from any module's `import.meta.url`.
 *
 * The module may run in place (source via tsx) or live inside a bundled
 * `dist/index.js`; walk up until a directory that owns `package.json` and the
 * `client` source tree is found.
 */
export function resolveProjectRoot(importMetaUrl: string): string {
  let dir = dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, "package.json")) &&
      fs.existsSync(path.join(dir, "client"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not resolve project root from ${importMetaUrl}`);
}