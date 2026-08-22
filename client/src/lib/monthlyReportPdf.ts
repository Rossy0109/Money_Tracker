import type { jsPDF } from "jspdf";

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
};

const BENGALI_FONT_URL = "/manus-storage/NotoSansBengali-Regular_ca0a97c7.ttf";
const bdt = (value: number) => `৳ ${new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}`;
const monthText = (monthKey: string) => new Intl.DateTimeFormat("bn-BD", { month: "long", year: "numeric" }).format(new Date(`${monthKey}-01T12:00:00Z`));

async function addBengaliFont(doc: jsPDF) {
  const response = await window.fetch(BENGALI_FONT_URL);
  if (!response.ok) throw new Error("PDF ফন্ট লোড করা যায়নি");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  doc.addFileToVFS("NotoSansBengali-Regular.ttf", btoa(binary));
  doc.addFont("NotoSansBengali-Regular.ttf", "NotoSansBengali", "normal");
  doc.setFont("NotoSansBengali", "normal");
}

export async function downloadMonthlyReportPdf(report: MonthlyReport) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  await addBengaliFont(doc);
  const pageWidth = 595;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const addSectionHeading = (text: string, y: number) => {
    doc.setFillColor(237, 245, 238);
    doc.rect(margin, y - 16, contentWidth, 26, "F");
    doc.setTextColor(22, 60, 50);
    doc.setFontSize(11);
    doc.text(text, margin + 10, y + 1);
    doc.setTextColor(20, 36, 30);
  };
  const addValueRow = (label: string, value: string, y: number, tone: [number, number, number] = [20, 36, 30]) => {
    doc.setFontSize(10);
    doc.setTextColor(76, 98, 88);
    doc.text(label, margin + 12, y);
    doc.setTextColor(...tone);
    doc.text(value, pageWidth - margin - 12, y, { align: "right" });
    doc.setDrawColor(222, 232, 224);
    doc.line(margin, y + 9, pageWidth - margin, y + 9);
    doc.setTextColor(20, 36, 30);
  };

  doc.setFontSize(19);
  doc.setTextColor(22, 60, 50);
  doc.text("মাসিক আর্থিক রিপোর্ট", margin, 50);
  doc.setFontSize(10);
  doc.setTextColor(83, 110, 98);
  doc.text(`প্রজেক্ট: ${report.projectName}`, margin, 71);
  doc.text(`মাস: ${monthText(report.monthKey)}`, margin, 87);
  doc.text(`তৈরির তারিখ: ${new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" }).format(new Date())}`, margin, 103);

  let y = 135;
  addSectionHeading("মাসের সারসংক্ষেপ", y);
  y += 31;
  addValueRow("মোট আয়", bdt(report.totalIncome), y, [34, 110, 73]);
  y += 29;
  addValueRow("মোট ব্যয়", bdt(report.totalExpense), y, [157, 51, 51]);
  y += 29;
  addValueRow("নিট পরিমাণ", bdt(report.netAmount), y, report.netAmount >= 0 ? [34, 110, 73] : [157, 51, 51]);
  y += 29;
  addValueRow("মাসের লেনদেন", new Intl.NumberFormat("bn-BD").format(report.transactionCount), y);
  y += 47;

  addSectionHeading("ক্যাটাগরিভিত্তিক আয় ও ব্যয়", y);
  y += 30;
  if (!report.categoryTotals.length) {
    doc.setFontSize(10);
    doc.setTextColor(83, 110, 98);
    doc.text("নির্বাচিত মাসে কোনো লেনদেন নেই।", margin + 12, y);
    y += 30;
  } else {
    for (const category of report.categoryTotals) {
      if (y > 724) {
        doc.addPage();
        y = 52;
        addSectionHeading("ক্যাটাগরিভিত্তিক আয় ও ব্যয় (চলমান)", y);
        y += 31;
      }
      const typeLabel = category.type === "income" ? "আয়" : "ব্যয়";
      addValueRow(`${category.name} (${typeLabel})`, bdt(category.total), y, category.type === "income" ? [34, 110, 73] : [157, 51, 51]);
      y += 29;
    }
  }
  y += 19;
  if (y > 690) {
    doc.addPage();
    y = 52;
  }
  addSectionHeading("বর্তমান দেনা ও পাওনা", y);
  y += 31;
  addValueRow("মোট বকেয়া দেনা", bdt(report.totalDebt), y, [157, 51, 51]);
  y += 29;
  addValueRow("মোট বকেয়া পাওনা", bdt(report.totalReceivable), y, [34, 110, 73]);
  y += 48;
  if (y > 650) {
    doc.addPage();
    y = 52;
  }
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
  const renderTransactionSection = (type: "income" | "expense", heading: string, emptyMessage: string, amountTone: [number, number, number]) => {
    const transactions = report.transactionDetails.filter(transaction => transaction.type === type);
    if (y > 650) {
      doc.addPage();
      y = 52;
    }
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
    const getRowHeight = (transaction: typeof transactions[number]) => Math.max(30, doc.splitTextToSize(transaction.description, 320).length * 10 + 12);
    const addCategorySubheading = (categoryName: string, transactionCount: number, subtotal: number, isContinuation = false) => {
      doc.setFillColor(type === "income" ? 232 : 252, type === "income" ? 246 : 237, type === "income" ? 237 : 237);
      doc.rect(margin, y - 14, contentWidth, 21, "F");
      doc.setFontSize(8);
      doc.setTextColor(...amountTone);
      doc.text(`ক্যাটাগরি: ${categoryName}${isContinuation ? " (চলমান)" : ""}`, margin + 8, y);
      doc.setTextColor(76, 98, 88);
      const percentage = sectionTotal > 0 ? (subtotal / sectionTotal) * 100 : 0;
      doc.text(`${new Intl.NumberFormat("bn-BD").format(transactionCount)} টি লেনদেন | উপমোট: ${bdt(subtotal)} | অংশ: ${percentageFormatter.format(percentage)}%`, pageWidth - margin - 8, y, { align: "right" });
      doc.setTextColor(20, 36, 30);
      y += 22;
    };
    for (const [categoryName, categoryTransactions] of Array.from(categoryGroups.entries())) {
      const subtotal = categoryTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
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
  renderTransactionSection("income", "আয়ের বিস্তারিত লেনদেন", "নির্বাচিত মাসে কোনো আয়ের লেনদেন নেই।", [34, 110, 73]);
  renderTransactionSection("expense", "ব্যয়ের বিস্তারিত লেনদেন", "নির্বাচিত মাসে কোনো ব্যয়ের লেনদেন নেই।", [157, 51, 51]);
  doc.setFontSize(8);
  doc.setTextColor(94, 116, 105);
  doc.text("দ্রষ্টব্য: দেনা বা পাওনা নিষ্পত্তি আয় বা ব্যয়ের সঙ্গে যুক্ত করা হয়নি।", margin, 790);
  doc.save(`monthly-report-${report.monthKey}.pdf`);
}
