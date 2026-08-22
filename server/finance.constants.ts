export const DEFAULT_CATEGORIES = {
  income: ["Salary", "Business", "Investment"],
  expense: [
    "মেয়র স্যার",
    "রছি ভাই",
    "মুক্তার বাড়ির বাজার",
    "ইউটিলিটি বিল",
    "বেতন",
    "বাজারের বাসা খরচ",
    "যাতায়াত খরচ",
    "ঠিকাদারী ব্যবসা",
    "ঠিকাদার লাইসেন্স রেনুয়াল",
    "দেনা পাওনা",
    "রাজনৈতিক খরচ",
    "অনুদান",
  ],
} as const;

export function calculateBudgetProgress(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export type BudgetAlertCandidate = {
  categoryId: number;
  categoryName: string;
  budgetAmount: number;
  spent: number;
};

export type BudgetEarlyWarning = BudgetAlertCandidate & {
  threshold: 80 | 90;
  remainingAmount: number;
};

export function calculateBudgetAlerts(candidates: BudgetAlertCandidate[]) {
  return candidates
    .filter(candidate => candidate.spent > candidate.budgetAmount)
    .map(candidate => ({
      ...candidate,
      exceededAmount: candidate.spent - candidate.budgetAmount,
    }))
    .sort((left, right) => right.exceededAmount - left.exceededAmount);
}

export function calculateBudgetEarlyWarnings(
  candidates: BudgetAlertCandidate[]
): BudgetEarlyWarning[] {
  return candidates
    .filter(
      candidate =>
        candidate.budgetAmount > 0 &&
        candidate.spent >= candidate.budgetAmount * 0.8 &&
        candidate.spent <= candidate.budgetAmount
    )
    .map(candidate => ({
      ...candidate,
      threshold:
        candidate.spent >= candidate.budgetAmount * 0.9
          ? (90 as const)
          : (80 as const),
      remainingAmount: Math.max(0, candidate.budgetAmount - candidate.spent),
    }))
    .sort(
      (left, right) =>
        right.threshold - left.threshold ||
        right.spent / right.budgetAmount - left.spent / left.budgetAmount
    );
}
