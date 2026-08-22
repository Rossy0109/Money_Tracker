import { describe, expect, it } from "vitest";
import { summarizeHouseholdContributorSpend } from "./householdContributorAnalysis";

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
});
