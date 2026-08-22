export type SharedBudgetStatus = "normal" | "warning80" | "warning90" | "exceeded";

export function calculateSharedBudgetProgress(amount: number, spent: number) {
  const percent = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  const status: SharedBudgetStatus = spent > amount ? "exceeded" : percent >= 90 ? "warning90" : percent >= 80 ? "warning80" : "normal";
  return { spent, remaining: amount - spent, percent, status };
}
