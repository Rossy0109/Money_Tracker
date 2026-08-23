import { access, cp, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, "dist", "public");
const publicDirectory = path.join(projectRoot, "public");

try {
  await access(sourceDirectory);
} catch {
  throw new Error("Vite output পাওয়া যায়নি; আগে pnpm run build চালান।");
}

await rm(publicDirectory, { recursive: true, force: true });
await cp(sourceDirectory, publicDirectory, { recursive: true });
