import { describe, it, expect } from "vitest";
import { generateTransactionsCsv } from "./csvExporter";

describe("csvExporter", () => {
  it("generates CSV with UTF-8 BOM and Bengali headers", () => {
    const data = [
      {
        date: "2026-08-29",
        voucherNo: "V-1001",
        type: "income",
        categoryName: "বেতন",
        accountName: "ব্যাংক অ্যাকাউন্ট",
        amount: 50000,
        note: "আগস্ট মাসের বেতন",
      },
      {
        date: "2026-08-29",
        voucherNo: "V-1002",
        type: "expense",
        categoryName: "ইউটিলিটি বিল",
        accountName: "বিকাশ",
        amount: 1500,
        note: "বিদ্যুৎ বিল",
      },
    ];

    const csv = generateTransactionsCsv(data);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"তারিখ","ভাউচার নং","ধরণ","ক্যাটাগরি","অ্যাকাউন্ট","পরিমাণ (৳)","বিবরণ"');
    expect(csv).toContain('"2026-08-29","V-1001","আয়","বেতন","ব্যাংক অ্যাকাউন্ট","50000","আগস্ট মাসের বেতন"');
    expect(csv).toContain('"2026-08-29","V-1002","ব্যয়","ইউটিলিটি বিল","বিকাশ","1500","বিদ্যুৎ বিল"');
  });

  it("handles empty or special character rows safely", () => {
    const data = [
      {
        date: "2026-08-30",
        type: "expense",
        amount: 300,
        note: 'বাজার থেকে "মাছ" ও সবজি',
      },
    ];

    const csv = generateTransactionsCsv(data);
    expect(csv).toContain('""মাছ""');
  });
});
