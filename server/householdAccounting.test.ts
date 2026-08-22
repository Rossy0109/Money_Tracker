import { describe, expect, it } from "vitest";
import { calculateSharedBudgetProgress } from "./householdAccounting";

describe("shared household budget progress", () => {
  it("keeps normal use below the early-warning threshold", () => {
    expect(calculateSharedBudgetProgress(1_000, 790)).toMatchObject({ percent: 79, remaining: 210, status: "normal" });
  });

  it("raises exact 80% and 90% early-warning thresholds", () => {
    expect(calculateSharedBudgetProgress(1_000, 800)).toMatchObject({ percent: 80, status: "warning80" });
    expect(calculateSharedBudgetProgress(1_000, 900)).toMatchObject({ percent: 90, status: "warning90" });
  });

  it("reports amounts above the allocation as exceeded while a zero allocation has no false warning", () => {
    expect(calculateSharedBudgetProgress(1_000, 1_001)).toMatchObject({ remaining: -1, status: "exceeded" });
    expect(calculateSharedBudgetProgress(0, 0)).toMatchObject({ percent: 0, status: "normal" });
  });
});
