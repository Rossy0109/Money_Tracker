import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const getCombinedSource = () => {
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const dashboardDir = resolve(process.cwd(), "client/src/components/dashboard");
  const dialogsDir = resolve(dashboardDir, "dialogs");
  let combined = home;
  for (const dir of [dashboardDir, dialogsDir]) {
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          combined += "\n" + readFileSync(resolve(dir, file), "utf8");
        }
      }
    } catch {}
  }
  return combined;
};

const source = getCombinedSource();

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
