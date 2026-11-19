import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Fast architecture guard (runs in CI job id `worker`, a legacy check name).
 *
 * docs/adr/0001-express-only-runtime.md retired Hono + the Cloudflare Worker.
 * These assertions make reintroducing a second runtime, a Worker build, or a
 * duplicate scheduler fail immediately, without needing a database.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const SCHEDULED_WORKFLOWS = [
  "accounting-audit.yml",
  "daily-backup.yml",
  "daily-finance-jobs.yml",
  "health-watch.yml",
  "maintenance-report.yml",
  "weekly-restore-drill.yml",
];

const SOURCE_ROOTS = ["server", "shared", "client/src", "scripts", "api"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const GUARD_FILE = join(root, "server/_core/architecture-guard.test.ts");
const FORBIDDEN_SOURCE_PATTERNS: Array<[RegExp, string]> = [
  [/from\s+["']hono(?:\/[^"']*)?["']/, "Hono import"],
  [/require\(\s*["']hono(?:\/[^"']*)?["']\s*\)/, "Hono require"],
  [/cloudflare:sockets/, "Cloudflare sockets"],
];

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(full));
    } else if (entry.isFile()) {
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (SOURCE_EXTENSIONS.has(extension) && full !== GUARD_FILE) {
        files.push(full);
      }
    }
  }
  return files;
}

const SCHEDULED_ROUTES = [
  "/api/scheduled/finance-recurring",
  "/api/scheduled/finance-bill-reminder",
  "/api/scheduled/finance-backup",
  "/api/scheduled/backup-audit",
  "/api/scheduled/accounting-audit",
  "/api/scheduled/restore-drill",
  "/api/scheduled/daily-sweep",
];

describe("Cloudflare Worker and Hono are gone", () => {
  it("has no Worker sources or build configuration", () => {
    for (const path of [
      "worker",
      "wrangler.toml",
      "wrangler.json",
      "wrangler.jsonc",
      "vitest.worker.config.ts",
      ".github/workflows/deploy-cloudflare.yml",
    ]) {
      expect(existsSync(join(root, path)), `${path} must not exist`).toBe(false);
    }
  });

  it("declares no Worker-only dependency or script", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    for (const name of ["hono", "wrangler", "@cloudflare/workers-types"]) {
      expect(pkg.dependencies?.[name], `${name} dependency`).toBeUndefined();
      expect(pkg.devDependencies?.[name], `${name} devDependency`).toBeUndefined();
    }
    for (const script of ["test:worker", "build:worker", "deploy:worker"]) {
      expect(pkg.scripts?.[script], `${script} script`).toBeUndefined();
    }
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      expect(command, `${name} script must not invoke wrangler`).not.toContain(
        "wrangler"
      );
    }
  });

  it("does not compile Worker sources or types", () => {
    const tsconfig = read("tsconfig.json");
    expect(tsconfig).not.toContain("worker/**/*");
    expect(tsconfig).not.toContain("@cloudflare/workers-types");
  });

  it("has no workflow that deploys to Cloudflare", () => {
    const dir = join(root, ".github", "workflows");
    const files = readdirSync(dir).filter(
      file => file.endsWith(".yml") || file.endsWith(".yaml")
    );
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, `${file} must not run wrangler deploy/publish`).not.toMatch(
        /wrangler\s+(deploy|publish)/
      );
      expect(source, `${file} must not use a Cloudflare deploy action`).not.toMatch(
        /cloudflare\/wrangler-action/
      );
    }
  });

  it("has no source file importing Hono or cloudflare:sockets", () => {
    for (const sourceRoot of SOURCE_ROOTS) {
      const dir = join(root, sourceRoot);
      if (!existsSync(dir)) continue;
      for (const file of walkSourceFiles(dir)) {
        const source = readFileSync(file, "utf8");
        for (const [pattern, label] of FORBIDDEN_SOURCE_PATTERNS) {
          expect(source, `${file} must not contain ${label}`).not.toMatch(
            pattern
          );
        }
      }
    }
  });
});

describe("Express is the single runtime", () => {
  it("registers all seven scheduled routes on the Express app", () => {
    const appSource = read("server/_core/app.ts");
    for (const route of SCHEDULED_ROUTES) {
      expect(appSource, `${route} must be registered`).toContain(
        `app.all("${route}"`
      );
    }
  });

  it("uses the Express tRPC adapter", () => {
    expect(read("server/_core/app.ts")).toContain("createExpressMiddleware");
  });

  it("routes Vercel through the bundled Express handler", () => {
    expect(read("api/[...path].js")).toContain(
      'import handler from "../dist/vercel-handler.js"'
    );
  });
});

describe("GitHub Actions is the sole scheduler", () => {
  it("keeps Vercel cron configuration absent", () => {
    const vercel = JSON.parse(read("vercel.json")) as { crons?: unknown };
    expect(vercel.crons).toBeUndefined();
  });

  it("keeps the scheduled-workflow allowlist exact", () => {
    const dir = join(root, ".github", "workflows");
    const files = readdirSync(dir).filter(
      file => file.endsWith(".yml") || file.endsWith(".yaml")
    );
    const scheduled = files.filter(file =>
      /^ {2}schedule:\s*$/m.test(readFileSync(join(dir, file), "utf8"))
    );

    expect(new Set(scheduled)).toEqual(new Set(SCHEDULED_WORKFLOWS));
  });
});
