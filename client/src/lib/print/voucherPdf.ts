import type { jsPDF } from "jspdf";
import { amountToWords } from "./amountToWords";
import type { VoucherPrintData } from "./types";

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

const moneyBn = (value: number) =>
  `৳ ${value.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateBn = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export async function buildVoucherPdf(data: VoucherPrintData): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  await loadBengaliFont(doc);

  const pageW = 595;
  const margin = 40;
  const contentW = pageW - margin * 2;
  const t = data.transaction;
  const amount = Number(t.amount);
  const isIncome = t.type === "income";

  doc.setFillColor(17, 58, 48);
  doc.rect(0, 0, pageW, 46, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("Ahmed's Financial Accounting", margin, 18);
  doc.setFontSize(8.5);
  doc.setTextColor(190, 214, 200);
  doc.text("Professional Accounting & Financial Management", margin, 28);
  doc.text(
    [data.firm.address, data.firm.phone, data.firm.email]
      .filter(Boolean)
      .join("  |  ") || " ",
    margin,
    37
  );
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    isIncome ? "আমানত রসিদ / VOUCHER" : "ব্যয় ভাউচার / VOUCHER",
    pageW - margin,
    18,
    { align: "right" }
  );

  let y = 64;
  doc.setTextColor(22, 60, 50);
  doc.setFontSize(10);
  doc.text(`প্রজেক্ট: ${data.project.name}`, margin, y);
  doc.text(`ভাউচার নং: ${t.voucherNo || "—"}`, pageW - margin, y, {
    align: "right",
  });
  y += 15;
  doc.setTextColor(94, 116, 105);
  doc.text(`তারিখ: ${dateBn(t.occurredAt)}`, margin, y);
  doc.text(
    `তৈরির সময়: ${new Intl.DateTimeFormat("bn-BD", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`,
    pageW - margin,
    y,
    { align: "right" }
  );

  const fieldRow = (label: string, value: string, h: number) => {
    doc.setDrawColor(51, 73, 63);
    doc.rect(margin, y, contentW, h);
    doc.setFontSize(8);
    doc.setTextColor(90, 105, 97);
    doc.text(label, margin + 8, y + 13);
    doc.setFontSize(10);
    doc.setTextColor(20, 36, 30);
    doc.text(value || "—", margin + 8, y + 27);
    y += h;
  };

  fieldRow("খাত / হেড (HEAD)", t.categoryName, 42);
  fieldRow("অ্যাকাউন্ট (ACCOUNT)", t.accountName ?? "—", 42);
  fieldRow("নাম (NAME)", t.reason?.trim() || "—", 42);
  fieldRow("ঠিকানা (ADDRESS)", "—", 42);
  fieldRow(
    "বিবরণ (DESCRIPTION)",
    t.note?.trim() || t.reason?.trim() || "—",
    56
  );
  fieldRow("পরিশোধ পদ্ধতি (PAYMENT METHOD)", t.paymentMethod, 42);

  const amountRowH = 46;
  doc.setDrawColor(51, 73, 63);
  doc.rect(margin, y, contentW, amountRowH);
  doc.setFillColor(244, 248, 245);
  doc.rect(margin, y, contentW, amountRowH, "F");
  doc.setFontSize(8);
  doc.setTextColor(90, 105, 97);
  doc.text("পরিমাণ (AMOUNT)", margin + 10, y + 13);
  doc.setFontSize(16);
  doc.setTextColor(15, 47, 38);
  doc.text(moneyBn(amount), pageW - margin - 12, y + 30, { align: "right" });
  y += amountRowH;

  const words = amountToWords(amount);
  const wordsH = 56;
  doc.setDrawColor(51, 73, 63);
  doc.rect(margin, y, contentW, wordsH);
  doc.setFontSize(8);
  doc.setTextColor(90, 105, 97);
  doc.text("টাকার অংকে (AMOUNT IN WORDS)", margin + 10, y + 13);
  doc.setFontSize(10.5);
  doc.setTextColor(20, 36, 30);
  const bnLines = doc.splitTextToSize(words.bengali, contentW - 20);
  doc.text(bnLines, margin + 10, y + 29);
  y += wordsH;

  y = Math.max(y + 24, 660);
  const colW = (contentW - 40) / 3;
  const labels = [
    ["অনুমোদনকারীর স্বাক্ষর", "(Authority Signature)"],
    ["প্রদানকারীর স্বাক্ষর", "(Payer Signature)"],
    ["গ্রহীতার স্বাক্ষর", "(Receiver Signature)"],
  ];
  for (let index = 0; index < 3; index += 1) {
    const x = margin + index * (colW + 20);
    doc.setDrawColor(120, 140, 132);
    doc.line(x, y, x + colW, y);
    doc.setFontSize(8.5);
    doc.setTextColor(60, 78, 70);
    doc.text(labels[index][0], x + colW / 2, y + 12, { align: "center" });
    doc.setFontSize(7);
    doc.setTextColor(120, 138, 130);
    doc.text(labels[index][1], x + colW / 2, y + 21, { align: "center" });
  }

  doc.setFontSize(7.5);
  doc.setTextColor(94, 116, 105);
  doc.text(
    "এটি Money_Tracker সিস্টেম দ্বারা স্বয়ংক্রিয়ভাবে তৈরি কম্পিউটার-জেনারেটেড ভাউচার।",
    margin,
    790
  );

  return doc;
}

export async function downloadVoucherPdf(
  data: VoucherPrintData
): Promise<void> {
  const doc = await buildVoucherPdf(data);
  doc.save(`voucher-${data.transaction.voucherNo || data.transaction.id}.pdf`);
}
