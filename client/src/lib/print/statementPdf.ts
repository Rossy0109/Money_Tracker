import type { jsPDF } from "jspdf";
import { moneyBn, printDate, printDateTime } from "./layout";
import {
  aggregateByCategory,
  monthlySummary,
  type RunningRow,
  withRunningBalance,
} from "./statementCalculations";
import type { StatementData, StatementKind } from "./types";

const BENGALI_FONT_URL = "/fonts/NotoSansBengali-Regular.ttf";

async function loadBengaliFont(doc: jsPDF) {
  const response = await window.fetch(BENGALI_FONT_URL);
  if (!response.ok) throw new Error("PDF ফন্ট লোড করা যায়নি");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  doc.addFileToVFS("NotoSansBengali-Regular.ttf", btoa(binary));
  doc.addFont("NotoSansBengali-Regular.ttf", "NotoSansBengali", "normal");
  doc.setFont("NotoSansBengali", "normal");
}

export type PdfColumn = {
  label: string;
  align?: "left" | "right" | "center";
  width: number; // fraction of content width (must sum to 1)
  format?: "text" | "money" | "number";
};

export type PdfRow = Array<string | number>;

export type PdfTable = {
  columns: PdfColumn[];
  rows: PdfRow[];
  emptyMessage?: string;
};

export type PdfMetaRow = { label: string; value: string };
export type PdfTotalRow = { label: string; value: string; tone?: "normal" | "grand" };

async function renderHeader(
  doc: jsPDF,
  options: {
    firmName: string;
    firmLine: string;
    firmContact: string;
    title: string;
    subtitle?: string;
  }
) {
  const pageW = 595;
  const margin = 40;
  doc.setFillColor(17, 58, 48);
  doc.rect(0, 0, pageW, 44, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(options.firmName, margin, 17);
  doc.setFontSize(8.5);
  doc.setTextColor(190, 214, 200);
  doc.text(options.firmLine, margin, 27);
  doc.text(options.firmContact || " ", margin, 37);

  doc.setTextColor(22, 60, 50);
  doc.setFontSize(13);
  doc.text(options.title, margin, 62);
  if (options.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(94, 116, 105);
    doc.text(options.subtitle, margin, 76);
  }
}

function renderMeta(
  doc: jsPDF,
  meta: PdfMetaRow[],
  startY: number
): number {
  const margin = 40;
  const contentW = 515;
  doc.setDrawColor(207, 217, 211);
  doc.setFillColor(247, 250, 248);
  doc.rect(margin, startY - 10, contentW, meta.length * 15 + 8, "F");
  doc.setFontSize(9);
  let y = startY + 2;
  for (const row of meta) {
    doc.setTextColor(82, 102, 92);
    doc.text(row.label, margin + 8, y);
    doc.setTextColor(21, 49, 42);
    doc.text(row.value, margin + contentW - 8, y, { align: "right" });
    y += 15;
  }
  return startY + meta.length * 15 + 18;
}

function renderTable(
  doc: jsPDF,
  table: PdfTable,
  startY: number
): { endY: number; pageCount: number } {
  const margin = 40;
  const contentW = 515;
  const bottomLimit = 755;
  const colWidths = table.columns.map(col => col.width * contentW);
  let y = startY;
  let pageCount = 1;

  const drawHeader = () => {
    doc.setFillColor(23, 63, 54);
    doc.rect(margin, y - 12, contentW, 17, "F");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    table.columns.forEach((col, index) => {
      const x = margin + colWidths.slice(0, index).reduce((sum, w) => sum + w, 0);
      doc.text(col.label, x + 4, y - 1, col.align === "right" ? { align: "right" } : undefined);
    });
    y += 4;
  };

  const drawFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(107, 125, 115);
    doc.text(`পৃষ্ঠা ${doc.getNumberOfPages()}`, margin + contentW, 800, { align: "right" });
    doc.setDrawColor(210, 220, 214);
    doc.line(margin, 806, margin + contentW, 806);
    doc.setTextColor(140, 155, 147);
    doc.text("Money_Tracker · মুদ্রণ", margin, 812);
  };

  drawHeader();
  const isMoney = (col: PdfColumn) => col.format === "money";
  const isNumber = (col: PdfColumn) => col.format === "number";

  const empty = !table.rows.length;
  if (empty) {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 106);
    const message = table.emptyMessage ?? "নির্বাচিত সময়সীমায় কোনো লেনদেন পাওয়া যায়নি।";
    doc.text(message, margin + contentW / 2, y + 10, { align: "center" });
    y += 30;
  } else {
    for (const row of table.rows) {
      const heights = table.columns.map((col, index) => {
        const value = row[index];
        if (typeof value === "number" || col.format) return 16;
        const cellText = String(value ?? "");
        const lines = doc.splitTextToSize(cellText, colWidths[index] - 10);
        return Math.max(16, lines.length * 10 + 6);
      });
      const rowHeight = Math.max(...heights, 16);
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        pageCount += 1;
        y = 50;
        drawHeader();
        drawFooter();
      }
      table.columns.forEach((col, index) => {
        const x = margin + colWidths.slice(0, index).reduce((sum, w) => sum + w, 0);
        let text: string;
        if (isMoney(col)) text = moneyBn(Number(row[index] ?? 0));
        else if (isNumber(col)) text = String(Number(row[index] ?? 0).toLocaleString("bn-BD"));
        else text = String(row[index] ?? "");
        doc.setTextColor(33, 52, 44);
        if (isMoney(col) || isNumber(col) || col.align === "right") {
          doc.text(text, x + colWidths[index] - 4, y + 11, { align: "right" });
        } else {
          const lines = doc.splitTextToSize(text, colWidths[index] - 10);
          doc.text(lines, x + 4, y + 11);
        }
        doc.setDrawColor(215, 223, 217);
        doc.rect(x, y - 10, colWidths[index], rowHeight);
      });
      doc.setDrawColor(215, 223, 217);
      doc.line(margin, y + rowHeight - 10, margin + contentW, y + rowHeight - 10);
      y += rowHeight;
    }
  }
  drawFooter();
  return { endY: y + 14, pageCount };
}

function renderTotals(
  doc: jsPDF,
  totals: PdfTotalRow[],
  startY: number
): number {
  const margin = 40;
  const contentW = 515;
  const totalContentW = 240;
  let y = startY;
  for (const row of totals) {
    const isGrand = row.tone === "grand";
    doc.setFillColor(isGrand ? 220 : 240, isGrand ? 235 : 245, isGrand ? 226 : 240);
    doc.rect(margin + contentW - totalContentW, y - 10, totalContentW, 18, "F");
    doc.setFontSize(10);
    doc.setFont("NotoSansBengali", isGrand ? "bold" : "normal");
    doc.setTextColor(isGrand ? 15 : 23, isGrand ? 47 : 63, isGrand ? 38 : 54);
    doc.text(row.label, margin + contentW - totalContentW + 8, y + 1);
    doc.text(row.value, margin + contentW - 8, y + 1, { align: "right" });
    doc.setFont("NotoSansBengali", "normal");
    y += 21;
  }
  return y;
}

function renderSignatureBlock(doc: jsPDF, startY: number) {
  const margin = 40;
  const contentW = 515;
  const colW = (contentW - 40) / 3;
  const labels = [
    ["প্রস্তুতকারকের স্বাক্ষর", "(Prepared By)"],
    ["যাচাইকারীর স্বাক্ষর", "(Checked / Accountant)"],
    ["অনুমোদিত অফিসারের স্বাক্ষর ও সিল", "(Authorized Signature & Seal)"],
  ];
  for (let index = 0; index < 3; index += 1) {
    const x = margin + index * (colW + 20);
    doc.setDrawColor(120, 140, 132);
    doc.line(x, startY, x + colW, startY);
    doc.setFontSize(9);
    doc.setTextColor(60, 78, 70);
    doc.text(labels[index][0], x + colW / 2, startY + 12, { align: "center" });
    doc.setFontSize(7.5);
    doc.setTextColor(120, 138, 130);
    doc.text(labels[index][1], x + colW / 2, startY + 21, { align: "center" });
  }
}

export async function buildStatementPdf(options: {
  firmName: string;
  firmLine: string;
  firmContact: string;
  title: string;
  subtitle?: string;
  meta: PdfMetaRow[];
  table: PdfTable;
  totals: PdfTotalRow[];
}): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  await loadBengaliFont(doc);

  await renderHeader(doc, options);
  const metaEnd = renderMeta(doc, options.meta, 92);
  const tableEnd = renderTable(doc, options.table, metaEnd).endY;
  const totalsEnd = renderTotals(doc, options.totals, tableEnd + 8);
  renderSignatureBlock(doc, Math.min(Math.max(totalsEnd + 18, 690), 742));

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(140, 155, 147);
    doc.text(
      `Money_Tracker · তৈরির সময়: ${printDateTime(new Date())} · পৃষ্ঠা ${page}/${pageCount}`,
      595 - 40,
      832,
      { align: "right" },
    );
  }
  return doc;
}

export async function downloadStatementPdf(
  data: StatementData,
  kind: StatementKind,
  options: { title: string; periodLabel: string }
): Promise<jsPDF> {
  const { columns, rows, totals, subtitle } = statementTableForPdf(data, kind);
  const table = { columns, rows, emptyMessage: "নির্বাচিত সময়সীমায় কোনো লেনদেন পাওয়া যায়নি।" };
  return buildStatementPdf({
    firmName: data.firm.name,
    firmLine: data.firm.tagline,
    firmContact: [data.firm.address, data.firm.phone, data.firm.email].filter(Boolean).join("  |  "),
    title: options.title,
    subtitle,
    meta: [
      { label: "প্রজেক্ট", value: data.project.name },
      { label: "সময়কাল", value: options.periodLabel },
      { label: "তৈরি", value: printDateTime(new Date()) },
    ],
    table,
    totals,
  });
}

function statementTableForPdf(data: StatementData, kind: StatementKind): {
  columns: PdfColumn[];
  rows: PdfRow[];
  totals: PdfTotalRow[];
  subtitle?: string;
} {
  const totalsData = data.totals;
  const running = withRunningBalance(data.items, totalsData.openingBalance);
  const moneyCol = (label: string, width: number, _format: "money" = "money") =>
    ({ label, width, align: "right" } as PdfColumn);
  const detailedColumns: PdfColumn[] = [
    { label: "ক্র.", width: 0.05, align: "center" },
    { label: "তারিখ", width: 0.14 },
    { label: "ভাউচার", width: 0.12 },
    { label: "বিবরণ", width: 0.27 },
    { label: "খাত", width: 0.17 },
    moneyCol("আয়", 0.12),
    moneyCol("ব্যয়", 0.13),
  ];
  const detailedRow = (row: RunningRow) => [
    printDate(row.occurredAt),
    row.voucherNo || "—",
    row.note?.trim() || "—",
    row.categoryName,
    row.type === "income" ? Number(row.amount) : "—",
    row.type === "expense" ? Number(row.amount) : "—",
  ];

  const cashbookColumns: PdfColumn[] = [
    { label: "ক্র.", width: 0.05, align: "center" },
    { label: "তারিখ", width: 0.12 },
    { label: "ভাউচার", width: 0.13 },
    { label: "বিবরণ", width: 0.3 },
    moneyCol("প্রাপ্তি", 0.13),
    moneyCol("প্রদান", 0.13),
    moneyCol("জের", 0.14),
  ];
  const cashbookRow = (row: RunningRow) => [
    printDate(row.occurredAt),
    row.voucherNo || "—",
    row.note?.trim() || row.categoryName,
    row.type === "income" ? Number(row.amount) : "—",
    row.type === "expense" ? Number(row.amount) : "—",
    row.runningBalance,
  ];

  const categoryColumns: PdfColumn[] = [
    { label: "ক্র.", width: 0.06, align: "center" },
    { label: "ক্যাটাগরি/খাত", width: 0.5 },
    { label: "ধরন", width: 0.16 },
    { label: "লেনদেন", width: 0.1, align: "center" },
    moneyCol("মোট", 0.18),
  ];
  const categoryRows = aggregateByCategory(data.items);
  const categoryPdfRows: PdfRow[] = categoryRows.map((row, index) => [
    String(index + 1),
    row.name,
    row.type === "income" ? "আয়" : "ব্যয়",
    new Intl.NumberFormat("bn-BD").format(row.count),
    row.total,
  ]);

  const monthlyColumns: PdfColumn[] = [
    { label: "ক্র.", width: 0.06, align: "center" },
    { label: "মাস", width: 0.34 },
    { label: "লেনদেন", width: 0.12, align: "center" },
    moneyCol("আয়", 0.16),
    moneyCol("ব্যয়", 0.16),
    moneyCol("নিট", 0.16),
  ];
  const monthly = monthlySummary(data.items);
  const monthlyPdfRows: PdfRow[] = monthly.map((row, index) => [
    String(index + 1),
    row.monthLabel,
    new Intl.NumberFormat("bn-BD").format(row.count),
    row.income,
    row.expense,
    row.net,
  ]);

  switch (kind) {
    case "income":
      return {
        columns: [
          { label: "ক্র.", width: 0.05, align: "center" },
          { label: "তারিখ", width: 0.15 },
          { label: "ভাউচার", width: 0.13 },
          { label: "বিবরণ", width: 0.3 },
          { label: "খাত", width: 0.2 },
          moneyCol("আয়", 0.17),
        ],
        rows: running
          .filter(row => row.type === "income")
          .map((row, index) => [
            String(index + 1),
            printDate(row.occurredAt),
            row.voucherNo || "—",
            row.note?.trim() || "—",
            row.categoryName,
            Number(row.amount),
          ]),
        totals: [
          { label: "মোট আয়/আমানত", value: moneyBn(totalsData.income), tone: "grand" },
        ],
      };
    case "expense":
      return {
        columns: [
          { label: "ক্র.", width: 0.05, align: "center" },
          { label: "তারিখ", width: 0.15 },
          { label: "ভাউচার", width: 0.13 },
          { label: "বিবরণ", width: 0.3 },
          { label: "খাত", width: 0.2 },
          moneyCol("ব্যয়", 0.17),
        ],
        rows: running
          .filter(row => row.type === "expense")
          .map((row, index) => [
            String(index + 1),
            printDate(row.occurredAt),
            row.voucherNo || "—",
            row.note?.trim() || "—",
            row.categoryName,
            Number(row.amount),
          ]),
        totals: [
          { label: "মোট ব্যয়/খরচ", value: moneyBn(totalsData.expense), tone: "grand" },
        ],
      };
    case "category":
      return {
        columns: categoryColumns,
        rows: categoryPdfRows,
        totals: [
          {
            label: `মোট ${categoryRows.length}টি খাত`,
            value: moneyBn(categoryRows.reduce((sum, row) => sum + row.total, 0)),
            tone: "grand",
          },
        ],
      };
    case "cashbook":
      return {
        columns: cashbookColumns,
        rows: running.map(cashbookRow),
        totals: [
          { label: "উদ্বোধনী জের", value: moneyBn(totalsData.openingBalance) },
          { label: "মোট প্রাপ্তি", value: moneyBn(totalsData.income) },
          { label: "মোট প্রদান", value: moneyBn(totalsData.expense) },
          { label: "সমাপনী জের", value: moneyBn(totalsData.closingBalance), tone: "grand" },
        ],
      };
    case "ledger":
      return {
        columns: [
          { label: "ক্র.", width: 0.05, align: "center" },
          { label: "তারিখ", width: 0.13 },
          { label: "ভাউচার", width: 0.12 },
          { label: "বিবরণ", width: 0.26 },
          { label: "খাত", width: 0.16 },
          moneyCol("ডেবিট", 0.14),
          moneyCol("ক্রেডিট", 0.14),
        ],
        rows: running.map(row => [
          printDate(row.occurredAt),
          row.voucherNo || "—",
          row.note?.trim() || row.categoryName,
          row.categoryName,
          row.type === "income" ? Number(row.amount) : "—",
          row.type === "expense" ? Number(row.amount) : "—",
        ]),
        totals: [
          { label: "উদ্বোধনী জের", value: moneyBn(totalsData.openingBalance) },
          { label: "মোট ডেবিট", value: moneyBn(totalsData.income) },
          { label: "মোট ক্রেডিট", value: moneyBn(totalsData.expense) },
          { label: "জের", value: moneyBn(totalsData.closingBalance), tone: "grand" },
        ],
        subtitle: "প্রচলিত লেজার-শৈলীর খাতা",
      };
    case "yearly":
      return {
        columns: monthlyColumns,
        rows: monthlyPdfRows,
        totals: [
          { label: "মোট আয়/আমানত", value: moneyBn(totalsData.income) },
          { label: "মোট ব্যয়/খরচ", value: moneyBn(totalsData.expense) },
          { label: "নিট ব্যালেন্স", value: moneyBn(totalsData.netAmount), tone: "grand" },
        ],
        subtitle: "মাসিক/বার্ষিক সারসংক্ষেপ",
      };
    case "daily":
    case "range":
    case "project":
    case "firm":
    default:
      return {
        columns: detailedColumns,
        rows: running.map((row, index) => [String(index + 1), ...detailedRow(row)]),
        totals: [
          { label: "মোট আয়/আমানত", value: moneyBn(totalsData.income) },
          { label: "মোট ব্যয়/খরচ", value: moneyBn(totalsData.expense) },
          { label: "নিট পরিমাণ", value: moneyBn(totalsData.netAmount) },
          { label: "শেষ জের", value: moneyBn(totalsData.closingBalance), tone: "grand" },
        ],
      };
  }
}