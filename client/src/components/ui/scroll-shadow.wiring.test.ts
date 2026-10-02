import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const SCROLL_SHADOW_SITES: [file: string, expected: number][] = [
  ["client/src/components/ui/table.tsx", 1],
  ["client/src/components/dashboard/TransactionsPanel.tsx", 1],
  ["client/src/pages/FinanceInsights.tsx", 1],
  ["client/src/pages/Inventory.tsx", 1],
  ["client/src/pages/PartyLedger.tsx", 1],
  ["client/src/pages/FinancialStatements.tsx", 1],
  ["client/src/pages/Payroll.tsx", 3],
];

describe("scroll shadow wiring", () => {
  it("fades only the side that still hides content", () => {
    const component = source("client/src/components/ui/scroll-shadow.tsx");

    expect(component).toContain("resolveScrollEdges");
    expect(component).toContain("node.scrollLeft");
    expect(component).toContain("node.scrollWidth");
    expect(component).toContain("node.clientWidth");
    expect(component).toContain("onScroll");
    expect(component).toContain("ResizeObserver");
    expect(component).toContain("scrollerRef");
  });

  it("draws the fades above the table with pointer events disabled", () => {
    const component = source("client/src/components/ui/scroll-shadow.tsx");

    expect(component).toContain("pointer-events-none");
    expect(component).toContain("aria-hidden");
    expect(component).toContain("z-20");
    expect(component).toContain("w-10");
    expect(component).toContain("bg-gradient-to-r");
    expect(component).toContain("bg-gradient-to-l");
    expect(component).toContain("from-white");
    expect(component).toContain("opacity-100");
    expect(component).toContain("opacity-0");
    expect(component).toContain('data-slot="scroll-shadow-start"');
    expect(component).toContain('data-slot="scroll-shadow-end"');
    expect(component).toContain("overflow-x-auto");
  });

  it("keeps every wide table inside a scroll shadow", () => {
    const offenders: string[] = [];

    for (const [file, expected] of SCROLL_SHADOW_SITES) {
      const count = source(file).split("<ScrollShadow").length - 1;
      if (count !== expected) {
        offenders.push(
          `${file}: ${count} <ScrollShadow (expected ${expected})`
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("leaves no bare overflow wrapper behind at those sites", () => {
    for (const [file] of SCROLL_SHADOW_SITES) {
      const text = source(file);
      expect(text.includes('className="overflow-x-auto"')).toBe(false);
    }
  });
});
