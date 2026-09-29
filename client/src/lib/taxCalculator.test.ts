import { describe, expect, it } from "vitest";
import {
  calculateBangladeshIncomeTax,
  type IncomeBreakdown,
  type InvestmentBreakdown,
} from "./taxCalculator";

const emptyInvestments: InvestmentBreakdown = {
  sanchayapatra: 0,
  dps: 0,
  stockMarket: 0,
  lifeInsurance: 0,
  providentFund: 0,
};

function income(over: Partial<IncomeBreakdown>): IncomeBreakdown {
  return {
    salaryIncome: 0,
    businessIncome: 0,
    houseRentIncome: 0,
    agricultureIncome: 0,
    otherIncome: 0,
    taxDeductedAtSource: 0,
    ...over,
  };
}

describe("calculateBangladeshIncomeTax", () => {
  it("computes slabs for a mid salary", () => {
    const r = calculateBangladeshIncomeTax(
      income({ salaryIncome: 900000 }),
      emptyInvestments
    );
    expect(r.totalGrossIncome).toBe(900000);
    expect(r.exemptIncome).toBe(300000);
    expect(r.totalTaxableIncome).toBe(600000);
    expect(r.grossTaxLiability).toBe(20000);
    expect(r.finalTaxPayable).toBe(20000);
    expect(r.remainingTaxToPay).toBe(20000);
  });

  it("pays nothing below the threshold", () => {
    const r = calculateBangladeshIncomeTax(
      income({ salaryIncome: 300000 }),
      emptyInvestments
    );
    expect(r.totalTaxableIncome).toBe(200000);
    expect(r.finalTaxPayable).toBe(0);
  });

  it("applies category thresholds and city minimum tax", () => {
    const r = calculateBangladeshIncomeTax(
      income({ salaryIncome: 660000 }),
      emptyInvestments,
      "female_senior",
      "non_city"
    );
    expect(r.initialThreshold).toBe(400000);
    expect(r.totalTaxableIncome).toBe(440000);
    expect(r.grossTaxLiability).toBe(2000);
    expect(r.minimumTax).toBe(3000);
    expect(r.finalTaxPayable).toBe(3000);
    expect(r.remainingTaxToPay).toBe(3000);
  });

  it("applies the 15% investment rebate and subtracts TDS", () => {
    const r = calculateBangladeshIncomeTax(
      income({ salaryIncome: 1500000, taxDeductedAtSource: 5000 }),
      { ...emptyInvestments, sanchayapatra: 200000 }
    );
    expect(r.totalTaxableIncome).toBe(1050000);
    expect(r.grossTaxLiability).toBe(75000);
    expect(r.eligibleInvestment).toBe(200000);
    expect(r.taxRebate).toBe(30000);
    expect(r.netTaxAfterRebate).toBe(45000);
    expect(r.finalTaxPayable).toBe(45000);
    expect(r.remainingTaxToPay).toBe(40000);
  });

  it("caps DPS eligibility at 120,000", () => {
    const r = calculateBangladeshIncomeTax(
      income({ salaryIncome: 3000000 }),
      { ...emptyInvestments, dps: 500000 }
    );
    expect(r.eligibleInvestment).toBe(120000);
    expect(r.taxRebate).toBe(18000);
  });
});
