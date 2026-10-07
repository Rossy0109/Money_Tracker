#!/usr/bin/env node
/**
 * Enforces DEPENDENCY-POLICY.md in CI: a dependency may not move across a
 * semver major without explicit approval. Additions, removals and patch/minor
 * range moves pass.
 *
 * Usage:
 *   node scripts/check-dependency-policy.mjs [--base <git-ref>] [--head <git-ref>]
 *                                             [--allow <pkg>]...
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * Packages cleared for major bumps. DEPENDENCY-POLICY requires explicit
 * approval per major, so adding an entry here is that approval record.
 */
const MAJOR_ALLOWLIST = new Set();

export function majorOf(range) {
  if (typeof range !== "string") return null;
  let spec = range.trim();
  if (spec.startsWith("npm:")) spec = spec.slice(spec.lastIndexOf("@") + 1);
  spec = spec.replace(/^[\^~>=<\s]+/, "");
  const match = /^v?(\d+)/.exec(spec);
  return match ? Number(match[1]) : null;
}

export function collectMajorBumps(basePkg, headPkg, allowlist = MAJOR_ALLOWLIST) {
  const bumps = [];
  const seen = new Set();
  for (const field of DEP_FIELDS) {
    const baseDeps = basePkg?.[field] ?? {};
    const headDeps = headPkg?.[field] ?? {};
    for (const name of Object.keys(headDeps)) {
      const key = `${field}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!(name in baseDeps)) continue;
      if (allowlist.has(name)) continue;
      const from = majorOf(baseDeps[name]);
      const to = majorOf(headDeps[name]);
      if (from === null || to === null || to <= from) continue;
      bumps.push({ field, name, from: baseDeps[name], to: headDeps[name] });
    }
  }
  return bumps;
}

export function checkPackageJson(basePkg, headPkg, allowlist = MAJOR_ALLOWLIST) {
  const bumps = collectMajorBumps(basePkg, headPkg, allowlist);
  if (bumps.length === 0) return { ok: true, bumps };
  const lines = bumps.map(
    (b) => `  ${b.name}: ${b.from} -> ${b.to}  (${b.field})`,
  );
  const plural = bumps.length > 1 ? "s" : "";
  return {
    ok: false,
    bumps,
    message: [
      `Major dependency bump${plural} require${plural} explicit approval (DEPENDENCY-POLICY.md):`,
      ...lines,
      "",
      "Either split the bump into its own PR and record the approval, or re-run with",
      "--allow <pkg> once the migration is understood.",
    ].join("\n"),
  };
}

function readPackageJson(ref) {
  const raw = execFileSync("git", ["show", `${ref}:package.json`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const args = { base: "HEAD^", head: "HEAD", allow: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--base") args.base = argv[++i];
    else if (flag === "--head") args.head = argv[++i];
    else if (flag === "--allow") args.allow.push(argv[++i]);
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const allowlist = new Set([...MAJOR_ALLOWLIST, ...args.allow]);
  const result = checkPackageJson(
    readPackageJson(args.base),
    readPackageJson(args.head),
    allowlist,
  );
  if (result.ok) {
    console.log(`dependency-policy: no major bumps between ${args.base} and ${args.head}`);
    return 0;
  }
  console.error(result.message);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
