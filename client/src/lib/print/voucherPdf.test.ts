import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadVoucherPdf, buildVoucherPdf } from "./voucherPdf";
import type { VoucherPrintData } from "./types";

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
  save: vi.fn(),
  output: vi.fn(() => new Blob(["pdf"])),
};

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function JsPdfMock() {
    return instance;
  }),
}));

const voucher: VoucherPrintData = {
  project: { id: 1, name: "খাতা" },
  firm: {
    name: "Ahmed's Financial Accounting",
    tagline: "ট্যাগলাইন",
    phone: "+880",
    email: "x@y.com",
    address: "ঢাকা",
  },
  transaction: {
    id: 7,
    projectId: 1,
    accountId: null,
    categoryId: 3,
    type: "income",
    amount: 1250,
    voucherNo: "V-009",
    reason: "গ্রাহক",
    paymentMethod: "cash",
    note: "আমানত",
    occurredAt: new Date("2026-09-15T06:00:00.000Z"),
    createdAt: new Date("2026-09-15T06:00:00.000Z"),
    categoryName: "বিক্রয়",
    accountName: null,
  },
};

describe("voucher PDF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    });
  });

  it("embeds the Bengali font and renders the voucher fields", async () => {
    await buildVoucherPdf(voucher);
    expect(instance.addFileToVFS).toHaveBeenCalledWith(
      "NotoSansBengali-Regular.ttf",
      expect.any(String)
    );
    expect(instance.text).toHaveBeenCalledWith(
      expect.stringContaining("VOUCHER"),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" })
    );
    expect(instance.text).toHaveBeenCalledWith(
      expect.stringContaining("V-009"),
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ align: "right" })
    );
  });

  it("downloads the voucher as a PDF", async () => {
    await downloadVoucherPdf(voucher);
    expect(instance.save).toHaveBeenCalledWith("voucher-V-009.pdf");
  });
});
