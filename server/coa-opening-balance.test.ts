import { describe, expect, it } from "vitest";
import { createChartOfAccount } from "./db";
import { coaAccountInput } from "./routers";

describe("R-1: CoA opening balance invariant protection", () => {
  it("db.createChartOfAccount throws when openingBalance is non-zero", async () => {
    await expect(
      createChartOfAccount(1, {
        projectId: 1,
        accountTypeId: 1,
        code: "1500",
        name: "Equipment",
        openingBalance: 5000,
      })
    ).rejects.toThrow("CoA opening balance must be zero");

    await expect(
      createChartOfAccount(1, {
        projectId: 1,
        accountTypeId: 1,
        code: "1500",
        name: "Equipment",
        openingBalance: -100,
      })
    ).rejects.toThrow("CoA opening balance must be zero");
  });

  it("router coaAccountInput schema rejects non-zero openingBalance", () => {
    const rejected = coaAccountInput.safeParse({
      projectId: 1,
      accountTypeId: 1,
      code: "1500",
      name: "Equipment",
      openingBalance: 500,
    });
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues[0].message).toContain(
        "CoA opening balance must be zero"
      );
    }

    const acceptedZero = coaAccountInput.safeParse({
      projectId: 1,
      accountTypeId: 1,
      code: "1500",
      name: "Equipment",
      openingBalance: 0,
    });
    expect(acceptedZero.success).toBe(true);

    const acceptedOmitted = coaAccountInput.safeParse({
      projectId: 1,
      accountTypeId: 1,
      code: "1500",
      name: "Equipment",
    });
    expect(acceptedOmitted.success).toBe(true);
  });
});
