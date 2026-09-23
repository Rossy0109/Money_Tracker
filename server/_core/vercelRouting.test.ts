import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type VercelRoute = {
  src?: string;
  dest?: string;
};

type VercelCron = {
  path: string;
  schedule: string;
};

type VercelConfig = {
  routes?: VercelRoute[];
  crons?: VercelCron[];
};

const configPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
const appSourcePath = fileURLToPath(new URL("./app.ts", import.meta.url));

function loadVercelConfig(): VercelConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as VercelConfig;
}

describe("Vercel nested API routing", () => {
  it("routes every nested API path through the committed catch-all function", () => {
    const config = loadVercelConfig();

    expect(config.routes).toContainEqual({
      src: "/api/(.*)",
      dest: "/api/[...path]?path=$1",
    });
  });

  it("only routes API paths through the committed catch-all function", () => {
    const config = loadVercelConfig();

    for (const route of config.routes ?? []) {
      expect(route.src?.startsWith("/api/")).toBe(true);
    }
  });
});

describe("Vercel Cron method alignment", () => {
  it("registers every vercel.json cron path with app.all (GET+POST) so method mismatch cannot 404", () => {
    const config = loadVercelConfig();
    const appSource = readFileSync(appSourcePath, "utf8");
    const crons = config.crons ?? [];

    expect(crons.length).toBeGreaterThan(0);

    for (const cron of crons) {
      expect(cron.path).toMatch(/^\/api\/scheduled\//);

      // Vercel Cron always invokes GET; GitHub Actions historically uses POST.
      // app.all covers both — a lone app.post would 404 production Vercel Cron.
      const registersAll = appSource.includes(`app.all("${cron.path}"`);
      const registersGetAndPost =
        appSource.includes(`app.get("${cron.path}"`) &&
        appSource.includes(`app.post("${cron.path}"`);

      expect(
        registersAll || registersGetAndPost,
        `cron path ${cron.path} must be registered for GET (Vercel Cron) and POST`,
      ).toBe(true);

      // Explicitly fail if only POST is registered (the historical bug).
      const postOnly =
        appSource.includes(`app.post("${cron.path}"`) &&
        !appSource.includes(`app.get("${cron.path}"`) &&
        !appSource.includes(`app.all("${cron.path}"`);
      expect(postOnly, `${cron.path} must not be POST-only`).toBe(false);
    }
  });

  it("keeps the backup cron path present in both vercel.json and the Express app", () => {
    const config = loadVercelConfig();
    const appSource = readFileSync(appSourcePath, "utf8");

    expect(config.crons?.some(c => c.path === "/api/scheduled/finance-backup")).toBe(true);
    expect(appSource).toContain('"/api/scheduled/finance-backup"');
    expect(appSource).toMatch(/app\.(all|get)\("\/api\/scheduled\/finance-backup"/);
  });
});