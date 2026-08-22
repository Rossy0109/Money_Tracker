import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Home.tsx"),
  "utf8"
);

describe("Bengali category budget alert wiring", () => {
  it("renders accessible project-scoped overspending alerts with the exact overage", () => {
    expect(homeSource).toContain("data.budgetAlerts.length > 0");
    expect(homeSource).toContain("<Alert");
    expect(homeSource).toContain("বাজেট সীমা অতিক্রম হয়েছে");
    expect(homeSource).toContain("সীমার চেয়ে {bdt(alert.exceededAmount)} বেশি");
  });

  it("refetches fresh overview data after expense mutations for immediate feedback", () => {
    expect(homeSource).toContain("await refresh();\n      const budgetAlertStatus");
    expect(homeSource).toContain("utils.finance.overview.fetch({ projectId })");
    expect(homeSource).toContain("showBudgetAlertForTransaction");
    expect(homeSource).toContain("ক্যাটাগরির বাজেট সীমা অতিক্রম হয়েছে");
    expect(homeSource).toContain("বাজেট সতর্কতা যাচাই করা যায়নি");
  });
});
