import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORIES,
  calculateBudgetAlerts,
  calculateBudgetEarlyWarnings,
  calculateBudgetProgress,
  calculateBurnRateAnomalies,
} from "./finance.constants";

describe("calculateBudgetProgress", () => {
  it("returns 0 for zero or negative budgets", () => {
    expect(calculateBudgetProgress(50, 0)).toBe(0);
    expect(calculateBudgetProgress(50, -100)).toBe(0);
  });

  it("computes rounded percentage", () => {
    expect(calculateBudgetProgress(50, 100)).toBe(50);
    expect(calculateBudgetProgress(1, 3)).toBe(33);
  });

  it("caps at 100 when overspent", () => {
    expect(calculateBudgetProgress(150, 100)).toBe(100);
  });
});

describe("calculateBudgetAlerts", () => {
  it("keeps only overspent categories with exceeded amounts", () => {
    const result = calculateBudgetAlerts([
      { categoryId: 1, categoryName: "a", budgetAmount: 100, spent: 150 },
      { categoryId: 2, categoryName: "b", budgetAmount: 100, spent: 100 },
      { categoryId: 3, categoryName: "c", budgetAmount: 100, spent: 40 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      categoryId: 1,
      exceededAmount: 50,
    });
  });

  it("sorts by exceeded amount descending", () => {
    const result = calculateBudgetAlerts([
      { categoryId: 1, categoryName: "a", budgetAmount: 100, spent: 110 },
      { categoryId: 2, categoryName: "b", budgetAmount: 100, spent: 200 },
    ]);
    expect(result.map(r => r.categoryId)).toEqual([2, 1]);
  });
});

describe("calculateBudgetEarlyWarnings", () => {
  it("flags 80% and 90% thresholds with remaining amounts", () => {
    const result = calculateBudgetEarlyWarnings([
      { categoryId: 1, categoryName: "a", budgetAmount: 100, spent: 80 },
      { categoryId: 2, categoryName: "b", budgetAmount: 100, spent: 95 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.categoryId === 1)).toMatchObject({
      threshold: 80,
      remainingAmount: 20,
    });
    expect(result.find(r => r.categoryId === 2)).toMatchObject({
      threshold: 90,
      remainingAmount: 5,
    });
  });

  it("excludes below-threshold, overspent, and zero-budget candidates", () => {
    const result = calculateBudgetEarlyWarnings([
      { categoryId: 1, categoryName: "low", budgetAmount: 100, spent: 79 },
      { categoryId: 2, categoryName: "over", budgetAmount: 100, spent: 101 },
      { categoryId: 3, categoryName: "zero", budgetAmount: 0, spent: 10 },
      { categoryId: 4, categoryName: "full", budgetAmount: 100, spent: 100 },
    ]);
    expect(result.map(r => r.categoryId)).toEqual([4]);
  });
});

describe("calculateBurnRateAnomalies", () => {
  const date = new Date(2026, 0, 15);

  it("projects spend and flags overruns", () => {
    const result = calculateBurnRateAnomalies(
      [{ categoryId: 1, categoryName: "a", budgetAmount: 3000, spent: 1500 }],
      date
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      currentDay: 15,
      totalDaysInMonth: 31,
      dailyBurnRate: 100,
      projectedSpend: 3100,
      projectedOverrun: 100,
    });
  });

  it("excludes on-track, zero-budget, and zero-spend candidates", () => {
    const result = calculateBurnRateAnomalies(
      [
        { categoryId: 1, categoryName: "track", budgetAmount: 3100, spent: 1500 },
        { categoryId: 2, categoryName: "zero-b", budgetAmount: 0, spent: 100 },
        { categoryId: 3, categoryName: "zero-s", budgetAmount: 100, spent: 0 },
      ],
      date
    );
    expect(result).toHaveLength(0);
  });
});

describe("DEFAULT_CATEGORIES", () => {
  it("matches the required default set", () => {
    expect(DEFAULT_CATEGORIES.income).toEqual([
      "Salary",
      "Business",
      "Investment",
    ]);
    expect(DEFAULT_CATEGORIES.expense).toHaveLength(12);
    expect(DEFAULT_CATEGORIES.expense).toContain("বেতন");
  });
});
