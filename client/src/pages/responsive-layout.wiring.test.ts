import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = resolve(process.cwd(), "client/src/pages");

const listTsxFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listTsxFiles(path));
    } else if (entry.endsWith(".tsx")) {
      files.push(path);
    }
  }
  return files;
};

const classNameOf = (source: string): string[] =>
  Array.from(source.matchAll(/className=\s*"([^"]*)"/g)).map(match => match[1]);

/**
 * Wide grids need a breakpoint variant. Without one they stay at their column
 * count at every width, so a `grid-cols-12` or `grid-cols-3` row gets crushed
 * into a few dozen pixels on a phone instead of stacking.
 *
 * Each allowlisted entry is deliberately narrow (width-capped controls that
 * stay usable at 320px) so a new unprefixed grid fails this test.
 */
const ALLOWED_COMPACT_GRIDS = [
  "grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#edf3ee]",
  "bg-white p-1.5 rounded-2xl border border-[#dce7df] grid grid-cols-3 max-w-md h-auto shadow-sm",
  "bg-[#eef4f0] p-1 rounded-2xl h-12 grid grid-cols-3 max-w-lg mb-6",
];

describe("responsive layout wiring", () => {
  it("stacks the invoice line-item and date rows on narrow screens", () => {
    const source = readFileSync(join(PAGES_DIR, "Invoices.tsx"), "utf8");

    expect(source).toContain(
      "grid grid-cols-2 gap-2 items-center bg-[#fafdfb] p-2.5 rounded-xl border border-[#e4ede7] sm:grid-cols-12"
    );
    expect(source).toContain('className="col-span-2 sm:col-span-5"');
    expect(source).toContain('className="sm:col-span-2"');
    expect(source).toContain("{/* Dates */}");
    expect(source).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
  });

  it("stacks the payroll disbursement amount fields on narrow screens", () => {
    const source = readFileSync(join(PAGES_DIR, "Payroll.tsx"), "utf8");

    expect(source).toContain("grid grid-cols-1 gap-3 sm:grid-cols-3");
    expect(source).not.toContain('className="grid grid-cols-3 gap-3"');
  });

  it("keeps every other wide grid on a page responsive or explicitly compact", () => {
    const offenders: string[] = [];

    for (const file of listTsxFiles(PAGES_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const className of classNameOf(source)) {
        for (const match of className.matchAll(/(?<![:\w-])grid-cols-(\d+)/g)) {
          if (Number(match[1]) < 3) continue;
          const responsive = /(sm|md|lg|xl|2xl):grid-cols-\d+/.test(className);
          if (responsive) continue;
          if (ALLOWED_COMPACT_GRIDS.includes(className)) continue;
          offenders.push(
            `${file.replace(process.cwd() + "/", "")}: ${className}`
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the shell switches that separate the phone and desktop layouts", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
      "utf8"
    );
    // Phone: sticky top bar with a hamburger, hidden once the desktop rail shows.
    expect(layout).toContain("md:hidden");
    expect(layout).toContain("SidebarTrigger");
    expect(layout).toContain("max-w-[1600px]");

    const sidebar = readFileSync(
      resolve(process.cwd(), "client/src/components/ui/sidebar.tsx"),
      "utf8"
    );
    // Desktop rail is hidden below md; the phone gets a Sheet drawer instead.
    expect(sidebar).toContain("hidden md:block");
    expect(sidebar).toContain("Sheet");
    expect(sidebar).toContain("useIsMobile");
  });

  it("keeps data tables horizontally scrollable instead of overflowing the page", () => {
    const table = readFileSync(
      resolve(process.cwd(), "client/src/components/ui/table.tsx"),
      "utf8"
    );
    expect(table).toContain("overflow-x-auto");

    const transactions = readFileSync(
      resolve(
        process.cwd(),
        "client/src/components/dashboard/TransactionsPanel.tsx"
      ),
      "utf8"
    );
    expect(transactions).toContain("min-w-[560px]");
    expect(transactions).toContain("overflow-x-auto");
  });
});
