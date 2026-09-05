import type { jsPDF } from "jspdf";

export interface PayslipData {
  voucherNo?: string | null;
  monthKey: string; // YYYY-MM
  paymentDate?: string | Date | null;
  employeeName: string;
  employeeDesignation?: string | null;
  employeeDepartment?: string | null;
  employeePhone?: string | null;
  baseSalary: string | number;
  bonusAmount?: string | number;
  allowanceAmount?: string | number;
  advanceDeduction?: string | number;
  otherDeduction?: string | number;
  netPayable: string | number;
  paidAmount?: string | number;
  status: string;
  paymentMethod?: string | null;
  notes?: string | null;
}

const bdt = (val?: number | string | null) =>
  `BDT ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generatePayslipPdf(data: PayslipData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // Header Background
  doc.setFillColor(20, 56, 47); // #14382f
  doc.rect(0, 0, pageWidth, 28, "F");

  // App / Brand Title in Header
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Ahmed's Financial Accounting", margin, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(185, 210, 194);
  doc.text("Official Employee Salary Disbursal Voucher", margin, 18);
  doc.text(`Salary Month: ${data.monthKey} | Disbursed: ${data.paymentDate ? new Date(data.paymentDate).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")}`, margin, 23);

  // Top Right "PAYSLIP"
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SALARY PAYSLIP", pageWidth - margin, 14, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 240, 230);
  doc.text(`Voucher: ${data.voucherNo || "N/A"}`, pageWidth - margin, 21, { align: "right" });

  y = 36;

  // Employee Information Box
  doc.setFillColor(245, 248, 246);
  doc.setDrawColor(215, 230, 222);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 3, 3, "FD");

  doc.setTextColor(20, 56, 47);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("EMPLOYEE DETAILS", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 70, 60);

  // Left Column
  doc.text(`Name: ${data.employeeName}`, margin + 4, y + 13);
  doc.text(`Designation: ${data.employeeDesignation || "Staff"}`, margin + 4, y + 19);
  doc.text(`Department: ${data.employeeDepartment || "General"}`, margin + 4, y + 24);

  // Right Column
  const rightColX = pageWidth / 2 + 5;
  doc.text(`Phone: ${data.employeePhone || "N/A"}`, rightColX, y + 13);
  doc.text(`Payment Status: ${data.status.toUpperCase()}`, rightColX, y + 19);
  doc.text(`Payment Method: ${(data.paymentMethod || "Cash").toUpperCase()}`, rightColX, y + 24);

  y += 34;

  // Earnings & Deductions Table
  doc.setFillColor(235, 242, 238);
  doc.rect(margin, y, pageWidth - margin * 2, 7, "F");

  doc.setTextColor(20, 56, 47);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EARNINGS & ALLOWANCES", margin + 4, y + 5);
  doc.text("AMOUNT", pageWidth / 2 - 10, y + 5, { align: "right" });

  doc.text("DEDUCTIONS", pageWidth / 2 + 5, y + 5);
  doc.text("AMOUNT", pageWidth - margin - 4, y + 5, { align: "right" });

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);

  // Row 1: Basic Salary vs Advance Deduction
  doc.text("Basic Salary (Mool Betan)", margin + 4, y);
  doc.text(bdt(data.baseSalary), pageWidth / 2 - 10, y, { align: "right" });

  doc.text("Advance Salary Deduction", pageWidth / 2 + 5, y);
  doc.text(bdt(data.advanceDeduction || 0), pageWidth - margin - 4, y, { align: "right" });

  y += 7;

  // Row 2: Bonus vs Other Deductions
  doc.text("Performance / Festive Bonus", margin + 4, y);
  doc.text(bdt(data.bonusAmount || 0), pageWidth / 2 - 10, y, { align: "right" });

  doc.text("Other Deductions / Fines", pageWidth / 2 + 5, y);
  doc.text(bdt(data.otherDeduction || 0), pageWidth - margin - 4, y, { align: "right" });

  y += 7;

  // Row 3: Allowance
  doc.text("Medical & Travel Allowance", margin + 4, y);
  doc.text(bdt(data.allowanceAmount || 0), pageWidth / 2 - 10, y, { align: "right" });

  y += 5;
  doc.setDrawColor(220, 230, 225);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;

  // Calculation Summary Box
  const totalEarnings = Number(data.baseSalary || 0) + Number(data.bonusAmount || 0) + Number(data.allowanceAmount || 0);
  const totalDeductions = Number(data.advanceDeduction || 0) + Number(data.otherDeduction || 0);
  const netPayable = Number(data.netPayable || totalEarnings - totalDeductions);
  const paidAmount = Number(data.paidAmount || netPayable);

  const summaryX = pageWidth / 2 + 10;
  const summaryWidth = pageWidth / 2 - margin - 10;

  doc.setFillColor(245, 248, 246);
  doc.roundedRect(summaryX, y, summaryWidth, 38, 2, 2, "FD");

  let sumY = y + 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Gross Earnings:", summaryX + 4, sumY);
  doc.text(bdt(totalEarnings), pageWidth - margin - 4, sumY, { align: "right" });

  sumY += 6;
  doc.text("Total Deductions:", summaryX + 4, sumY);
  doc.text(`- ${bdt(totalDeductions)}`, pageWidth - margin - 4, sumY, { align: "right" });

  sumY += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 56, 47);
  doc.text("Net Payable Salary:", summaryX + 4, sumY);
  doc.text(bdt(netPayable), pageWidth - margin - 4, sumY, { align: "right" });

  sumY += 7;
  doc.setFontSize(10);
  doc.setTextColor(18, 100, 50);
  doc.text("Paid Amount (Nogod):", summaryX + 4, sumY);
  doc.text(bdt(paidAmount), pageWidth - margin - 4, sumY, { align: "right" });

  y += 48;

  // Notes if any
  if (data.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 110, 105);
    doc.text(`Notes: ${data.notes}`, margin, y);
    y += 10;
  }

  // Official 3-Column Signatures
  const sigY = 245;
  const colWidth = (pageWidth - margin * 2) / 3;

  doc.setDrawColor(180, 195, 185);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 75, 70);

  // Column 1: Prepared By
  doc.line(margin + 5, sigY, margin + colWidth - 5, sigY);
  doc.text("Prepared By", margin + colWidth / 2, sigY + 5, { align: "center" });

  // Column 2: Employee Signature
  doc.line(margin + colWidth + 5, sigY, margin + colWidth * 2 - 5, sigY);
  doc.text("Employee Signature", margin + colWidth * 1.5, sigY + 5, { align: "center" });

  // Column 3: Authorized Signature
  doc.line(margin + colWidth * 2 + 5, sigY, pageWidth - margin - 5, sigY);
  doc.text("Authorized Signature", margin + colWidth * 2.5, sigY + 5, { align: "center" });

  // Bottom Footer
  doc.setFontSize(7.5);
  doc.setTextColor(140, 150, 145);
  doc.text(
    "This is an official computer-generated payslip from Ahmed's Financial Accounting. Confidential.",
    pageWidth / 2,
    280,
    { align: "center" }
  );

  const cleanName = data.employeeName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Payslip_${cleanName}_${data.monthKey}.pdf`);
}
