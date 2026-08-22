export type HouseholdContributorExpense = {
  contributorUserId: number;
  contributorName: string;
  amount: number;
};

export function summarizeHouseholdContributorSpend(expenses: HouseholdContributorExpense[]) {
  const totals = new Map<number, { contributorUserId: number; contributorName: string; amount: number; entryCount: number }>();
  for (const expense of expenses) {
    const current = totals.get(expense.contributorUserId);
    if (current) {
      current.amount += expense.amount;
      current.entryCount += 1;
    } else {
      totals.set(expense.contributorUserId, { ...expense, entryCount: 1 });
    }
  }
  const totalAmount = Array.from(totals.values()).reduce((sum, item) => sum + item.amount, 0);
  return Array.from(totals.values())
    .map(item => ({ ...item, percent: totalAmount > 0 ? Math.round((item.amount / totalAmount) * 100) : 0 }))
    .sort((first, second) => second.amount - first.amount || first.contributorName.localeCompare(second.contributorName, "bn"));
}
