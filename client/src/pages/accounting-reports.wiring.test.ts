import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Home.tsx"),
  "utf8"
);

describe("Bengali accounting report dashboard wiring", () => {
  it("loads the protected monthly accounting summary for the active project", () => {
    expect(homeSource).toContain("const accountingSummary = trpc.finance.monthlyReport.useQuery(");
    expect(homeSource).toContain("enabled: isAuthenticated && activeProjectId !== null");
    expect(homeSource).toContain("accountingSummary.data.profitAndLoss");
    expect(homeSource).toContain("accountingSummary.data.financialPosition");
  });

  it("presents profit-and-loss and financial-position values in Bengali", () => {
    expect(homeSource).toContain("ফিনান্সিয়াল অ্যাকাউন্টিং");
    expect(homeSource).toContain("নিট লাভ");
    expect(homeSource).toContain("নিট ক্ষতি");
    expect(homeSource).toContain("নিট আর্থিক অবস্থান");
    expect(homeSource).toContain("মোট সম্পদ:");
    expect(homeSource).toContain("মোট দেনা:");
  });

  it("keeps individual report selection and user-initiated sharing in the report dialog", () => {
    expect(homeSource).toContain("accountingReportOptions.map");
    expect(homeSource).toContain("shareMonthlyReport");
    expect(homeSource).toContain("Share2");
    expect(homeSource).toContain("WhatsApp");
  });
});
