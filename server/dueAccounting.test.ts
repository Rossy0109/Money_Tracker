import { describe, expect, it } from "vitest";
import { calculateDueSettlement } from "./dueAccounting";

describe("debt and receivable settlement accounting", () => {
  it("reduces debt and cash without recording income or expense", () => {
    expect(calculateDueSettlement("debt", 5000, 1200)).toEqual({ outstandingAmount: 3800, accountBalanceDelta: -1200, incomeDelta: 0, expenseDelta: 0 });
  });

  it("reduces receivable and increases cash without recording income", () => {
    expect(calculateDueSettlement("receivable", 5000, 1200)).toEqual({ outstandingAmount: 3800, accountBalanceDelta: 1200, incomeDelta: 0, expenseDelta: 0 });
  });

  it("rejects a settlement that exceeds the outstanding balance", () => {
    expect(() => calculateDueSettlement("debt", 5000, 5001)).toThrow("cannot exceed");
  });
});
