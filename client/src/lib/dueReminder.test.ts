import { describe, it, expect } from "vitest";
import {
  formatBdPhoneNumber,
  generateInvoiceReminderMessage,
  generateDueReminderMessage,
  getWhatsAppShareUrl,
  getSmsShareUrl,
} from "./dueReminder";

describe("dueReminder", () => {
  it("formats Bangladeshi phone numbers accurately", () => {
    expect(formatBdPhoneNumber("01712345678")).toBe("8801712345678");
    expect(formatBdPhoneNumber("+8801712345678")).toBe("8801712345678");
    expect(formatBdPhoneNumber("8801812345678")).toBe("8801812345678");
    expect(formatBdPhoneNumber(null)).toBe("");
  });

  it("generates invoice reminder message with due breakdown", () => {
    const msg = generateInvoiceReminderMessage({
      invoiceNumber: "INV-2026-001",
      clientName: "রহিম ট্রেডার্স",
      grandTotal: 15000,
      paidAmount: 5000,
      dueDate: "2026-09-10",
    });

    expect(msg).toContain("রহিম ট্রেডার্স");
    expect(msg).toContain("INV-2026-001");
    expect(msg).toContain("৳ 10,000.00");
    expect(msg).toContain("2026-09-10");
  });

  it("generates due reminder message for receivable entries", () => {
    const msg = generateDueReminderMessage({
      counterparty: "করিম সাহেব",
      outstandingAmount: 25000,
      voucherNo: "V-0045",
      reason: "মালামাল সরবরাহ",
    });

    expect(msg).toContain("করিম সাহেব");
    expect(msg).toContain("V-0045");
    expect(msg).toContain("৳ 25,000.00");
    expect(msg).toContain("মালামাল সরবরাহ");
  });

  it("constructs WhatsApp and SMS share URLs correctly", () => {
    const waUrl = getWhatsAppShareUrl("01711223344", "টেস্ট মেসেজ");
    expect(waUrl).toContain("https://wa.me/8801711223344?text=");

    const smsUrl = getSmsShareUrl("01711223344", "টেস্ট মেসেজ");
    expect(smsUrl).toContain("sms:8801711223344?body=");
  });
});
