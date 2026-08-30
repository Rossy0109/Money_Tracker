export type TransactionExportRow = {
  date: string;
  voucherNo?: string | null;
  type: "income" | "expense" | string;
  categoryName?: string | null;
  accountName?: string | null;
  amount: number | string;
  note?: string | null;
};

export function generateTransactionsCsv(rows: TransactionExportRow[]): string {
  // UTF-8 BOM for Microsoft Excel Bengali font rendering
  const BOM = "\uFEFF";
  const headers = ["তারিখ", "ভাউচার নং", "ধরণ", "ক্যাটাগরি", "অ্যাকাউন্ট", "পরিমাণ (৳)", "বিবরণ"];

  const escapeCsvCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = rows.map((r) => {
    const typeLabel = r.type === "income" ? "আয়" : r.type === "expense" ? "ব্যয়" : r.type;
    return [
      escapeCsvCell(r.date),
      escapeCsvCell(r.voucherNo || "-"),
      escapeCsvCell(typeLabel),
      escapeCsvCell(r.categoryName || "সাধারণ"),
      escapeCsvCell(r.accountName || "ক্যাশ"),
      escapeCsvCell(r.amount),
      escapeCsvCell(r.note || ""),
    ].join(",");
  });

  return BOM + [headers.map(escapeCsvCell).join(","), ...csvRows].join("\r\n");
}

export function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
