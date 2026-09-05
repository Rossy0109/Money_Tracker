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
const dashboardLayoutSource = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);

describe("Bengali category budget alert wiring", () => {
  it("renders accessible project-scoped overspending alerts with the exact overage", () => {
    expect(dashboardSource).toContain("budgetAlerts.length > 0");
    expect(dashboardSource).toContain("<Alert");
    expect(dashboardSource).toContain("বাজেট সীমা অতিক্রম হয়েছে");
    expect(dashboardSource).toContain("সীমার চেয়ে {bdt(alert.exceededAmount)} বেশি");
  });

  it("refetches fresh overview data after expense mutations for immediate feedback", () => {
    expect(dashboardSource).toContain("await refresh();\n      const budgetAlertStatus");
    expect(dashboardSource).toContain("utils.finance.overview.fetch({ projectId })");
    expect(dashboardSource).toContain("showBudgetAlertForTransaction");
    expect(dashboardSource).toContain("ক্যাটাগরির বাজেট সীমা অতিক্রম হয়েছে");
    expect(dashboardSource).toContain("বাজেট সতর্কতা যাচাই করা যায়নি");
  });

  it("renders 80% and 90% Bengali early warnings and uses fresh overview data for them", () => {
    expect(dashboardSource).toContain("budgetEarlyWarnings.length > 0");
    expect(dashboardSource).toContain("বাজেটের কাছাকাছি পৌঁছেছে");
    expect(dashboardSource).toContain("বাজেটের {warning.threshold}% খরচ হয়েছে");
    expect(dashboardSource).toContain("updatedOverview.budgetEarlyWarnings.find");
    expect(dashboardSource).toContain("earlyWarning?.threshold === 90");
  });

  it("keeps compact-screen navigation touch-friendly and safe-area aware", () => {
    expect(dashboardSource).toContain('aria-label="বাজেট যোগ বা সংশোধন করুন"');
    expect(dashboardSource).toContain("grid w-full gap-2 rounded-2xl");
    expect(dashboardSource).toContain("sm:grid-cols-2 lg:flex lg:w-auto");
    expect(dashboardSource).toContain("h-11 w-full rounded-xl");
    expect(dashboardLayoutSource).toContain('aria-label="নেভিগেশন মেনু খুলুন"');
    expect(dashboardLayoutSource).toContain("h-11 w-11");
    expect(dashboardLayoutSource).toContain("safe-area-inset");
  });
});
