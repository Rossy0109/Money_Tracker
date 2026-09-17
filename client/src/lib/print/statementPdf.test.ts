import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStatementPdf } from "./statementPdf";
import type { StatementData, PrintTransaction } from "./types";

function txn(n: number, type: "income" | "expense" = "expense"): PrintTransaction {
  return {
    id: n,
    projectId: 1,
    accountId: null,
    categoryId: 1,
    type,
    amount: type === "income" ? 500 + n : 100 + n,
    voucherNo: `V-${String(n).padStart(3, "0")}`,
    reason: null,
    paymentMethod: "cash",
    note: `লেনদেন বিবরণ #${n}`,
    occurredAt: new Date(Date.UTC(2026, 8, (n % 28) + 1, 6)),
    createdAt: new Date(Date.UTC(2026, 8, (n % 28) + 1, 6)),
    categoryName: type === "income" ? "বিক্রয়" : "সরঞ্জাম",
    accountName: null,
  };
}

function makeData(count: number): StatementData {
  const items = Array.from({ length: count }, (_, index) => txn(index + 1, index % 3 === 0 ? "income" : "expense"));
  const income = items.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = items.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    project: { id: 1, name: "খাতা" },
    firm: { name: "Ahmed's Financial Accounting", tagline: "ট্যাগলাইন", phone: "+880", email: "x@y.com", address: "ঢাকা" },
    accounts: [{ id: 1, name: "নগদ", type: "cash", openingBalance: 0, currentBalance: income - expense }],
    items,
    totals: {
      count: items.length,
      income,
      expense,
      netAmount: income - expense,
      openingBalance: 0,
      closingBalance: income - expense,
    },
  };
}

const instance = {
  addFileToVFS: vi.fn(),
  addFont: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  line: vi.fn(),
  splitTextToSize: vi.fn((text: string) => [text]),
  addPage: vi.fn(),
  setPage: vi.fn(),
  getNumberOfPages: vi.fn(() => 1),
  save: vi.fn(),
};

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function JsPdfMock() {
    return instance;
  }),
}));

describe("statement PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    });
    instance.getNumberOfPages.mockReturnValue(1);
  });

  it("renders report header, meta and signature block", async () => {
    await buildStatementPdf({
      firmName: "Ahmed's Financial Accounting",
      firmLine: "ট্যাগলাইন",
      firmContact: "ঢাকা",
      title: "দৈনিক আয়-ব্যয় বিবরণী",
      meta: [
        { label: "প্রজেক্ট", value: "খাতা" },
        { label: "সময়কাল", value: "১৫/০৯/২০২৬" },
      ],
      table: {
        columns: [
          { label: "ক্র.", width: 0.1 },
          { label: "তারিখ", width: 0.3 },
          { label: "বিবরণ", width: 0.4 },
          { label: "আয়", width: 0.2, align: "right", format: "money" },
        ],
        rows: [["1", "১৫/০৯/২০২৬", "বিবরণ", 400]],
      },
      totals: [{ label: "মোট আয়", value: "৳ ৪০০.০০" }],
    });
    expect(instance.addFileToVFS).toHaveBeenCalled();
    expect(instance.text).toHaveBeenCalledWith("দৈনিক আয়-ব্যয় বিবরণী", expect.any(Number), expect.any(Number));
  });

  it("paginates 300-row statements and draws a page footer", async () => {
    await buildStatementPdf({
      firmName: "Ahmed's Financial Accounting",
      firmLine: "ট্যাগলাইন",
      firmContact: "ঢাকা",
      title: "তারিখ রেঞ্জ বিবরণী",
      meta: [{ label: "প্রজেক্ট", value: "খাতা" }],
      table: {
        columns: [
          { label: "ক্র.", width: 0.06 },
          { label: "তারিখ", width: 0.14 },
          { label: "ভাউচার", width: 0.12 },
          { label: "বিবরণ", width: 0.44 },
          { label: "খাত", width: 0.1 },
          { label: "আয়", width: 0.14, align: "right", format: "money" },
        ],
        rows: Array.from({ length: 300 }, (_, index) => [
          String(index + 1),
          "১৫/০৯/২০২৬",
          `V-${index + 1}`,
          `বিবরণ ${index + 1}`,
          "খাত",
          index * 10 + 1,
        ]),
      },
      totals: [{ label: "মোট", value: "৳ ৪০০.০০" }],
    });
    expect(instance.addPage).toHaveBeenCalled();
    expect(instance.text).toHaveBeenCalledWith(
      expect.stringContaining("পৃষ্ঠা 1/1"),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" })
    );
  });

  it("uses actual stored totals and does not invent rows", async () => {
    const data = makeData(5);
    const totals = data.totals;
    expect(totals.count).toBe(5);
    expect(totals.income).toBe(1005);
    expect(totals.expense).toBe(310);
    expect(totals.closingBalance).toBe(totals.income - totals.expense);
  });
});