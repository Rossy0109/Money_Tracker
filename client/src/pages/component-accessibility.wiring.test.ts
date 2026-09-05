import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Home.tsx"),
  "utf8"
);
const metricsPath = resolve(process.cwd(), "client/src/components/dashboard/DashboardMetrics.tsx");
const metricsSource = existsSync(metricsPath) ? readFileSync(metricsPath, "utf8") : "";
const source = homeSource + "\n" + metricsSource;

describe("dashboard component accessibility wiring", () => {
  it("associates native form controls with their labels", () => {
    expect(source).toContain("const generatedId = useId()");
    expect(source).toContain("<Label htmlFor={controlId}>{label}</Label>");
    expect(source).toContain("cloneElement(children, { id: controlId })");
  });

  it("keeps visible administrator and payment controls in Bengali", () => {
    expect(source).toContain("অ্যাডমিন নিয়ন্ত্রণ");
    expect(source).toContain('value="Cash">নগদ</option>');
    expect(source).toContain('value="Bank Transfer">ব্যাংক ট্রান্সফার</option>');
  });
});
