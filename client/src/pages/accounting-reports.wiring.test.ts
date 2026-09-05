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

describe("Bengali accounting report dashboard wiring", () => {
  it("loads the protected monthly accounting summary for the active project", () => {
    expect(dashboardSource).toContain("const accountingSummary = trpc.finance.monthlyReport.useQuery(");
    expect(dashboardSource).toContain("enabled: isAuthenticated && activeProjectId !== null");
    expect(dashboardSource).toContain("accountingSummary.data.profitAndLoss");
    expect(dashboardSource).toContain("accountingSummary.data.financialPosition");
  });

  it("presents profit-and-loss and financial-position values in Bengali", () => {
    expect(dashboardSource).toContain("ফিনান্সিয়াল অ্যাকাউন্টিং");
    expect(dashboardSource).toContain("নিট লাভ");
    expect(dashboardSource).toContain("নিট ক্ষতি");
    expect(dashboardSource).toContain("নিট আর্থিক অবস্থান");
    expect(dashboardSource).toContain("মোট সম্পদ:");
    expect(dashboardSource).toContain("মোট দেনা:");
  });

  it("keeps individual report selection and user-initiated sharing in the report dialog", () => {
    expect(dashboardSource).toContain("accountingReportOptions.map");
    expect(dashboardSource).toContain("shareMonthlyReport");
    expect(dashboardSource).toContain("Share2");
    expect(dashboardSource).toContain("WhatsApp");
  });
});
