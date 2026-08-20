import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("Home.tsx", import.meta.url), "utf8");
const categoriesSource = readFileSync(new URL("Categories.tsx", import.meta.url), "utf8");

describe("dedicated category pages", () => {
  it("keeps categories out of the dashboard and exposes separate income and expense routes", () => {
    expect(appSource).toContain('path={"/categories"} component={Categories}');
    expect(appSource).toContain('path={"/categories/:type"} component={Categories}');
    expect(categoriesSource).toContain('href={`/categories/${type}`}');
    expect(categoriesSource).toContain('href={`/categories/${otherType}`}');
    expect(categoriesSource).toContain('href="/"');
    expect(categoriesSource).toContain("ড্যাশবোর্ডে ফিরুন");
    expect(categoriesSource).toContain('selectedType === "income"');
    expect(homeSource).not.toContain('id="categories"');
  });

  it("uses one page landmark and focus-visible return routes", () => {
    expect(categoriesSource).toContain('main className="mx-auto w-full max-w-6xl space-y-7 pb-12"');
    expect(categoriesSource).toContain("focus-visible:ring-2 focus-visible:ring-[#54b86a]");
  });
});
