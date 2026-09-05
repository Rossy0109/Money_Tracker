import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardLayout = readFileSync(
  resolve(import.meta.dirname, "../components/DashboardLayout.tsx"),
  "utf8"
);

const getCombinedHomeSource = () => {
  const home = readFileSync(resolve(import.meta.dirname, "Home.tsx"), "utf8");
  const dashboardDir = resolve(import.meta.dirname, "../components/dashboard");
  let combined = home;
  try {
    for (const file of readdirSync(dashboardDir)) {
      if (file.endsWith(".tsx") || file.endsWith(".ts")) {
        combined += "\n" + readFileSync(resolve(dashboardDir, file), "utf8");
      }
    }
  } catch {}
  return combined;
};

const homeSource = getCombinedHomeSource();
const categoriesSource = readFileSync(resolve(import.meta.dirname, "Categories.tsx"), "utf8");

describe("sidebar dashboard navigation", () => {
  it("maps each Bengali sidebar hash link to an in-page dashboard target", () => {
    const destinations = [
      "transactions",
      "accounts",
      "budgets",
    ];

    for (const destination of destinations) {
      expect(dashboardLayout).toContain(`href: "/#${destination}"`);
      expect(homeSource).toContain(`id="${destination}"`);
    }
    expect(dashboardLayout).toContain('href: "/"');
    expect(homeSource).toContain('id="overview"');
    expect(homeSource).toContain('id="transactions" className="scroll-mt-20');
    expect(homeSource).toContain('id="accounts" className="scroll-mt-20');
    expect(homeSource).toContain('id="budgets" className="scroll-mt-20');
    expect(dashboardLayout).toContain('href: "/categories"');
    expect(categoriesSource).toContain('href={`/categories/${type}`}');
    expect(categoriesSource).toContain('href="/categories"');
  });
});
