import { describe, expect, it } from "vitest";
import { summarizeHouseholdContributorMonthlySpend, summarizeHouseholdContributorSpend } from "./householdContributorAnalysis";

describe("household contributor spending analysis", () => {
  it("groups several entries per contributor and orders members by total spending", () => {
    expect(summarizeHouseholdContributorSpend([
      { contributorUserId: 3, contributorName: "রিনা", amount: 100 },
      { contributorUserId: 2, contributorName: "করিম", amount: 300 },
      { contributorUserId: 3, contributorName: "রিনা", amount: 200 },
    ])).toEqual([
      { contributorUserId: 2, contributorName: "করিম", amount: 300, entryCount: 1, percent: 50 },
      { contributorUserId: 3, contributorName: "রিনা", amount: 300, entryCount: 2, percent: 50 },
    ]);
  });

  it("returns an empty analysis when this month has no shared expenses", () => {
    expect(summarizeHouseholdContributorSpend([])).toEqual([]);
  });

  it("keeps every requested month while comparing each contributor across the selected period", () => {
    expect(summarizeHouseholdContributorMonthlySpend([
      { monthKey: "2026-06", contributorUserId: 2, contributorName: "করিম", amount: 200 },
      { monthKey: "2026-07", contributorUserId: 3, contributorName: "রিনা", amount: 400 },
      { monthKey: "2026-07", contributorUserId: 2, contributorName: "করিম", amount: 100 },
      { monthKey: "2026-08", contributorUserId: 2, contributorName: "করিম", amount: 300 },
      { monthKey: "2026-05", contributorUserId: 9, contributorName: "পুরোনো", amount: 900 },
    ], ["2026-06", "2026-07", "2026-08"])).toEqual({
      contributors: [
        { contributorUserId: 2, contributorName: "করিম", amount: 600, entryCount: 3 },
        { contributorUserId: 3, contributorName: "রিনা", amount: 400, entryCount: 1 },
      ],
      months: [
        { monthKey: "2026-06", totalAmount: 200, contributors: [{ contributorUserId: 2, amount: 200 }, { contributorUserId: 3, amount: 0 }] },
        { monthKey: "2026-07", totalAmount: 500, contributors: [{ contributorUserId: 2, amount: 100 }, { contributorUserId: 3, amount: 400 }] },
        { monthKey: "2026-08", totalAmount: 300, contributors: [{ contributorUserId: 2, amount: 300 }, { contributorUserId: 3, amount: 0 }] },
      ],
    });
  });
});
