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
    });

    expect(documentApi.addFileToVFS).toHaveBeenCalledWith("NotoSansBengali-Regular.ttf", expect.any(String));
    expect(documentApi.text).toHaveBeenCalledWith("মাসিক আর্থিক রিপোর্ট", 42, 50);
    expect(documentApi.text).toHaveBeenCalledWith("মোট আয়", 54, expect.any(Number));
    expect(documentApi.save).toHaveBeenCalledWith("monthly-report-2026-08.pdf");
  });
});
