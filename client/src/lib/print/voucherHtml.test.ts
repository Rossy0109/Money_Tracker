import { describe, expect, it } from "vitest";
import { voucherBodyHtml } from "./voucherHtml";
import type { VoucherPrintData } from "./types";

const voucher: VoucherPrintData = {
  project: { id: 1, name: "দৈনিক লেনদেনের খাতা" },
  firm: {
    name: "Ahmed's Financial Accounting",
    tagline: "Professional Accounting & Financial Management",
    phone: "+880 1700-000000",
    email: "support@ahmedfinance.com",
    address: "ঢাকা, বাংলাদেশ",
  },
  transaction: {
    id: 42,
    projectId: 1,
    accountId: 2,
    categoryId: 3,
    type: "expense",
    amount: 750.5,
    voucherNo: "V-012",
    reason: "মেসার্স রহমান ট্রেডার্স",
    paymentMethod: "cash",
    note: "অফিস সরঞ্জাম ক্রয়",
    occurredAt: new Date("2026-09-15T06:00:00.000Z"),
    createdAt: new Date("2026-09-15T06:05:00.000Z"),
    categoryName: "সরঞ্জাম",
    accountName: "নগদ",
  },
};

describe("individual transaction voucher", () => {
  it("contains every master voucher field", () => {
    const html = voucherBodyHtml(voucher);
    expect(html).toContain("Ahmed&#39;s Financial Accounting");
    expect(html).toContain("দৈনিক লেনদেনের খাতা");
    expect(html).toContain("V-012");
    expect(html).toContain("সরঞ্জাম");
    expect(html).toContain("অফিস সরঞ্জাম ক্রয়");
    expect(html).toContain("মেসার্স রহমান ট্রেডার্স");
    expect(html).toContain("৳");
    expect(html).toContain("টাকার অংকে");
    expect(html).toContain("Amount in Words");
    expect(html).toContain("অনুমোদনকারীর স্বাক্ষর");
    expect(html).toContain("প্রদানকারীর স্বাক্ষর");
    expect(html).toContain("গ্রহীতার স্বাক্ষর");
  });

  it("titles income vouchers as deposit receipts", () => {
    const incomeVoucher: VoucherPrintData = {
      ...voucher,
      transaction: { ...voucher.transaction, type: "income", amount: 2500 },
    };
    const html = voucherBodyHtml(incomeVoucher);
    expect(html).toContain("আমানত রসিদ");
    expect(html).toContain("৳ ২,৫০০.০০");
  });

  it("escapes HTML from user-supplied fields", () => {
    const malicious: VoucherPrintData = {
      ...voucher,
      transaction: {
        ...voucher.transaction,
        note: "<script>alert('x')</script>",
        reason: "<img onerror=alert(1)>",
      },
    };
    const html = voucherBodyHtml(malicious);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img onerror");
    expect(html).toContain("&lt;script&gt;");
  });
});