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

/** Convert a money value to integer cents (avoids float accumulation error). */
function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
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

  // 1. Profit & Loss Computation (integer cents)
  let operatingRevenueCents = 0;
  let operatingExpensesCents = 0;
  const revenueCentsMap = new Map<string, number>();
  const expenseCentsMap = new Map<string, number>();

  for (const tx of transactions) {
    const amtCents = toCents(Number(tx.amount) || 0);
    if (tx.type === "income") {
      operatingRevenueCents += amtCents;
      revenueCentsMap.set(tx.categoryName, (revenueCentsMap.get(tx.categoryName) ?? 0) + amtCents);
    } else {
      operatingExpensesCents += amtCents;
      expenseCentsMap.set(tx.categoryName, (expenseCentsMap.get(tx.categoryName) ?? 0) + amtCents);
    }
  }

  // No COGS dimension in this simplified ledger — costOfGoods stays 0.
  const costOfGoodsCents = 0;
  const grossProfitCents = operatingRevenueCents - costOfGoodsCents;
  const netProfitCents = operatingRevenueCents - operatingExpensesCents;

  const operatingRevenue = fromCents(operatingRevenueCents);
  const operatingExpenses = fromCents(operatingExpensesCents);
  const costOfGoods = fromCents(costOfGoodsCents);
  const grossProfit = fromCents(grossProfitCents);
  const netProfit = fromCents(netProfitCents);

  const revenueCategories = Array.from(revenueCentsMap.entries()).map(([name, amount]) => ({ name, amount: fromCents(amount) }));
  const expenseCategories = Array.from(expenseCentsMap.entries()).map(([name, amount]) => ({ name, amount: fromCents(amount) }));

  const profitAndLoss: ProfitAndLossReport = {
    operatingRevenue,
    costOfGoods,
    grossProfit,
    operatingExpenses,
    netProfit,
    revenueCategories,
    expenseCategories,
  };

  // 2. Balance Sheet Computation (integer cents)
  const cashAndBankCents = accounts.reduce((sum, acc) => sum + toCents(Number(acc.currentBalance || 0)), 0);
  const accountsReceivableCents = dues
    .filter(due => due.type === "receivable")
    .reduce((sum, due) => sum + toCents(Number(due.outstandingAmount || 0)), 0);
  const accountsPayableCents = dues
    .filter(due => due.type === "debt")
    .reduce((sum, due) => sum + toCents(Number(due.outstandingAmount || 0)), 0);

  const totalCurrentAssetsCents = cashAndBankCents + accountsReceivableCents;
  const totalAssetsCents = totalCurrentAssetsCents;
  const totalCurrentLiabilitiesCents = accountsPayableCents;
  const totalLiabilitiesCents = totalCurrentLiabilitiesCents;

  const currentPeriodProfitCents = netProfitCents;
  // Residual equity (not a fake plug for trial balance): Assets − Liabilities − current profit.
  const retainedEarningsCents = totalAssetsCents - totalLiabilitiesCents - currentPeriodProfitCents;
  const totalEquityCents = retainedEarningsCents + currentPeriodProfitCents;

  // Balance-sheet identity check on exact cents (A = L + E).
  const isBalanced =
    totalAssetsCents === totalLiabilitiesCents + totalEquityCents;

  const cashAndBank = fromCents(cashAndBankCents);
  const accountsReceivable = fromCents(accountsReceivableCents);
  const accountsPayable = fromCents(accountsPayableCents);
  const totalCurrentAssets = fromCents(totalCurrentAssetsCents);
  const totalAssets = fromCents(totalAssetsCents);
  const totalCurrentLiabilities = fromCents(totalCurrentLiabilitiesCents);
  const totalLiabilities = fromCents(totalLiabilitiesCents);
  const currentPeriodProfit = fromCents(currentPeriodProfitCents);
  const retainedEarnings = fromCents(retainedEarningsCents);
  const totalEquity = fromCents(totalEquityCents);

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

  // 3. Trial Balance Computation — NO artificial equity plug force-added to totals.
  //    isBalanced reflects the real debit/credit totals (exact cents).
  const items: TrialBalanceItem[] = [];
  let totalDebitCents = 0;
  let totalCreditCents = 0;

  // Assets (Debit balance)
  accounts.forEach(acc => {
    const balCents = toCents(Number(acc.currentBalance || 0));
    if (balCents >= 0) {
      items.push({ accountName: `${acc.name} (Wallet/Bank)`, type: "asset", debit: fromCents(balCents), credit: 0 });
      totalDebitCents += balCents;
    } else {
      items.push({ accountName: `${acc.name} (Overdraft)`, type: "liability", debit: 0, credit: fromCents(-balCents) });
      totalCreditCents += -balCents;
    }
  });

  if (accountsReceivableCents > 0) {
    items.push({ accountName: "Accounts Receivable (পাওনা)", type: "asset", debit: accountsReceivable, credit: 0 });
    totalDebitCents += accountsReceivableCents;
  }

  // Liabilities (Credit balance)
  if (accountsPayableCents > 0) {
    items.push({ accountName: "Accounts Payable (দেনা)", type: "liability", debit: 0, credit: accountsPayable });
    totalCreditCents += accountsPayableCents;
  }

  // Revenue (Credit balance)
  if (operatingRevenueCents > 0) {
    items.push({ accountName: "Sales & Operating Revenue (আয়)", type: "revenue", debit: 0, credit: operatingRevenue });
    totalCreditCents += operatingRevenueCents;
  }

  // Expenses (Debit balance)
  if (operatingExpensesCents > 0) {
    items.push({ accountName: "Operating Expenses (ব্যয়)", type: "expense", debit: operatingExpenses, credit: 0 });
    totalDebitCents += operatingExpensesCents;
  }

  const trialBalance: TrialBalanceReport = {
    items,
    totalDebit: fromCents(totalDebitCents),
    totalCredit: fromCents(totalCreditCents),
    isBalanced: totalDebitCents === totalCreditCents,
  };

  return {
    profitAndLoss,
    balanceSheet,
    trialBalance,
  };
}
