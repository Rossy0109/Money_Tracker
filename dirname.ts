import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function dirnameFromMetaUrl(metaUrl: string): string {
  const url = new URL(metaUrl);
  return url.pathname.replace(/\/[^/]*$/, "");
}

/**
 * Walks up from the calling module until the directory holding package.json.
 * dirname alone is wrong here: server modules live in server/_core (dev) or
 * dist (bundled node server), never at the project root itself.
 */
export function resolveProjectRoot(metaUrl: string): string {
  let dir: string;
  try {
    dir = path.dirname(fileURLToPath(metaUrl));
  } catch {
    return process.cwd();
  }
  for (let i = 0; i < 8; i++) {
    try {
      if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    } catch {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}