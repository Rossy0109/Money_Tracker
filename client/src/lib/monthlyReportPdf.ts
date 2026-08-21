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
  doc.setFontSize(8);
  doc.setTextColor(94, 116, 105);
  doc.text("দ্রষ্টব্য: দেনা বা পাওনা নিষ্পত্তি আয় বা ব্যয়ের সঙ্গে যুক্ত করা হয়নি।", margin, 790);
  doc.save(`monthly-report-${report.monthKey}.pdf`);
}
