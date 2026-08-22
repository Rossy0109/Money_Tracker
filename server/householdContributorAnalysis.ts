export type HouseholdContributorExpense = {
  contributorUserId: number;
  contributorName: string;
  amount: number;
};

export type HouseholdContributorMonthlyExpense = HouseholdContributorExpense & {
  monthKey: string;
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

export function summarizeHouseholdContributorMonthlySpend(expenses: HouseholdContributorMonthlyExpense[], monthKeys: string[]) {
  const selectedMonths = new Set(monthKeys);
  const contributors = new Map<number, { contributorUserId: number; contributorName: string; amount: number; entryCount: number }>();
  const amountsByMonth = new Map<string, Map<number, number>>();

  for (const expense of expenses) {
    if (!selectedMonths.has(expense.monthKey)) continue;
    const current = contributors.get(expense.contributorUserId);
    if (current) {
      current.amount += expense.amount;
      current.entryCount += 1;
    } else {
      contributors.set(expense.contributorUserId, {
        contributorUserId: expense.contributorUserId,
        contributorName: expense.contributorName,
        amount: expense.amount,
        entryCount: 1,
      });
    }
    const monthAmounts = amountsByMonth.get(expense.monthKey) ?? new Map<number, number>();
    monthAmounts.set(expense.contributorUserId, (monthAmounts.get(expense.contributorUserId) ?? 0) + expense.amount);
    amountsByMonth.set(expense.monthKey, monthAmounts);
  }

  const orderedContributors = Array.from(contributors.values())
    .sort((first, second) => second.amount - first.amount || first.contributorName.localeCompare(second.contributorName, "bn"));

  return {
    contributors: orderedContributors,
    months: monthKeys.map(monthKey => {
      const amounts = amountsByMonth.get(monthKey) ?? new Map<number, number>();
      return {
        monthKey,
        totalAmount: Array.from(amounts.values()).reduce((total, amount) => total + amount, 0),
        contributors: orderedContributors.map(contributor => ({
          contributorUserId: contributor.contributorUserId,
          amount: amounts.get(contributor.contributorUserId) ?? 0,
        })),
      };
    }),
  };
}
