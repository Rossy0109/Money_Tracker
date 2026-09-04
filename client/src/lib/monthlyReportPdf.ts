import type { jsPDF } from "jspdf";
import {
  accountingReportOptions,
  type AccountingReportType,
} from "./accountingReportDefinitions";

export { accountingReportOptions, type AccountingReportType } from "./accountingReportDefinitions";

type MonthlyReport = {
  projectName: string;
  monthKey: string;
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  categoryTotals: Array<{ name: string; type: "income" | "expense"; total: number }>;
  totalDebt: number;
  totalReceivable: number;
  transactionCount: number;
  transactionDetails: Array<{
    occurredAt: Date;
    voucherNo: string;
    type: "income" | "expense";
    categoryName: string;
    description: string;
    amount: number;
  }>;
  previousMonthKey?: string;
  previousExpenseCategoryTotals?: Array<{ name: string; total: number }>;
  profitAndLoss?: { income: number; expense: number; profitOrLoss: number };
  financialPosition?: {
    accountBalance: number;
    receivables: number;
    assets: number;
    debts: number;
    netFinancialPosition: number;
  };
  accountDetails?: Array<{ name: string; type: string; currentBalance: number }>;
  dueDetails?: Array<{
    type: "debt" | "receivable";
    counterparty: string;
    voucherNo: string;
    openedAt: Date;
    description: string;
    originalAmount: number;
    outstandingAmount: number;
  }>;
};

const BENGALI_FONT_URL = "/fonts/NotoSansBengali-Regular.ttf";
const bdt = (value: number) =>
  `৳ ${new Intl.NumberFormat("bn-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}`;
const monthText = (monthKey: string) =>
  new Intl.DateTimeFormat("bn-BD", { month: "long", year: "numeric" }).format(
    new Date(`${monthKey}-01T12:00:00Z`)
  );

async function addBengaliFont(doc: jsPDF) {
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

function reportDefinition(reportType: AccountingReportType) {
  return accountingReportOptions.find(option => option.value === reportType) ?? accountingReportOptions[0];
}

async function buildAccountingReportPdf(
  report: MonthlyReport,
  reportType: AccountingReportType
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  await addBengaliFont(doc);

  const definition = reportDefinition(reportType);
  const pageWidth = 595;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const isFull = reportType === "full";
  const isProfitAndLoss = reportType === "profit-loss";
  const isIncome = reportType === "income";
  const isExpense = reportType === "expense";
  const isDebt = reportType === "debt";
  const isReceivable = reportType === "receivable";
  const isFinancialPosition = reportType === "financial-position";
  const addSectionHeading = (text: string, y: number) => {
    doc.setFillColor(237, 245, 238);
    doc.rect(margin, y - 16, contentWidth, 26, "F");
    doc.setTextColor(22, 60, 50);
    doc.setFontSize(11);
    doc.text(text, margin + 10, y + 1);
    doc.setTextColor(20, 36, 30);
  };
  const addValueRow = (
    label: string,
    value: string,
    y: number,
    tone: [number, number, number] = [20, 36, 30]
  ) => {
    doc.setFontSize(10);
    doc.setTextColor(76, 98, 88);
    doc.text(label, margin + 12, y);
    doc.setTextColor(...tone);
    doc.text(value, pageWidth - margin - 12, y, { align: "right" });
    doc.setDrawColor(222, 232, 224);
    doc.line(margin, y + 9, pageWidth - margin, y + 9);
    doc.setTextColor(20, 36, 30);
  };
  const ensureSpace = (y: number, required: number) => {
    if (y + required <= 748) return y;
    doc.addPage();
    return 52;
  };

  doc.setFontSize(19);
  doc.setTextColor(22, 60, 50);
  doc.text(definition.title, margin, 50);
  doc.setFontSize(10);
  doc.setTextColor(83, 110, 98);
  doc.text(`প্রজেক্ট: ${report.projectName}`, margin, 71);
  doc.text(`মাস: ${monthText(report.monthKey)}`, margin, 87);
  doc.text(
    `তৈরির তারিখ: ${new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" }).format(new Date())}`,
    margin,
    103
  );

  let y = 135;
  const profitAndLoss = report.profitAndLoss ?? {
    income: report.totalIncome,
    expense: report.totalExpense,
    profitOrLoss: report.netAmount,
  };
  const financialPosition = report.financialPosition ?? {
    accountBalance: 0,
    receivables: report.totalReceivable,
    assets: report.totalReceivable,
    debts: report.totalDebt,
    netFinancialPosition: report.totalReceivable - report.totalDebt,
  };

  const renderProfitAndLoss = () => {
    addSectionHeading(isProfitAndLoss ? "লাভ ও ক্ষতির সারসংক্ষেপ" : "মাসের সারসংক্ষেপ", y);
    y += 31;
    addValueRow("মোট আয়", bdt(profitAndLoss.income), y, [34, 110, 73]);
    y += 29;
    addValueRow("মোট ব্যয়", bdt(profitAndLoss.expense), y, [157, 51, 51]);
    y += 29;
    addValueRow(
      profitAndLoss.profitOrLoss >= 0 ? "নিট লাভ" : "নিট ক্ষতি",
      bdt(Math.abs(profitAndLoss.profitOrLoss)),
      y,
      profitAndLoss.profitOrLoss >= 0 ? [34, 110, 73] : [157, 51, 51]
    );
    if (isFull) {
      y += 29;
      addValueRow("মাসের লেনদেন", new Intl.NumberFormat("bn-BD").format(report.transactionCount), y);
    }
    y += 47;
  };
  const renderCategoryTotals = (type?: "income" | "expense") => {
    y = ensureSpace(y, 65);
    const categories = type
      ? report.categoryTotals.filter(category => category.type === type)
      : report.categoryTotals;
    addSectionHeading(
      type === "income"
        ? "ক্যাটাগরিভিত্তিক আয়"
        : type === "expense"
          ? "ক্যাটাগরিভিত্তিক ব্যয়"
          : "ক্যাটাগরিভিত্তিক আয় ও ব্যয়",
      y
    );
    y += 30;
    if (!categories.length) {
      doc.setFontSize(10);
      doc.setTextColor(83, 110, 98);
      doc.text("নির্বাচিত মাসে কোনো লেনদেন নেই।", margin + 12, y);
      doc.setTextColor(20, 36, 30);
      y += 30;
      return;
    }
    for (const category of categories) {
      y = ensureSpace(y, 30);
      const typeLabel = category.type === "income" ? "আয়" : "ব্যয়";
      addValueRow(
        `${category.name} (${typeLabel})`,
        bdt(category.total),
        y,
        category.type === "income" ? [34, 110, 73] : [157, 51, 51]
      );
      y += 29;
    }
    y += 19;
  };
  const renderFinancialPosition = () => {
    y = ensureSpace(y, 170);
    addSectionHeading("আর্থিক অবস্থান", y);
    y += 31;
    addValueRow("অ্যাকাউন্টে বর্তমান ব্যালেন্স", bdt(financialPosition.accountBalance), y, [34, 110, 73]);
    y += 29;
    addValueRow("মোট পাওনা", bdt(financialPosition.receivables), y, [34, 110, 73]);
    y += 29;
    addValueRow("মোট সম্পদ", bdt(financialPosition.assets), y, [34, 110, 73]);
    y += 29;
    addValueRow("মোট দেনা", bdt(financialPosition.debts), y, [157, 51, 51]);
    y += 29;
    addValueRow(
      "নিট আর্থিক অবস্থান",
      bdt(financialPosition.netFinancialPosition),
      y,
      financialPosition.netFinancialPosition >= 0 ? [34, 110, 73] : [157, 51, 51]
    );
    y += 47;
    const accounts = report.accountDetails ?? [];
    y = ensureSpace(y, 55);
    addSectionHeading("অ্যাকাউন্টভিত্তিক ব্যালেন্স", y);
    y += 30;
    if (!accounts.length) {
      doc.setFontSize(10);
      doc.setTextColor(83, 110, 98);
      doc.text("নির্বাচিত প্রজেক্টে কোনো অ্যাকাউন্ট নেই।", margin + 12, y);
      doc.setTextColor(20, 36, 30);
      y += 30;
      return;
    }
    for (const account of accounts) {
      y = ensureSpace(y, 30);
      addValueRow(account.name, bdt(account.currentBalance), y, account.currentBalance >= 0 ? [34, 110, 73] : [157, 51, 51]);
      y += 29;
    }
    y += 19;
  };
  const renderDueSection = (type: "debt" | "receivable") => {
    const isDebtReport = type === "debt";
    const rows = (report.dueDetails ?? []).filter(due => due.type === type);
    const total = isDebtReport ? report.totalDebt : report.totalReceivable;
    y = ensureSpace(y, 75);
    addSectionHeading(isDebtReport ? "বর্তমান দেনার হিসাব" : "বর্তমান পাওনার হিসাব", y);
    y += 31;
    addValueRow(isDebtReport ? "মোট বকেয়া দেনা" : "মোট বকেয়া পাওনা", bdt(total), y, isDebtReport ? [157, 51, 51] : [34, 110, 73]);
    y += 46;
    y = ensureSpace(y, 55);
    addSectionHeading(isDebtReport ? "দেনাদারভিত্তিক বিস্তারিত" : "পাওনাদারভিত্তিক বিস্তারিত", y);
    y += 30;
    if (!rows.length) {
      doc.setFontSize(10);
      doc.setTextColor(83, 110, 98);
      doc.text(isDebtReport ? "কোনো বকেয়া দেনা নেই।" : "কোনো বকেয়া পাওনা নেই।", margin + 12, y);
      doc.setTextColor(20, 36, 30);
      y += 30;
      return;
    }
    for (const due of rows) {
      y = ensureSpace(y, 52);
      doc.setFillColor(isDebtReport ? 254 : 240, isDebtReport ? 242 : 250, isDebtReport ? 242 : 244);
      doc.rect(margin, y - 16, contentWidth, 42, "F");
      doc.setFontSize(9);
      doc.setTextColor(20, 36, 30);
      doc.text(due.counterparty, margin + 10, y);
      doc.setTextColor(76, 98, 88);
      doc.setFontSize(8);
      doc.text(`${due.voucherNo} | ${new Intl.DateTimeFormat("bn-BD", { year: "numeric", month: "short", day: "numeric" }).format(new Date(due.openedAt))}`, margin + 10, y + 15);
      const dueTone: [number, number, number] = isDebtReport ? [157, 51, 51] : [34, 110, 73];
      doc.setTextColor(...dueTone);
      doc.text(`বকেয়া: ${bdt(due.outstandingAmount)}`, pageWidth - margin - 10, y, { align: "right" });
      doc.setTextColor(20, 36, 30);
      y += 55;
    }
    y += 10;
  };
  const addTransactionHeading = (heading: string) => {
    addSectionHeading(heading, y);
    y += 30;
    doc.setFillColor(244, 248, 245);
    doc.rect(margin, y - 14, contentWidth, 21, "F");
    doc.setFontSize(7);
    doc.setTextColor(76, 98, 88);
    doc.text("তারিখ", margin + 5, y);
    doc.text("ভাউচার", margin + 64, y);
    doc.text("বিবরণ", margin + 126, y);
    doc.text("পরিমাণ", pageWidth - margin - 5, y, { align: "right" });
    doc.setTextColor(20, 36, 30);
    y += 21;
  };
  const dateFormatter = new Intl.DateTimeFormat("bn-BD", { year: "numeric", month: "2-digit", day: "2-digit" });
  const renderTransactionSection = (
    type: "income" | "expense",
    heading: string,
    emptyMessage: string,
    amountTone: [number, number, number]
  ) => {
    const transactions = report.transactionDetails.filter(transaction => transaction.type === type);
    y = ensureSpace(y, 55);
    addTransactionHeading(heading);
    if (!transactions.length) {
      doc.setFontSize(10);
      doc.setTextColor(83, 110, 98);
      doc.text(emptyMessage, margin + 12, y);
      doc.setTextColor(20, 36, 30);
      y += 28;
      return;
    }
    const categoryGroups = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const group = categoryGroups.get(transaction.categoryName) ?? [];
      group.push(transaction);
      categoryGroups.set(transaction.categoryName, group);
    }
    const sectionTotal = type === "income" ? report.totalIncome : report.totalExpense;
    const percentageFormatter = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 1 });
    const categoryEntries = Array.from(categoryGroups.entries()).map(([categoryName, categoryTransactions]) => ({
      categoryName,
      categoryTransactions,
      subtotal: categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    }));
    const getRowHeight = (transaction: typeof transactions[number]) =>
      Math.max(30, doc.splitTextToSize(transaction.description, 320).length * 10 + 12);
    const addCategorySubheading = (
      categoryName: string,
      transactionCount: number,
      subtotal: number,
      isContinuation = false
    ) => {
      doc.setFillColor(type === "income" ? 232 : 252, type === "income" ? 246 : 237, type === "income" ? 237 : 237);
      doc.rect(margin, y - 14, contentWidth, 21, "F");
      doc.setFontSize(8);
      doc.setTextColor(...amountTone);
      doc.text(`ক্যাটাগরি: ${categoryName}${isContinuation ? " (চলমান)" : ""}`, margin + 8, y);
      doc.setTextColor(76, 98, 88);
      const percentage = sectionTotal > 0 ? (subtotal / sectionTotal) * 100 : 0;
      doc.text(
        `${new Intl.NumberFormat("bn-BD").format(transactionCount)} টি লেনদেন | উপমোট: ${bdt(subtotal)} | অংশ: ${percentageFormatter.format(percentage)}%`,
        pageWidth - margin - 8,
        y,
        { align: "right" }
      );
      doc.setTextColor(20, 36, 30);
      y += 22;
    };
    if (type === "expense") {
      const previousTotals = new Map((report.previousExpenseCategoryTotals ?? []).map(category => [category.name, category.total]));
      const topExpenses = [...categoryEntries]
        .sort((left, right) => right.subtotal - left.subtotal || left.categoryName.localeCompare(right.categoryName, "bn"))
        .slice(0, 3);
      if (topExpenses.length) {
        const summaryHeight = 27 + topExpenses.length * 39;
        y = ensureSpace(y, summaryHeight + 8);
        doc.setFillColor(254, 242, 242);
        doc.rect(margin, y - 14, contentWidth, summaryHeight, "F");
        doc.setFontSize(9);
        doc.setTextColor(157, 51, 51);
        doc.text("শীর্ষ ব্যয়", margin + 8, y);
        y += 19;
        for (const [index, expense] of Array.from(topExpenses.entries())) {
          const percentage = sectionTotal > 0 ? (expense.subtotal / sectionTotal) * 100 : 0;
          const previousTotal = previousTotals.get(expense.categoryName) ?? 0;
          const change = expense.subtotal - previousTotal;
          const changeText = change === 0 ? "অপরিবর্তিত" : change > 0 ? `বেড়েছে ${bdt(change)}` : `কমেছে ${bdt(Math.abs(change))}`;
          doc.setFontSize(8);
          doc.setTextColor(97, 45, 45);
          doc.text(`${index + 1}. ${expense.categoryName}`, margin + 12, y);
          doc.setTextColor(157, 51, 51);
          doc.text(`${bdt(expense.subtotal)} | ${percentageFormatter.format(percentage)}%`, pageWidth - margin - 8, y, { align: "right" });
          y += 13;
          doc.setFontSize(7);
          doc.setTextColor(112, 76, 76);
          doc.text(
            `গত মাস (${report.previousMonthKey ? monthText(report.previousMonthKey) : "—"}): ${bdt(previousTotal)} | ${changeText}`,
            margin + 16,
            y
          );
          y += 26;
        }
        doc.setTextColor(20, 36, 30);
        y += 5;
      }
    }
    for (const { categoryName, categoryTransactions, subtotal } of categoryEntries) {
      if (y + 22 + getRowHeight(categoryTransactions[0]) > 748) {
        doc.addPage();
        y = 52;
        addTransactionHeading(`${heading} (চলমান)`);
      }
      addCategorySubheading(categoryName, categoryTransactions.length, subtotal);
      for (const transaction of categoryTransactions) {
        const descriptionLines = doc.splitTextToSize(transaction.description, 320);
        const rowHeight = Math.max(30, descriptionLines.length * 10 + 12);
        if (y + rowHeight > 748) {
          doc.addPage();
          y = 52;
          addTransactionHeading(`${heading} (চলমান)`);
          addCategorySubheading(categoryName, categoryTransactions.length, subtotal, true);
        }
        doc.setFontSize(7.5);
        doc.setTextColor(52, 76, 66);
        doc.text(dateFormatter.format(new Date(transaction.occurredAt)), margin + 5, y);
        doc.text(transaction.voucherNo, margin + 64, y);
        doc.text(descriptionLines, margin + 126, y);
        doc.setTextColor(...amountTone);
        doc.text(bdt(transaction.amount), pageWidth - margin - 5, y, { align: "right" });
        doc.setDrawColor(222, 232, 224);
        doc.line(margin, y + rowHeight - 8, pageWidth - margin, y + rowHeight - 8);
        doc.setTextColor(20, 36, 30);
        y += rowHeight;
      }
    }
  };

  if (isFull || isProfitAndLoss) {
    renderProfitAndLoss();
    renderCategoryTotals();
  }
  if (isIncome) {
    addSectionHeading("আয়ের সারসংক্ষেপ", y);
    y += 31;
    addValueRow("মোট আয়", bdt(report.totalIncome), y, [34, 110, 73]);
    y += 47;
    renderCategoryTotals("income");
  }
  if (isExpense) {
    addSectionHeading("ব্যয়ের সারসংক্ষেপ", y);
    y += 31;
    addValueRow("মোট ব্যয়", bdt(report.totalExpense), y, [157, 51, 51]);
    y += 47;
    renderCategoryTotals("expense");
  }
  if (isFull || isFinancialPosition) renderFinancialPosition();
  if (isFull || isDebt) renderDueSection("debt");
  if (isFull || isReceivable) renderDueSection("receivable");
  if (isFull || isIncome) {
    renderTransactionSection("income", "আয়ের বিস্তারিত লেনদেন", "নির্বাচিত মাসে কোনো আয়ের লেনদেন নেই।", [34, 110, 73]);
  }
  if (isFull || isExpense) {
    renderTransactionSection("expense", "ব্যয়ের বিস্তারিত লেনদেন", "নির্বাচিত মাসে কোনো ব্যয়ের লেনদেন নেই।", [157, 51, 51]);
  }
  if (isFull || isProfitAndLoss) {
    y = ensureSpace(y, 30);
    doc.setFontSize(8);
    doc.setTextColor(94, 116, 105);
    doc.text("দ্রষ্টব্য: দেনা বা পাওনা নিষ্পত্তি আয় বা ব্যয়ের সঙ্গে যুক্ত করা হয়নি।", margin, y + 12);
    y += 18;
  }

  // Official Signature Block
  y = ensureSpace(y, 75);
  y += 40;
  const colWidth = (contentWidth - 40) / 3;

  // Column 1: Prepared By
  const col1X = margin;
  doc.setDrawColor(180, 195, 185);
  doc.line(col1X, y, col1X + colWidth, y);
  doc.setFontSize(8.5);
  doc.setTextColor(52, 76, 66);
  doc.text("প্রস্তুতকারকের স্বাক্ষর", col1X + colWidth / 2, y + 11, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(110, 130, 120);
  doc.text("(Prepared By)", col1X + colWidth / 2, y + 21, { align: "center" });

  // Column 2: Checked By
  const col2X = margin + colWidth + 20;
  doc.setDrawColor(180, 195, 185);
  doc.line(col2X, y, col2X + colWidth, y);
  doc.setFontSize(8.5);
  doc.setTextColor(52, 76, 66);
  doc.text("যাচাইকারীর স্বাক্ষর", col2X + colWidth / 2, y + 11, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(110, 130, 120);
  doc.text("(Checked / Accountant)", col2X + colWidth / 2, y + 21, { align: "center" });

  // Column 3: Authorized Signature & Seal
  const col3X = margin + (colWidth + 20) * 2;
  doc.setDrawColor(180, 195, 185);
  doc.line(col3X, y, col3X + colWidth, y);
  doc.setFontSize(8.5);
  doc.setTextColor(52, 76, 66);
  doc.text("অনুমোদিত কর্মকর্তার স্বাক্ষর ও সিল", col3X + colWidth / 2, y + 11, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(110, 130, 120);
  doc.text("(Authorized Signature & Seal)", col3X + colWidth / 2, y + 21, { align: "center" });

  return { doc, definition };
}

export async function downloadMonthlyReportPdf(
  report: MonthlyReport,
  reportType: AccountingReportType = "full"
) {
  const { doc, definition } = await buildAccountingReportPdf(report, reportType);
  doc.save(`${definition.filename}-${report.monthKey}.pdf`);
}

export async function shareMonthlyReportPdf(
  report: MonthlyReport,
  reportType: AccountingReportType = "full"
): Promise<"shared" | "unavailable"> {
  if (!navigator.share) return "unavailable";
  const { doc, definition } = await buildAccountingReportPdf(report, reportType);
  const filename = `${definition.filename}-${report.monthKey}.pdf`;
  const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return "unavailable";
  await navigator.share({
    title: definition.title,
    text: `${definition.title} — ${report.projectName} — ${monthText(report.monthKey)}`,
    files: [file],
  });
  return "shared";
}
