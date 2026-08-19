import { jsPDF } from "jspdf";

export type AuditLogExportRecord = {
  id: number;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: number | null;
  summary: string;
  createdAt: Date | string;
  actorUserId: number;
  actorName: string | null;
  projectId: number | null;
  projectName: string | null;
};

const BENGALI_FONT_URL = "/manus-storage/NotoSansBengali-Regular_ca0a97c7.ttf";
const auditDate = (value: Date | string) => new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const actorText = (row: AuditLogExportRecord) => row.actorName ?? `User #${row.actorUserId}`;
const projectText = (row: AuditLogExportRecord) => row.projectName ?? "—";
const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadAuditCsv(rows: AuditLogExportRecord[]) {
  const header = ["সময়", "কাজ", "বিবরণ", "ব্যবহারকারী", "প্রজেক্ট", "এন্ট্রি আইডি"];
  const lines = rows.map(row => [auditDate(row.createdAt), row.action, row.summary, actorText(row), projectText(row), row.id].map(escapeCsv).join(","));
  download(new Blob(["\ufeff", header.map(escapeCsv).join(","), "\n", lines.join("\n")], { type: "text/csv;charset=utf-8" }), `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
}

async function addBengaliFont(doc: jsPDF) {
  const response = await window.fetch(BENGALI_FONT_URL);
  if (!response.ok) throw new Error("PDF ফন্ট লোড করা যায়নি");
  const fontBuffer: ArrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(fontBuffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  doc.addFileToVFS("NotoSansBengali-Regular.ttf", btoa(binary));
  doc.addFont("NotoSansBengali-Regular.ttf", "NotoSansBengali", "normal");
  doc.setFont("NotoSansBengali", "normal");
}

export async function downloadAuditPdf(rows: AuditLogExportRecord[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  await addBengaliFont(doc);
  const columns = [40, 155, 300, 530, 685];
  const widths = [105, 145, 230, 155, 105];
  const drawHeader = () => {
    doc.setFontSize(16);
    doc.text("ফিল্টার করা অডিট লগ", 40, 42);
    doc.setFontSize(9);
    doc.text(`তৈরির সময়: ${auditDate(new Date())}`, 40, 60);
    doc.setFillColor(237, 245, 238);
    doc.rect(40, 78, 730, 22, "F");
    ["সময়", "কাজ", "বিবরণ", "ব্যবহারকারী", "প্রজেক্ট"].forEach((label, index) => doc.text(label, columns[index], 93));
  };
  let y = 118;
  drawHeader();
  for (const row of rows) {
    doc.setFontSize(8);
    const values = [auditDate(row.createdAt), row.action, row.summary, actorText(row), projectText(row)];
    const lines = values.map((value, index) => doc.splitTextToSize(value, widths[index] - 8));
    const rowHeight = Math.max(18, ...lines.map(line => line.length * 11)) + 8;
    if (y + rowHeight > 555) { doc.addPage(); y = 118; drawHeader(); }
    doc.setDrawColor(224, 233, 226);
    doc.line(40, y + rowHeight - 4, 770, y + rowHeight - 4);
    lines.forEach((line, index) => doc.text(line, columns[index], y));
    y += rowHeight;
  }
  doc.save(`audit-log-${new Date().toISOString().slice(0, 10)}.pdf`);
}
