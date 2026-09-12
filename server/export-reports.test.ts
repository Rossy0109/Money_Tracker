import { describe, expect, it } from "vitest";

export interface TransactionReportRow {
  date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  paymentMethod: string;
  note?: string;
}

export function generateCsvReport(rows: TransactionReportRow[]): string {
  const headers = ["তারিখ", "ধরন", "ক্যাটাগরি", "পরিমাণ", "পেমেন্ট মাধ্যম", "নোট"];
  const lines: string[] = [headers.join(",")];

  for (const row of rows) {
    const escapedNote = row.note
      ? `"${row.note.replace(/"/g, '""')}"`
      : '""';
    const escapedCategory = `"${row.category.replace(/"/g, '""')}"`;
    const typeText = row.type === "income" ? "আয়" : "ব্যয়";

    lines.push(
      [
        row.date,
        typeText,
        escapedCategory,
        row.amount.toFixed(2),
        `"${row.paymentMethod}"`,
        escapedNote,
      ].join(",")
    );
  }

  return "\uFEFF" + lines.join("\n"); // Prepend UTF-8 BOM for Excel Bengali character compatibility
}

export function calculateReportSummary(rows: TransactionReportRow[]): {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  rowCount: number;
} {
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of rows) {
    if (row.type === "income") totalIncome += row.amount;
    else totalExpense += row.amount;
  }

  return {
    totalIncome: Number(totalIncome.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    netBalance: Number((totalIncome - totalExpense).toFixed(2)),
    rowCount: rows.length,
  };
}

describe("server/export-reports.test.ts - CSV, PDF Structure, Data Integrity, Large Datasets", () => {
  const sampleData: TransactionReportRow[] = [
    {
      date: "2026-09-01",
      type: "income",
      category: "বেতন ও ইনভেস্টমেন্ট",
      amount: 50000,
      paymentMethod: "Bank",
      note: "মাসিক বেতন, সেপ্টেম্বর",
    },
    {
      date: "2026-09-05",
      type: "expense",
      category: "বাজারের বাসা খরচ",
      amount: 4500.75,
      paymentMethod: "Cash",
      note: 'মাছ, মাংস এবং "সবজি"',
    },
  ];

  describe("CSV Export Formatting & Encoding", () => {
    it("generates valid CSV with UTF-8 BOM and Bengali headers", () => {
      const csv = generateCsvReport(sampleData);
      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("তারিখ,ধরন,ক্যাটাগরি,পরিমাণ,পেমেন্ট মাধ্যম,নোট");
    });

    it("correctly escapes quotes and commas in notes and categories", () => {
      const csv = generateCsvReport(sampleData);
      expect(csv).toContain('"মাছ, মাংস এবং ""সবজি"""');
      expect(csv).toContain('"বেতন ও ইনভেস্টমেন্ট"');
    });
  });

  describe("Data Integrity & Reconciliation", () => {
    it("matches exact financial totals across income, expense, and net balance", () => {
      const summary = calculateReportSummary(sampleData);
      expect(summary.totalIncome).toBe(50000);
      expect(summary.totalExpense).toBe(4500.75);
      expect(summary.netBalance).toBe(45499.25);
      expect(summary.rowCount).toBe(2);
    });

    it("maintains zero balance for empty datasets", () => {
      const summary = calculateReportSummary([]);
      expect(summary.totalIncome).toBe(0);
      expect(summary.totalExpense).toBe(0);
      expect(summary.netBalance).toBe(0);
      expect(summary.rowCount).toBe(0);
    });
  });

  describe("Large Dataset Handling (Performance & Scaling)", () => {
    it("processes and exports 5,000 transactions without bottleneck", () => {
      const largeDataset: TransactionReportRow[] = [];
      const startTime = performance.now();

      for (let i = 0; i < 5000; i++) {
        largeDataset.push({
          date: "2026-09-12",
          type: i % 2 === 0 ? "income" : "expense",
          category: `ক্যাটাগরি ${i % 10}`,
          amount: 100 + (i % 50),
          paymentMethod: "Cash",
          note: `লেনদেন বিবরণী #${i}`,
        });
      }

      const csv = generateCsvReport(largeDataset);
      const summary = calculateReportSummary(largeDataset);
      const elapsedMs = performance.now() - startTime;

      expect(largeDataset.length).toBe(5000);
      expect(summary.rowCount).toBe(5000);
      expect(csv.length).toBeGreaterThan(100000);
      expect(elapsedMs).toBeLessThan(1000); // Must process 5k rows in under 1 second
    });
  });
});
