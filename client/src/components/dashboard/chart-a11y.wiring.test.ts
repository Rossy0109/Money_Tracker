import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(
    process.cwd(),
    "client/src/components/dashboard/MonthlyTrendChart.tsx"
  ),
  "utf8"
);

/**
 * The six-month income/expense bar chart is a meaningful
 * graphic: it needs an accessible name, and the recharts
 * accessibility layer gives keyboard users arrow-key
 * navigation over the data points.
 */
describe("monthly trend chart accessibility", () => {
  it("labels the chart graphic for assistive technology", () => {
    expect(source).toContain('role="img"');
    expect(
      source
    ).toContain('aria-label="গত ৬ মাসের আয় ও ব্যয়ের বার চার্ট"');
  });

  it("enables the recharts accessibility layer", () => {
    expect(source).toContain("accessibilityLayer");
  });
});
