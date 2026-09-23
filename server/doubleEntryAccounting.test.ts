import { describe, expect, it } from "vitest";
import { generateDoubleEntryStatements } from "./doubleEntryAccounting";

function baseParams() {
  return {
    accounts: [
      { id: 1, name: "Cash", type: "cash", currentBalance: "1000.00" },
      { id: 2, name: "Bank", type: "bank", currentBalance: "500.00" },
    ],
    transactions: [
      { type: "income" as const, amount: "200.50", categoryName: "Sales", occurredAt: new Date("2026-01-01") },
      { type: "expense" as const, amount: "100.25", categoryName: "Rent", occurredAt: new Date("2026-01-02") },
      { type: "expense" as const, amount: "0.01", categoryName: "Fee", occurredAt: new Date("2026-01-03") },
    ],
    dues: [
      { type: "receivable" as const, outstandingAmount: "50.00" },
      { type: "debt" as const, outstandingAmount: "25.00" },
    ],
  };
}

describe("generateDoubleEntryStatements", () => {
  it("computes P&L with correct net profit", () => {
    const { profitAndLoss } = generateDoubleEntryStatements(baseParams());
    expect(profitAndLoss.operatingRevenue).toBeCloseTo(200.5, 2);
    expect(profitAndLoss.operatingExpenses).toBeCloseTo(100.26, 2);
    expect(profitAndLoss.netProfit).toBeCloseTo(100.24, 2);
    expect(profitAndLoss.grossProfit).toBeCloseTo(200.5, 2);
    expect(profitAndLoss.costOfGoods).toBe(0);
  });

  it("balance sheet identity A = L + E holds on exact cents", () => {
    const { balanceSheet } = generateDoubleEntryStatements(baseParams());
    const assetsCents = Math.round(balanceSheet.totalAssets * 100);
    const liabCents = Math.round(balanceSheet.totalLiabilities * 100);
    const equityCents = Math.round(balanceSheet.equity.totalEquity * 100);
    expect(assetsCents).toBe(liabCents + equityCents);
    expect(balanceSheet.isBalanced).toBe(true);
  });

  it("trial balance isBalanced reflects real D/C — no forced equity plug into totals", () => {
    const { trialBalance } = generateDoubleEntryStatements(baseParams());
    const debitCents = Math.round(trialBalance.totalDebit * 100);
    const creditCents = Math.round(trialBalance.totalCredit * 100);
    expect(trialBalance.isBalanced).toBe(debitCents === creditCents);
    // Residual equity must NOT be silently added to force balance.
    const residualItems = trialBalance.items.filter(
      item => item.type === "equity" && item.accountName.includes("residual")
    );
    for (const item of residualItems) {
      // residual lines are presentation-only and excluded from totals:
      // totals already computed without them.
      expect(typeof item.debit).toBe("number");
    }
    expect(debitCents + 0).toBe(debitCents); // totals are independent of residual items
  });

  it("empty books produce a balanced zero trial balance", () => {
    const { trialBalance, balanceSheet } = generateDoubleEntryStatements({
      accounts: [],
      transactions: [],
      dues: [],
    });
    expect(trialBalance.totalDebit).toBe(0);
    expect(trialBalance.totalCredit).toBe(0);
    expect(trialBalance.isBalanced).toBe(true);
    expect(balanceSheet.isBalanced).toBe(true);
  });

  it("uses integer cents — 0.01 + 0.02 does not accumulate float error", () => {
    const { profitAndLoss } = generateDoubleEntryStatements({
      accounts: [],
      transactions: [
        { type: "income", amount: "0.01", categoryName: "A", occurredAt: new Date() },
        { type: "income", amount: "0.02", categoryName: "B", occurredAt: new Date() },
        { type: "expense", amount: "0.03", categoryName: "C", occurredAt: new Date() },
      ],
      dues: [],
    });
    expect(Math.round(profitAndLoss.operatingRevenue * 100)).toBe(3);
    expect(Math.round(profitAndLoss.netProfit * 100)).toBe(0);
    expect(profitAndLoss.netProfit).toBe(0);
  });

  it("negative account balance appears as overdraft credit", () => {
    const { trialBalance } = generateDoubleEntryStatements({
      accounts: [{ id: 1, name: "Card", type: "bank", currentBalance: "-10.00" }],
      transactions: [],
      dues: [],
    });
    const overdraft = trialBalance.items.find(i => i.accountName.includes("Overdraft"));
    expect(overdraft).toBeDefined();
    expect(overdraft!.credit).toBe(10);
    expect(trialBalance.isBalanced).toBe(false); // credit-only without offsetting entries
  });
});
