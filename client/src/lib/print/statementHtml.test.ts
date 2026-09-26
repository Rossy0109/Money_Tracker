import { describe, expect, it } from "vitest";
import { buildStatementHtml } from "./statementHtml";
import type { StatementData, PrintTransaction } from "./types";

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
    note: "বিবরণ",
    occurredAt: "2026-09-15T06:00:00.000Z",
    createdAt: "2026-09-15T06:00:00.000Z",
    categoryName: "খরচ খাত",
    accountName: null,
    ...overrides,
  };
}

function makeData(): StatementData {
  return {
    project: { id: 1, name: "দৈনিক লেনদেনের খাতা" },
    firm: {
      name: "Ahmed's Financial Accounting",
      tagline: "ট্যাগলাইন",
      phone: "+880 17",
      email: "x@y.com",
      address: "ঢাকা",
    },
    accounts: [
      {
        id: 1,
        name: "নগদ",
        type: "cash",
        openingBalance: 1000,
        currentBalance: 1600,
      },
    ],
    items: [
      txn({
        id: 1,
        type: "income",
        amount: 500,
        voucherNo: "V-010",
        categoryName: "বিক্রয়",
      }),
      txn({
        id: 2,
        type: "income",
        amount: 100,
        voucherNo: "V-011",
        categoryName: "বিক্রয়",
      }),
      txn({
        id: 3,
        type: "expense",
        amount: 200,
        voucherNo: "V-012",
        categoryName: "সরঞ্জাম",
      }),
    ],
    totals: {
      count: 3,
      income: 600,
      expense: 200,
      netAmount: 400,
      openingBalance: 1000,
      closingBalance: 1400,
    },
  };
}

describe("statement HTML builders", () => {
  it("daily statement lists every row with running balance and exact filters-per-totals", () => {
    const data = makeData();
    const html = buildStatementHtml(data, {
      kind: "daily",
      periodLabel: "১৫/০৯/২০২৬",
      title: "দৈনিক আয়-ব্যয় বিবরণী",
    });
    expect(html).toContain("V-010");
    expect(html).toContain("V-012");
    expect(html).toContain("মোট আয়/আমানত");
    expect(html).toContain("মোট ব্যয়/খরচ");
    expect(html).toContain("নিট পরিমাণ");
    expect(html).toContain("৳ ১,৪০০.০০");
  });

  it("income-only statement omits expense rows and shows only income total", () => {
    const html = buildStatementHtml(makeData(), {
      kind: "income",
      periodLabel: "সব সময়কাল",
      title: "আয় বিবরণী",
    });
    expect(html).toContain("V-010");
    expect(html).not.toContain("V-012");
    expect(html).toContain("মোট আয়/আমানত");
  });

  it("category statement groups by category with count and total", () => {
    const html = buildStatementHtml(makeData(), {
      kind: "category",
      periodLabel: "সব সময়কাল",
      title: "ক্যাটাগরি/খাতভিত্তিক বিবরণী",
    });
    expect(html).toContain("বিক্রয়");
    expect(html).toContain("সরঞ্জাম");
    expect(html).toContain("২ টি");
    expect(html).toContain("মোট ২ টি খাত");
  });

  it("cash book shows opening and closing balance", () => {
    const html = buildStatementHtml(makeData(), {
      kind: "cashbook",
      periodLabel: "সব সময়কাল",
      title: "ক্যাশ বুক",
    });
    expect(html).toContain("উদ্বোধনী জের");
    expect(html).toContain("সমাপনী জের");
    expect(html).toContain("প্রাপ্তি (জমা)");
  });

  it("yearly summary aggregates months and categories", () => {
    const html = buildStatementHtml(makeData(), {
      kind: "yearly",
      periodLabel: "এই বছর",
      title: "মাসিক/বার্ষিক সারসংক্ষেপ",
    });
    expect(html).toContain("মাসভিত্তিক সারসংক্ষেপ");
    expect(html).toContain("খাতভিত্তিক সারসংক্ষেপ");
    expect(html).toContain("নিট ব্যালেন্স");
  });

  it("escapes user content in reports", () => {
    const data = makeData();
    data.items[0].note = "<script>bad()</script>";
    const html = buildStatementHtml(data, {
      kind: "daily",
      periodLabel: "সব",
      title: "বিবরণী",
    });
    expect(html).not.toContain("<script>bad");
    expect(html).toContain("&lt;script&gt;");
  });
});
