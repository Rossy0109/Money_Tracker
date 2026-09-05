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

const dashboardSource = getCombinedSource();
const layoutSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

describe("Bengali data-entry discoverability", () => {
  it("provides prominent transaction-entry controls that use the shared secure dialog opener", () => {
    expect(dashboardSource).toContain("function openNewTransaction()");
    expect(dashboardSource).toContain("লেনদেন যোগ করুন");
    expect(dashboardSource).toContain("এখনই লেনদেন যোগ করুন");
    expect(dashboardSource).toContain("onClick={openNewTransaction}");
    expect(dashboardSource).toContain("onAdd={openNewTransaction}");
  });

  it("explains related data-entry locations and keeps a persistent navigation path", () => {
    expect(dashboardSource).toContain("দ্রুত ডেটা এন্ট্রি");
    expect(dashboardSource).toContain("অ্যাকাউন্ট, বাজেট ও বিল যোগ করার বাটন");
    expect(layoutSource).toContain("নতুন লেনদেন যোগ করুন");
    expect(layoutSource).toContain('href="/#transactions"');
  });
});
