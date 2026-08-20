import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardLayout = readFileSync(
  new URL("../components/DashboardLayout.tsx", import.meta.url),
  "utf8"
);
const homeSource = readFileSync(new URL("Home.tsx", import.meta.url), "utf8");
const categoriesSource = readFileSync(new URL("Categories.tsx", import.meta.url), "utf8");

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
