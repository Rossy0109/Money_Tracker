export const DEFAULT_CATEGORIES = {
  income: ["Salary", "Business", "Investment"],
  expense: ["Food", "Transport", "Housing", "Utilities", "Education", "Health", "Shopping", "Family"],
} as const;

export function calculateBudgetProgress(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}
