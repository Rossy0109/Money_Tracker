import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadMonthlyReportPdf } from "./monthlyReportPdf";

const documentApi = {
  addFileToVFS: vi.fn(),
  addFont: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  setDrawColor: vi.fn(),
  line: vi.fn(),
  splitTextToSize: vi.fn((text: string) => [text]),
  addPage: vi.fn(),
  save: vi.fn(),
};

vi.mock("jspdf", () => ({ jsPDF: vi.fn(() => documentApi) }));

describe("monthly report PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
    });
  });

  it("embeds the Bengali font and downloads a month-specific BDT report", async () => {
    await downloadMonthlyReportPdf({
      projectName: "দৈনিক লেনদেনের খাতা",
      monthKey: "2026-08",
      totalIncome: 12000,
      totalExpense: 3500,
      netAmount: 8500,
      categoryTotals: [{ name: "বেতন", type: "expense", total: 3500 }],
      totalDebt: 900,
      totalReceivable: 1400,
      transactionCount: 2,
      transactionDetails: [{
        occurredAt: new Date("2026-08-19T12:00:00.000Z"),
        voucherNo: "V-012",
        type: "expense",
        categoryName: "বেতন",
        description: "আগস্ট মাসের বেতন পরিশোধ",
        amount: 3500,
      }],
    });

    expect(documentApi.addFileToVFS).toHaveBeenCalledWith("NotoSansBengali-Regular.ttf", expect.any(String));
    expect(documentApi.text).toHaveBeenCalledWith("মাসিক আর্থিক রিপোর্ট", 42, 50);
    expect(documentApi.text).toHaveBeenCalledWith("মোট আয়", 54, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("আয়ের বিস্তারিত লেনদেন", 52, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("নির্বাচিত মাসে কোনো আয়ের লেনদেন নেই।", 54, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("ব্যয়ের বিস্তারিত লেনদেন", 52, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("ক্যাটাগরি: বেতন", 50, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("১ টি লেনদেন | উপমোট: ৳ ৩,৫০০ | অংশ: ১০০%", expect.any(Number), expect.any(Number), { align: "right" });
    expect(documentApi.text).toHaveBeenCalledWith("V-012", 106, expect.any(Number));
    expect(documentApi.splitTextToSize).toHaveBeenCalledWith("আগস্ট মাসের বেতন পরিশোধ", 320);
    expect(documentApi.save).toHaveBeenCalledWith("monthly-report-2026-08.pdf");
  });

  it("continues a long detailed transaction list onto a new PDF page", async () => {
    await downloadMonthlyReportPdf({
      projectName: "দৈনিক লেনদেনের খাতা",
      monthKey: "2026-08",
      totalIncome: 0,
      totalExpense: 42000,
      netAmount: -42000,
      categoryTotals: [],
      totalDebt: 0,
      totalReceivable: 0,
      transactionCount: 28,
      transactionDetails: Array.from({ length: 28 }, (_, index) => ({
        occurredAt: new Date("2026-08-19T12:00:00.000Z"),
        voucherNo: `V-${index + 1}`,
        type: "expense" as const,
        categoryName: "বেতন",
        description: `বিস্তারিত লেনদেন ${index + 1}`,
        amount: 1500,
      })),
    });

    expect(documentApi.addPage).toHaveBeenCalled();
    expect(documentApi.text).toHaveBeenCalledWith("ব্যয়ের বিস্তারিত লেনদেন (চলমান)", 52, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("ক্যাটাগরি: বেতন (চলমান)", 50, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("২৮ টি লেনদেন | উপমোট: ৳ ৪২,০০০ | অংশ: ১০০%", expect.any(Number), expect.any(Number), { align: "right" });
  });

  it("renders income rows before a separate expense transaction table", async () => {
    await downloadMonthlyReportPdf({
      projectName: "দৈনিক লেনদেনের খাতা",
      monthKey: "2026-08",
      totalIncome: 8000,
      totalExpense: 3500,
      netAmount: 4500,
      categoryTotals: [],
      totalDebt: 0,
      totalReceivable: 0,
      transactionCount: 2,
      transactionDetails: [
        { occurredAt: new Date("2026-08-18T12:00:00.000Z"), voucherNo: "V-011", type: "income", categoryName: "Business", description: "প্রকল্পের আয়", amount: 8000 },
        { occurredAt: new Date("2026-08-19T12:00:00.000Z"), voucherNo: "V-012", type: "expense", categoryName: "বেতন", description: "আগস্ট মাসের বেতন", amount: 3500 },
      ],
    });

    const incomeHeadingIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "আয়ের বিস্তারিত লেনদেন");
    const expenseHeadingIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "ব্যয়ের বিস্তারিত লেনদেন");
    const incomeVoucherIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "V-011");
    const expenseVoucherIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "V-012");
    expect(incomeHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(expenseHeadingIndex).toBeGreaterThan(incomeHeadingIndex);
    expect(incomeVoucherIndex).toBeGreaterThan(incomeHeadingIndex);
    expect(expenseVoucherIndex).toBeGreaterThan(expenseHeadingIndex);
  });

  it("groups transaction rows under one category subheading before the next category", async () => {
    await downloadMonthlyReportPdf({
      projectName: "দৈনিক লেনদেনের খাতা",
      monthKey: "2026-08",
      totalIncome: 13000,
      totalExpense: 0,
      netAmount: 13000,
      categoryTotals: [],
      totalDebt: 0,
      totalReceivable: 0,
      transactionCount: 3,
      transactionDetails: [
        { occurredAt: new Date("2026-08-17T12:00:00.000Z"), voucherNo: "V-010", type: "income", categoryName: "Business", description: "প্রথম ব্যবসায়িক আয়", amount: 5000 },
        { occurredAt: new Date("2026-08-18T12:00:00.000Z"), voucherNo: "V-011", type: "income", categoryName: "Salary", description: "মাসিক বেতন", amount: 3000 },
        { occurredAt: new Date("2026-08-19T12:00:00.000Z"), voucherNo: "V-012", type: "income", categoryName: "Business", description: "দ্বিতীয় ব্যবসায়িক আয়", amount: 5000 },
      ],
    });

    const businessHeadingIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "ক্যাটাগরি: Business");
    const salaryHeadingIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "ক্যাটাগরি: Salary");
    const firstBusinessVoucherIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "V-010");
    const secondBusinessVoucherIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "V-012");
    const salaryVoucherIndex = documentApi.text.mock.calls.findIndex(call => call[0] === "V-011");
    expect(businessHeadingIndex).toBeGreaterThanOrEqual(0);
    expect(salaryHeadingIndex).toBeGreaterThan(businessHeadingIndex);
    expect(firstBusinessVoucherIndex).toBeGreaterThan(businessHeadingIndex);
    expect(secondBusinessVoucherIndex).toBeGreaterThan(firstBusinessVoucherIndex);
    expect(salaryVoucherIndex).toBeGreaterThan(salaryHeadingIndex);
    expect(salaryVoucherIndex).toBeGreaterThan(secondBusinessVoucherIndex);
    expect(documentApi.text).toHaveBeenCalledWith("২ টি লেনদেন | উপমোট: ৳ ১০,০০০ | অংশ: ৭৬.৯%", expect.any(Number), expect.any(Number), { align: "right" });
    expect(documentApi.text).toHaveBeenCalledWith("১ টি লেনদেন | উপমোট: ৳ ৩,০০০ | অংশ: ২৩.১%", expect.any(Number), expect.any(Number), { align: "right" });
  });

  it("shows a safe zero percentage when a section total is zero", async () => {
    await downloadMonthlyReportPdf({
      projectName: "দৈনিক লেনদেনের খাতা",
      monthKey: "2026-08",
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
      categoryTotals: [],
      totalDebt: 0,
      totalReceivable: 0,
      transactionCount: 1,
      transactionDetails: [
        { occurredAt: new Date("2026-08-20T12:00:00.000Z"), voucherNo: "V-013", type: "income", categoryName: "Business", description: "শূন্য মূল্যের সংশোধনী", amount: 0 },
      ],
    });

    expect(documentApi.text).toHaveBeenCalledWith("১ টি লেনদেন | উপমোট: ৳ ০ | অংশ: ০%", expect.any(Number), expect.any(Number), { align: "right" });
  });
});
