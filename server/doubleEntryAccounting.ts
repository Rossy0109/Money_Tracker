export interface FinancialStatementPeriod {
  from?: Date;
  to?: Date;
}

export interface ProfitAndLossReport {
  operatingRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  revenueCategories: Array<{ name: string; amount: number }>;
  expenseCategories: Array<{ name: string; amount: number }>;
}

export interface BalanceSheetReport {
  currentAssets: {
    cashAndBank: number;
    accountsReceivable: number;
    totalCurrentAssets: number;
  };
  totalAssets: number;
  currentLiabilities: {
    accountsPayable: number;
    totalCurrentLiabilities: number;
  };
  totalLiabilities: number;
  equity: {
    retainedEarnings: number;
    currentPeriodProfit: number;
    totalEquity: number;
  };
  isBalanced: boolean;
}

export interface TrialBalanceItem {
  accountName: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  items: TrialBalanceItem[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export function generateDoubleEntryStatements(params: {
  accounts: Array<{ id: number; name: string; type: string; currentBalance: string | number }>;
  transactions: Array<{ type: "income" | "expense"; amount: string | number; categoryName: string; occurredAt: Date }>;
  dues: Array<{ type: "debt" | "receivable"; outstandingAmount: string | number }>;
}): {
  profitAndLoss: ProfitAndLossReport;
  balanceSheet: BalanceSheetReport;
  trialBalance: TrialBalanceReport;
} {
  const { accounts, transactions, dues } = params;

  // 1. Profit & Loss Computation
  let operatingRevenue = 0;
  let operatingExpenses = 0;
  const revenueMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === "income") {
      operatingRevenue += amt;
      revenueMap.set(tx.categoryName, (revenueMap.get(tx.categoryName) ?? 0) + amt);
    } else {
      operatingExpenses += amt;
      expenseMap.set(tx.categoryName, (expenseMap.get(tx.categoryName) ?? 0) + amt);
    }
  }

  const grossProfit = operatingRevenue; // For service/SME, gross profit equals revenue minus direct costs
  const netProfit = operatingRevenue - operatingExpenses;

  const revenueCategories = Array.from(revenueMap.entries()).map(([name, amount]) => ({ name, amount }));
  const expenseCategories = Array.from(expenseMap.entries()).map(([name, amount]) => ({ name, amount }));

  const profitAndLoss: ProfitAndLossReport = {
    operatingRevenue,
    costOfGoods: 0,
    grossProfit,
    operatingExpenses,
    netProfit,
    revenueCategories,
    expenseCategories,
  };

  // 2. Balance Sheet Computation
  const cashAndBank = accounts.reduce((sum, acc) => sum + Number(acc.currentBalance || 0), 0);
  const accountsReceivable = dues
    .filter(due => due.type === "receivable")
    .reduce((sum, due) => sum + Number(due.outstandingAmount || 0), 0);
  const accountsPayable = dues
    .filter(due => due.type === "debt")
    .reduce((sum, due) => sum + Number(due.outstandingAmount || 0), 0);

  const totalCurrentAssets = cashAndBank + accountsReceivable;
  const totalAssets = totalCurrentAssets;
  const totalCurrentLiabilities = accountsPayable;
  const totalLiabilities = totalCurrentLiabilities;

  const currentPeriodProfit = netProfit;
  const retainedEarnings = totalAssets - totalLiabilities - currentPeriodProfit;
  const totalEquity = retainedEarnings + currentPeriodProfit;

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

  const balanceSheet: BalanceSheetReport = {
    currentAssets: {
      cashAndBank,
      accountsReceivable,
      totalCurrentAssets,
    },
    totalAssets,
    currentLiabilities: {
      accountsPayable,
      totalCurrentLiabilities,
    },
    totalLiabilities,
    equity: {
      retainedEarnings,
      currentPeriodProfit,
      totalEquity,
    },
    isBalanced,
  };

  // 3. Trial Balance Computation
  const items: TrialBalanceItem[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  // Assets (Debit balance)
  accounts.forEach(acc => {
    const bal = Number(acc.currentBalance || 0);
    if (bal >= 0) {
      items.push({ accountName: `${acc.name} (Wallet/Bank)`, type: "asset", debit: bal, credit: 0 });
      totalDebit += bal;
    } else {
      items.push({ accountName: `${acc.name} (Overdraft)`, type: "liability", debit: 0, credit: Math.abs(bal) });
      totalCredit += Math.abs(bal);
    }
  });

  if (accountsReceivable > 0) {
    items.push({ accountName: "Accounts Receivable (পাওনা)", type: "asset", debit: accountsReceivable, credit: 0 });
    totalDebit += accountsReceivable;
  }

  // Liabilities (Credit balance)
  if (accountsPayable > 0) {
    items.push({ accountName: "Accounts Payable (দেনা)", type: "liability", debit: 0, credit: accountsPayable });
    totalCredit += accountsPayable;
  }

  // Revenue (Credit balance)
  if (operatingRevenue > 0) {
    items.push({ accountName: "Sales & Operating Revenue (আয়)", type: "revenue", debit: 0, credit: operatingRevenue });
    totalCredit += operatingRevenue;
  }

  // Expenses (Debit balance)
  if (operatingExpenses > 0) {
    items.push({ accountName: "Operating Expenses (ব্যয়)", type: "expense", debit: operatingExpenses, credit: 0 });
    totalDebit += operatingExpenses;
  }

  // Equity / Balancing Entry
  const equityBalance = Math.abs(totalDebit - totalCredit);
  if (totalDebit > totalCredit) {
    items.push({ accountName: "Owner's Equity & Retained Capital", type: "equity", debit: 0, credit: equityBalance });
    totalCredit += equityBalance;
  } else if (totalCredit > totalDebit) {
    items.push({ accountName: "Owner's Drawings / Loss Offset", type: "equity", debit: equityBalance, credit: 0 });
    totalDebit += equityBalance;
  }

  const trialBalance: TrialBalanceReport = {
    items,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };

  return {
    profitAndLoss,
    balanceSheet,
    trialBalance,
  };
}
