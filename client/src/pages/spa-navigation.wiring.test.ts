import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagesDir = new URL(".", import.meta.url);
const pageFiles = readdirSync(pagesDir).filter(
  f => f.endsWith(".tsx") && !f.endsWith(".test.tsx")
);

// Raw internal anchors trigger a full page reload in the SPA,
// destroying client state (TanStack Query cache, form drafts,
// auth boot). Internal navigation must go through wouter <Link>.
// External URLs (https://...) and pure hash links (#...) are fine.
const INTERNAL_ANCHOR = /<a\s[^>]*href=["'`]\//;

describe("SPA navigation guard (raw internal anchors)", () => {
  for (const file of pageFiles) {
    it(`${file} uses wouter Link for internal routes`, () => {
      const source = readFileSync(new URL(file, pagesDir), "utf8");
      const match = source.match(INTERNAL_ANCHOR);
      expect(
        match ? `raw <a href="/..."> found: ${match[0].trim()}` : null
      ).toBeNull();
    });
  }
});
