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
    expect(documentApi.text).toHaveBeenCalledWith("মাসের বিস্তারিত লেনদেন", 52, expect.any(Number));
    expect(documentApi.text).toHaveBeenCalledWith("V-012", 106, expect.any(Number));
    expect(documentApi.splitTextToSize).toHaveBeenCalledWith("আগস্ট মাসের বেতন পরিশোধ", 160);
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
    expect(documentApi.text).toHaveBeenCalledWith("মাসের বিস্তারিত লেনদেন (চলমান)", 52, expect.any(Number));
  });
});
