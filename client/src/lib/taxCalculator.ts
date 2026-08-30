export type GenderCategory = "general" | "female_senior" | "specially_abled" | "freedom_fighter";

export interface IncomeBreakdown {
  salaryIncome: number;
  businessIncome: number;
  houseRentIncome: number;
  agricultureIncome: number;
  otherIncome: number;
  taxDeductedAtSource: number; // TDS already paid
}

export interface InvestmentBreakdown {
  sanchayapatra: number;
  dps: number; // Max 120,000 eligible per year
  stockMarket: number;
  lifeInsurance: number;
  providentFund: number;
}

export interface TaxResultSlab {
  slabName: string;
  taxableInSlab: number;
  rate: number;
  taxAmount: number;
}

export interface TaxCalculationResult {
  totalGrossIncome: number;
  exemptIncome: number;
  totalTaxableIncome: number;
  initialThreshold: number;
  slabs: TaxResultSlab[];
  grossTaxLiability: number;
  eligibleInvestment: number;
  taxRebate: number;
  netTaxAfterRebate: number;
  minimumTax: number;
  finalTaxPayable: number;
  remainingTaxToPay: number; // after subtracting TDS
}

export function calculateBangladeshIncomeTax(
  income: IncomeBreakdown,
  investments: InvestmentBreakdown,
  category: GenderCategory = "general",
  cityType: "dhaka_ctg" | "other_city" | "non_city" = "dhaka_ctg"
): TaxCalculationResult {
  const totalGrossIncome =
    (income.salaryIncome || 0) +
    (income.businessIncome || 0) +
    (income.houseRentIncome || 0) +
    (income.agricultureIncome || 0) +
    (income.otherIncome || 0);

  // Salary standard exemption: 1/3 of salary or 4,50,000 (whichever is lower)
  const salaryExemption = Math.min((income.salaryIncome || 0) / 3, 450000);
  const exemptIncome = salaryExemption;
  const totalTaxableIncome = Math.max(0, totalGrossIncome - exemptIncome);

  // Initial tax-free threshold
  let initialThreshold = 350000;
  if (category === "female_senior") initialThreshold = 400000;
  else if (category === "specially_abled") initialThreshold = 475000;
  else if (category === "freedom_fighter") initialThreshold = 500000;

  const slabs: TaxResultSlab[] = [];
  let remainingTaxable = totalTaxableIncome;
  let grossTaxLiability = 0;

  // Slab 1: 0% Tax-Free
  const slab1Amount = Math.min(remainingTaxable, initialThreshold);
  slabs.push({
    slabName: `১ম ৳ ${initialThreshold.toLocaleString()} (করমুক্ত)`,
    taxableInSlab: slab1Amount,
    rate: 0,
    taxAmount: 0,
  });
  remainingTaxable -= slab1Amount;

  // Slab 2: Next ৳ 1,00,000 @ 5%
  if (remainingTaxable > 0) {
    const slab2Amount = Math.min(remainingTaxable, 100000);
    const tax = slab2Amount * 0.05;
    slabs.push({
      slabName: "পরবর্তী ৳ ১,০০,০০০ (৫%)",
      taxableInSlab: slab2Amount,
      rate: 5,
      taxAmount: tax,
    });
    grossTaxLiability += tax;
    remainingTaxable -= slab2Amount;
  }

  // Slab 3: Next ৳ 4,00,000 @ 10%
  if (remainingTaxable > 0) {
    const slab3Amount = Math.min(remainingTaxable, 400000);
    const tax = slab3Amount * 0.1;
    slabs.push({
      slabName: "পরবর্তী ৳ ৪,০০,০০০ (১০%)",
      taxableInSlab: slab3Amount,
      rate: 10,
      taxAmount: tax,
    });
    grossTaxLiability += tax;
    remainingTaxable -= slab3Amount;
  }

  // Slab 4: Next ৳ 5,00,000 @ 15%
  if (remainingTaxable > 0) {
    const slab4Amount = Math.min(remainingTaxable, 500000);
    const tax = slab4Amount * 0.15;
    slabs.push({
      slabName: "পরবর্তী ৳ ৫,০০,০০০ (১৫%)",
      taxableInSlab: slab4Amount,
      rate: 15,
      taxAmount: tax,
    });
    grossTaxLiability += tax;
    remainingTaxable -= slab4Amount;
  }

  // Slab 5: Next ৳ 5,00,000 @ 20%
  if (remainingTaxable > 0) {
    const slab5Amount = Math.min(remainingTaxable, 500000);
    const tax = slab5Amount * 0.2;
    slabs.push({
      slabName: "পরবর্তী ৳ ৫,০০,০০০ (২০%)",
      taxableInSlab: slab5Amount,
      rate: 20,
      taxAmount: tax,
    });
    grossTaxLiability += tax;
    remainingTaxable -= slab5Amount;
  }

  // Slab 6: Remaining Balance @ 25%
  if (remainingTaxable > 0) {
    const tax = remainingTaxable * 0.25;
    slabs.push({
      slabName: `অবশিষ্ট ৳ ${remainingTaxable.toLocaleString()} (২৫%)`,
      taxableInSlab: remainingTaxable,
      rate: 25,
      taxAmount: tax,
    });
    grossTaxLiability += tax;
    remainingTaxable = 0;
  }

  // Investment Rebate Calculation:
  // Actual investment capped at DPS 1,20,000 max + other investments
  const actualInvestment =
    (investments.sanchayapatra || 0) +
    Math.min(investments.dps || 0, 120000) +
    (investments.stockMarket || 0) +
    (investments.lifeInsurance || 0) +
    (investments.providentFund || 0);

  // Eligible investment is minimum of: (Actual Investment, 20% of Taxable Income, 10 Million max)
  const maxAllowableInvestment = Math.min(totalTaxableIncome * 0.2, 10000000);
  const eligibleInvestment = Math.min(actualInvestment, maxAllowableInvestment);
  const taxRebate = eligibleInvestment * 0.15; // 15% rebate

  const netTaxAfterRebate = Math.max(0, grossTaxLiability - taxRebate);

  // Minimum Tax
  let minimumTax = 5000;
  if (cityType === "other_city") minimumTax = 4000;
  else if (cityType === "non_city") minimumTax = 3000;

  // If taxable income > threshold, minimum tax applies if tax liability is positive
  let finalTaxPayable = 0;
  if (totalTaxableIncome > initialThreshold) {
    finalTaxPayable = Math.max(minimumTax, netTaxAfterRebate);
  }

  const remainingTaxToPay = Math.max(0, finalTaxPayable - (income.taxDeductedAtSource || 0));

  return {
    totalGrossIncome,
    exemptIncome,
    totalTaxableIncome,
    initialThreshold,
    slabs,
    grossTaxLiability,
    eligibleInvestment,
    taxRebate,
    netTaxAfterRebate,
    minimumTax,
    finalTaxPayable,
    remainingTaxToPay,
  };
}
