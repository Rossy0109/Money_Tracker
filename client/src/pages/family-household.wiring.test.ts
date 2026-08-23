import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const householdSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/FamilyHousehold.tsx"),
  "utf8"
);

describe("family household workspace wiring", () => {
  it("shows signed-in members their own pending invitations and acceptance action", () => {
    expect(householdSource).toContain("trpc.finance.householdInvitations.useQuery()");
    expect(householdSource).toContain("acceptInvitation.mutate");
    expect(householdSource).toContain("পারিবারিক আমন্ত্রণ অপেক্ষায় আছে");
    expect(householdSource).toContain("গ্রহণ করুন");
  });

  it("keeps management actions role-aware while supporting shared monthly budgets", () => {
    expect(householdSource).toContain('overview?.currentRole === "owner"');
    expect(householdSource).toContain('overview?.currentRole === "editor"');
    expect(householdSource).toContain("inviteHouseholdMember.useMutation");
    expect(householdSource).toContain("saveSharedHouseholdBudget.useMutation");
    expect(householdSource).toContain("addSharedHouseholdExpense.useMutation");
    expect(householdSource).toContain("sm:grid-cols-[1fr_150px_auto]");
  });

  it("stacks dense household rows on compact screens instead of compressing desktop content", () => {
    expect(householdSource).toContain("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between");
    expect(householdSource).toContain("flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between");
    expect(householdSource).toContain("flex flex-col gap-2 rounded-xl bg-[#f8fbf8] p-2.5 sm:flex-row");
  });

  it("renders a responsive Bengali chart and detailed per-member contribution breakdown", () => {
    expect(householdSource).toContain("contributorSpend = overview?.contributorSpend ?? []");
    expect(householdSource).toContain("ResponsiveContainer");
    expect(householdSource).toContain('layout="vertical"');
    expect(householdSource).toContain("সদস্যভিত্তিক ব্যয় বিশ্লেষণ");
    expect(householdSource).toContain("item.entryCount");
    expect(householdSource).toContain("এ মাসে সদস্যভিত্তিক খরচের তথ্য নেই");
  });

  it("renders a six-month member comparison chart with localized labels, legend, and compact detail cards", () => {
    expect(householdSource).toContain("monthlyContributorSpend = overview?.monthlyContributorSpend");
    expect(householdSource).toContain("monthlyChartData");
    expect(householdSource).toContain("member-${item.contributorUserId}");
    expect(householdSource).toContain("<Legend");
    expect(householdSource).toContain("সদস্যদের মাসিক খরচের তুলনা");
    expect(householdSource).toContain("গত ৬ মাসে");
    expect(householdSource).toContain("৬ মাসে {new Intl.NumberFormat");
    expect(householdSource).toContain("h-72 min-w-0 sm:h-80");
  });

  it("offers image and PDF downloads only beside the authorized monthly comparison chart", () => {
    expect(householdSource).toContain('data-chart-export-hide');
    expect(householdSource).toContain('exportMonthlyComparison("image")');
    expect(householdSource).toContain('exportMonthlyComparison("pdf")');
    expect(householdSource).toContain("downloadHouseholdChartImage");
    expect(householdSource).toContain("downloadHouseholdChartPdf");
    expect(householdSource).toContain("ছবি ডাউনলোড");
    expect(householdSource).toContain("PDF ডাউনলোড");
  });
});
