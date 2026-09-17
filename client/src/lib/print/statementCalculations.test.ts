import { describe, expect, it } from "vitest";
import type { PrintTransaction, StatementData } from "./types";
import {
  aggregateByCategory,
  aggregateByDay,
  monthlySummary,
  withRunningBalance,
} from "./statementCalculations";

function txn(overrides: Partial<PrintTransaction>): PrintTransaction {
  return {
    id: 1,
    projectId: 1,
    accountId: null,
    categoryId: 1,
    type: "expense",
    amount: 100,
    voucherNo: "V-001",
    reason: null,
    paymentMethod: "cash",
    note: "লেনদেন",
    occurredAt: "2026-09-15T06:00:00.000Z",
    createdAt: "2026-09-15T06:00:00.000Z",
    categoryName: "খরচ খাত",
    accountName: null,
    ...overrides,
  };
}

describe("statement calculations", () => {
  it("computes a chronological running balance from the opening balance", () => {
    const items = [
      txn({ id: 1, type: "income", amount: 300, occurredAt: "2026-09-15T06:00:00.000Z" }),
      txn({ id: 2, type: "expense", amount: 100, occurredAt: "2026-09-15T07:00:00.000Z" }),
    ];
    const rows = withRunningBalance(items, 500);
    expect(rows.map(row => row.runningBalance)).toEqual([800, 700]);
  });

  it("aggregates transactions by day with income/expense/net", () => {
    const items = [
      txn({ id: 1, type: "income", amount: 250, occurredAt: "2026-09-15T06:00:00.000Z" }),
      txn({ id: 2, type: "expense", amount: 50, occurredAt: "2026-09-15T07:00:00.000Z" }),
      txn({ id: 3, type: "income", amount: 100, occurredAt: "2026-09-16T06:00:00.000Z" }),
    ];
    const days = aggregateByDay(items);
    expect(days).toHaveLength(2);
    expect(days[0].income).toBe(250);
    expect(days[0].expense).toBe(50);
    expect(days[0].net).toBe(200);
    expect(days[1].income).toBe(100);
  });

  it("groups categories with count and total", () => {
    const items = [
      txn({ id: 1, categoryName: "বেতন", type: "expense", amount: 400 }),
      txn({ id: 2, categoryName: "বেতন", type: "expense", amount: 100 }),
      txn({ id: 3, categoryName: "বিক্রয়", type: "income", amount: 900 }),
    ];
    const categories = aggregateByCategory(items);
    const salary = categories.find(category => category.name === "বেতন");
    expect(salary).toBeDefined();
    expect(salary?.count).toBe(2);
    expect(salary?.total).toBe(500);
    expect(categories[0].name).toBe("বিক্রয়");
  });

  it("builds a monthly summary sorted by month key", () => {
    const items = [
      txn({ id: 1, type: "income", amount: 1000, occurredAt: "2026-08-03T06:00:00.000Z" }),
      txn({ id: 2, type: "expense", amount: 200, occurredAt: "2026-08-20T06:00:00.000Z" }),
      txn({ id: 3, type: "income", amount: 500, occurredAt: "2026-09-01T06:00:00.000Z" }),
    ];
    const months = monthlySummary(items);
    expect(months.map(month => month.monthKey)).toEqual(["2026-08", "2026-09"]);
    expect(months[0].income).toBe(1000);
    expect(months[0].expense).toBe(200);
    expect(months[0].net).toBe(800);
  });

  it("totals closing balance = opening + income - expense", () => {
    const data: StatementData = {
      project: { id: 1, name: "খাতা" },
      firm: { name: "Ahmed's Financial Accounting", tagline: "", phone: "", email: "", address: "" },
      accounts: [{ id: 1, name: "ক্যাশ", type: "cash", openingBalance: 1000, currentBalance: 1250 }],
      items: [
        txn({ id: 1, type: "income", amount: 400 }),
        txn({ id: 2, type: "expense", amount: 150 }),
      ],
      totals: {
        count: 2,
        income: 400,
        expense: 150,
        netAmount: 250,
        openingBalance: 1000,
        closingBalance: 1250,
      },
    };
    expect(data.totals.closingBalance).toBe(
      data.totals.openingBalance + data.totals.income - data.totals.expense
    );
  });
});