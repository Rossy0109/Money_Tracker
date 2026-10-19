import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type VercelRoute = {
  src?: string;
  dest?: string;
};

type VercelConfig = {
  routes?: VercelRoute[];
  crons?: unknown[];
};

const configPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
const appSourcePath = fileURLToPath(new URL("./app.ts", import.meta.url));
const wranglerPath = fileURLToPath(new URL("../../wrangler.toml", import.meta.url));
const ghWorkflowPath = fileURLToPath(
  new URL("../../.github/workflows/daily-backup.yml", import.meta.url)
);

function loadVercelConfig(): VercelConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as VercelConfig;
}

function readAppSource(): string {
  return readFileSync(appSourcePath, "utf8");
}

/**
 * Every scheduled route registered in the Express app, with its method.
 * The external scheduler (GitHub Actions) invokes these with GET, so each must
 * be GET-capable — a POST-only registration is the historical production 404.
 */
function scheduledRegistrations(
  appSource: string
): Array<{ path: string; method: "all" | "get" | "post" }> {
  const out: Array<{ path: string; method: "all" | "get" | "post" }> = [];
  const re = /app\.(all|get|post)\("(\/api\/scheduled\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appSource)) !== null) {
    out.push({ path: m[2], method: m[1] as "all" | "get" | "post" });
  }
  return out;
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

describe("Scheduled endpoint method alignment", () => {
  it("registers every scheduled endpoint for GET so an external scheduler cannot 404", () => {
    const appSource = readAppSource();
    const registrations = scheduledRegistrations(appSource);

    expect(registrations.length).toBeGreaterThan(0);

    for (const reg of registrations) {
      const getCapable =
        appSource.includes(`app.all("${reg.path}"`) ||
        appSource.includes(`app.get("${reg.path}"`);
      expect(getCapable, `${reg.path} must accept GET`).toBe(true);

      const postOnly =
        appSource.includes(`app.post("${reg.path}"`) &&
        !appSource.includes(`app.get("${reg.path}"`) &&
        !appSource.includes(`app.all("${reg.path}"`);
      expect(postOnly, `${reg.path} must not be POST-only`).toBe(false);
    }
  });

  it("keeps the finance-backup endpoint registered and GET-capable", () => {
    const appSource = readAppSource();

    expect(appSource).toContain('app.all("/api/scheduled/finance-backup"');
  });

  it("uses exactly one scheduler (GitHub Actions), with no duplicate cron config", () => {
    // A single scheduler avoids duplicate backup/sweep runs. GitHub Actions is
    // the sole entry point; vercel.json crons and wrangler.toml triggers must
    // stay absent.
    expect(loadVercelConfig().crons).toBeUndefined();
    expect(readFileSync(wranglerPath, "utf8")).not.toMatch(/\[triggers\]/);
    expect(existsSync(ghWorkflowPath)).toBe(true);
  });
});
