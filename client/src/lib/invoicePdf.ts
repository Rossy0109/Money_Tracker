import { jsPDF } from "jspdf";

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string | Date;
  dueDate: string | Date;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientBinTin?: string | null;
  subtotal: string | number;
  discountAmount?: string | number;
  vatAmount?: string | number;
  grandTotal: string | number;
  paidAmount?: string | number;
  status: string;
  notesTerms?: string | null;
  items: Array<{
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    vatRate?: string | number;
    total: string | number;
  }>;
}

const bdt = (val?: number | string | null) =>
  `৳ ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generateInvoicePdf(invoice: InvoiceData): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 18;

  // Header Background Bar
  doc.setFillColor(17, 58, 48); // Brand deep green (#113a30)
  doc.rect(0, 0, pageWidth, 28, "F");

  // App / Brand Title in Header
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Ahmed's Financial Accounting", margin, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(185, 210, 194);
  doc.text("Professional Accounting & Financial Management", margin, 18);
  doc.text("Email: support@ahmedfinance.com | Phone: +880 1700-000000", margin, 23);

  // Top Right "INVOICE / চালান" badge
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("INVOICE", pageWidth - margin, 14, { align: "right" });

  doc.setFontSize(10);
  doc.setTextColor(216, 242, 221);
  doc.text(`#${invoice.invoiceNumber}`, pageWidth - margin, 22, { align: "right" });

  y = 38;

  // Status Badge
  const statusLabel = invoice.status.toUpperCase();
  let statusBg = [230, 244, 234];
  let statusColor = [22, 101, 52];

  if (invoice.status === "unpaid") {
    statusBg = [254, 243, 199];
    statusColor = [180, 83, 9];
  } else if (invoice.status === "overdue") {
    statusBg = [254, 226, 226];
    statusColor = [185, 28, 28];
  } else if (invoice.status === "paid") {
    statusBg = [220, 252, 231];
    statusColor = [21, 128, 61];
  }

  doc.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
  doc.roundedRect(pageWidth - margin - 35, y - 4, 35, 8, 2, 2, "F");
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(statusLabel, pageWidth - margin - 17.5, y + 1.5, { align: "center" });

  // Bill To / Client Information
  doc.setTextColor(20, 56, 47);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("BILL TO (গ্রাহক):", margin, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text(invoice.clientName, margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);

  if (invoice.clientPhone) {
    y += 5;
    doc.text(`Phone: ${invoice.clientPhone}`, margin, y);
  }
  if (invoice.clientEmail) {
    y += 5;
    doc.text(`Email: ${invoice.clientEmail}`, margin, y);
  }
  if (invoice.clientBinTin) {
    y += 5;
    doc.text(`BIN / TIN: ${invoice.clientBinTin}`, margin, y);
  }
  if (invoice.clientAddress) {
    y += 5;
    doc.text(`Address: ${invoice.clientAddress}`, margin, y);
  }

  // Dates on right
  const issueDateStr = new Date(invoice.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const dueDateStr = new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  doc.setTextColor(55, 65, 81);
  doc.text(`Issue Date: ${issueDateStr}`, pageWidth - margin, y - 10, { align: "right" });
  doc.text(`Due Date: ${dueDateStr}`, pageWidth - margin, y - 5, { align: "right" });

  y += 12;

  // Table Header
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, pageWidth - (margin * 2), 8, "F");

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SL", margin + 3, y + 5.5);
  doc.text("Description", margin + 14, y + 5.5);
  doc.text("Qty", margin + 95, y + 5.5, { align: "right" });
  doc.text("Unit Price", margin + 125, y + 5.5, { align: "right" });
  doc.text("VAT %", margin + 145, y + 5.5, { align: "right" });
  doc.text("Total Amount", pageWidth - margin - 3, y + 5.5, { align: "right" });

  y += 8;

  // Table Body Rows
  doc.setFont("helvetica", "normal");
  invoice.items.forEach((item, index) => {
    const rowY = y + (index * 7);

    // alternate row background
    if (index % 2 === 1) {
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, rowY, pageWidth - (margin * 2), 7, "F");
    }

    doc.setTextColor(55, 65, 81);
    doc.text(String(index + 1), margin + 3, rowY + 5);
    doc.text(item.description, margin + 14, rowY + 5);
    doc.text(Number(item.quantity).toFixed(0), margin + 95, rowY + 5, { align: "right" });
    doc.text(bdt(item.unitPrice), margin + 125, rowY + 5, { align: "right" });
    doc.text(`${Number(item.vatRate || 0)}%`, margin + 145, rowY + 5, { align: "right" });
    doc.text(bdt(item.total), pageWidth - margin - 3, rowY + 5, { align: "right" });
  });

  y += invoice.items.length * 7 + 6;

  // Divider Line
  doc.setDrawColor(229, 231, 235);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Summary Totals on Right
  const summaryX = pageWidth - margin - 75;
  const valX = pageWidth - margin - 3;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(75, 85, 99);
  doc.text("Subtotal:", summaryX, y);
  doc.text(bdt(invoice.subtotal), valX, y, { align: "right" });
  y += 6;

  if (Number(invoice.discountAmount) > 0) {
    doc.text("Discount (ডিসকাউন্ট):", summaryX, y);
    doc.text(`- ${bdt(invoice.discountAmount)}`, valX, y, { align: "right" });
    y += 6;
  }

  if (Number(invoice.vatAmount) > 0) {
    doc.text("VAT / Govt. Tax (ভ্যাট):", summaryX, y);
    doc.text(bdt(invoice.vatAmount), valX, y, { align: "right" });
    y += 6;
  }

  // Grand Total Box
  doc.setFillColor(17, 58, 48);
  doc.roundedRect(summaryX - 4, y - 2, 79, 10, 1.5, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Grand Total:", summaryX, y + 5);
  doc.text(bdt(invoice.grandTotal), valX, y + 5, { align: "right" });

  y += 15;

  // Paid & Due Breakdown
  if (Number(invoice.paidAmount) > 0) {
    doc.setTextColor(21, 128, 61);
    doc.setFont("helvetica", "bold");
    doc.text("Paid Amount (পরিশোধিত):", summaryX, y);
    doc.text(bdt(invoice.paidAmount), valX, y, { align: "right" });
    y += 6;

    const due = Math.max(0, Number(invoice.grandTotal) - Number(invoice.paidAmount));
    doc.setTextColor(due > 0 ? 185 : 21, due > 0 ? 28 : 128, due > 0 ? 28 : 61);
    doc.text("Net Due (বকেয়া):", summaryX, y);
    doc.text(bdt(due), valX, y, { align: "right" });
    y += 10;
  }

  // Payment Notes
  const bottomBoxY = y + 5;
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, bottomBoxY, pageWidth - (margin * 2), 24, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(17, 58, 48);
  doc.text("PAYMENT INSTRUCTIONS & TERMS:", margin + 4, bottomBoxY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  const notes = invoice.notesTerms || "Please transfer payment to our designated Bank or bKash Merchant account within the due date. Quote invoice number as reference.";
  doc.text(doc.splitTextToSize(notes, pageWidth - (margin * 2) - 10), margin + 4, bottomBoxY + 12);

  // Footer Signature Line
  const footerY = 270;
  doc.setDrawColor(156, 163, 175);
  doc.line(pageWidth - margin - 50, footerY, pageWidth - margin, footerY);
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text("Authorized Signature", pageWidth - margin - 25, footerY + 5, { align: "center" });

  doc.text("This is an electronically generated invoice from Ahmed's Financial Accounting.", margin, footerY + 5);

  doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
}
