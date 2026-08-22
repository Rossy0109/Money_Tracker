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

export function calculateBudgetAlerts(candidates: BudgetAlertCandidate[]) {
  return candidates
    .filter(candidate => candidate.spent > candidate.budgetAmount)
    .map(candidate => ({
      ...candidate,
      exceededAmount: candidate.spent - candidate.budgetAmount,
    }))
    .sort((left, right) => right.exceededAmount - left.exceededAmount);
}
