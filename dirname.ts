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