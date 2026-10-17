import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveProjectRoot } from "../dirname.ts";

const projectRoot = resolveProjectRoot(import.meta.url);
const fontDir = path.join(projectRoot, "client", "public", "fonts");
const distFontDir = path.join(projectRoot, "dist", "public", "fonts");
const publicFontDir = path.join(projectRoot, "public", "fonts");
const indexHtmlPath = path.join(projectRoot, "client", "index.html");
const vercelJsonPath = path.join(projectRoot, "vercel.json");
const viteConfigPath = path.join(projectRoot, "vite.config.ts");

const VARIABLE_FONT = "NotoSansBengali-Variable.woff2";
const FONT_FAMILY = "Noto Sans Bengali";

// `dist/public/fonts/` is produced by `pnpm build` and root `public/fonts/` by
// `pnpm build:vercel` (prepare-vercel-static.mjs). The CI `test` job only runs
// `pnpm test:coverage`, so those artifacts do not exist there; assert on them
// only when a build has produced them (same convention as
// server/drizzle-bundle.test.ts). The `verify` job re-checks the real build
// output after `pnpm build`.
const hasDistFont = fs.existsSync(path.join(distFontDir, VARIABLE_FONT));
const hasPublicFont = fs.existsSync(path.join(publicFontDir, VARIABLE_FONT));

describe("Bengali font delivery", () => {
  it("variable font source exists in client/public/fonts/", () => {
    const fontPath = path.join(fontDir, VARIABLE_FONT);
    expect(fs.existsSync(fontPath)).toBe(true);
  });

  it.runIf(hasDistFont)("variable font is copied to dist/public/fonts/ after build", () => {
    const fontPath = path.join(distFontDir, VARIABLE_FONT);
    expect(fs.existsSync(fontPath)).toBe(true);
  });

  it.runIf(hasPublicFont)("variable font is copied to public/fonts/ for Vercel output", () => {
    const fontPath = path.join(publicFontDir, VARIABLE_FONT);
    expect(fs.existsSync(fontPath)).toBe(true);
  });

  it("variable font file has valid WOFF2 magic bytes", () => {
    const fontPath = path.join(fontDir, VARIABLE_FONT);
    const buffer = fs.readFileSync(fontPath);
    const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
    expect(magic).toBe("wOF2");
  });

  it("variable font file is non-empty", () => {
    const fontPath = path.join(fontDir, VARIABLE_FONT);
    const stat = fs.statSync(fontPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe("index.html font references", () => {
  let indexHtml: string;

  beforeAll(() => {
    indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
  });

  it("preloads the variable font", () => {
    expect(indexHtml).toContain(`href="/fonts/${VARIABLE_FONT}"`);
  });

  it("uses @font-face with variable font-weight range", () => {
    expect(indexHtml).toContain(`font-family: "${FONT_FAMILY}"`);
    expect(indexHtml).toContain("font-weight: 100 900");
  });

  it("references variable font in @font-face src", () => {
    expect(indexHtml).toContain(
      `src: url("/fonts/${VARIABLE_FONT}") format("woff2")`
    );
  });

  it("does not reference static font files (Regular/SemiBold/Bold)", () => {
    expect(indexHtml).not.toContain("NotoSansBengali-Regular.woff2");
    expect(indexHtml).not.toContain("NotoSansBengali-SemiBold.woff2");
    expect(indexHtml).not.toContain("NotoSansBengali-Bold.woff2");
  });
});

describe("Vercel rewrite configuration", () => {
  let vercelJson: { rewrites?: Array<{ source: string; destination: string }> };

  beforeAll(() => {
    const raw = fs.readFileSync(vercelJsonPath, "utf-8");
    vercelJson = JSON.parse(raw);
  });

  it("has rewrites configuration", () => {
    expect(vercelJson.rewrites).toBeDefined();
    expect(Array.isArray(vercelJson.rewrites)).toBe(true);
    expect(vercelJson.rewrites!.length).toBeGreaterThan(0);
  });

  it("excludes /fonts/ from the SPA catch-all rewrite", () => {
    const rewrite = vercelJson.rewrites!.find(
      r => r.destination === "/index.html"
    );
    expect(rewrite).toBeDefined();
    const source = rewrite!.source;
    const hasFontsExclusion =
      source.includes("fonts") || source.includes("\\.");
    expect(hasFontsExclusion).toBe(true);
  });

  it("font request /fonts/NotoSansBengali-Variable.woff2 does NOT match the rewrite", () => {
    const rewrite = vercelJson.rewrites!.find(
      r => r.destination === "/index.html"
    );
    expect(rewrite).toBeDefined();
    const source = rewrite!.source;
    const pattern = new RegExp(`^${source}$`);
    const fontUrl = "/fonts/NotoSansBengali-Variable.woff2";
    expect(pattern.test(fontUrl)).toBe(false);
  });

  it("SPA route /dashboard DOES match the rewrite", () => {
    const rewrite = vercelJson.rewrites!.find(
      r => r.destination === "/index.html"
    );
    expect(rewrite).toBeDefined();
    const source = rewrite!.source;
    const pattern = new RegExp(`^${source}$`);
    expect(pattern.test("/dashboard")).toBe(true);
  });

  it("API route /api/trpc does NOT match the rewrite", () => {
    const rewrite = vercelJson.rewrites!.find(
      r => r.destination === "/index.html"
    );
    expect(rewrite).toBeDefined();
    const source = rewrite!.source;
    const pattern = new RegExp(`^${source}$`);
    expect(pattern.test("/api/trpc")).toBe(false);
  });
});

describe("Vite public directory configuration", () => {
  it("vite.config.ts references client/public as publicDir", () => {
    const viteConfigSource = fs.readFileSync(viteConfigPath, "utf-8");
    expect(viteConfigSource).toContain("publicDir");
    expect(viteConfigSource).toContain("client");
    expect(viteConfigSource).toContain("public");
  });

  it("client/public/fonts/ contains the variable font", () => {
    const fontPath = path.join(fontDir, VARIABLE_FONT);
    expect(fs.existsSync(fontPath)).toBe(true);
  });
});

describe("Font file integrity", () => {
  it.runIf(hasDistFont)("variable font is the same across source, dist, and public", () => {
    const sourceBuf = fs.readFileSync(path.join(fontDir, VARIABLE_FONT));
    const distBuf = fs.readFileSync(path.join(distFontDir, VARIABLE_FONT));
    expect(Buffer.compare(Buffer.from(sourceBuf), Buffer.from(distBuf))).toBe(0);
  });

  it("variable font file size is reasonable (> 10KB)", () => {
    const fontPath = path.join(fontDir, VARIABLE_FONT);
    const stat = fs.statSync(fontPath);
    expect(stat.size).toBeGreaterThan(10000);
  });
});
