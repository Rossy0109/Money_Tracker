import type { jsPDF } from "jspdf";

export type HouseholdChartExportKind = "image" | "pdf";

export type HouseholdChartPdfHeader = {
  familyName: string;
  title: string;
};

const BENGALI_FONT_URL = "/manus-storage/NotoSansBengali-Regular_ca0a97c7.ttf";

export function householdChartExportFilename(kind: HouseholdChartExportKind, date = new Date()) {
  const suffix = kind === "image" ? "png" : "pdf";
  return `household-member-monthly-comparison-${date.toISOString().slice(0, 10)}.${suffix}`;
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function captureChart(element: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    onclone: documentClone => {
      documentClone.querySelectorAll("[data-chart-export-hide]").forEach(node => {
        (node as HTMLElement).style.display = "none";
      });
    },
  });
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

export async function downloadHouseholdChartImage(element: HTMLElement) {
  const canvas = await captureChart(element);
  triggerDownload(canvas.toDataURL("image/png"), householdChartExportFilename("image"));
}

export async function downloadHouseholdChartPdf(element: HTMLElement, header: HouseholdChartPdfHeader) {
  const canvas = await captureChart(element);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  await addBengaliFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const title = header.title.trim() || "পারিবারিক সদস্যদের মাসিক খরচের তুলনা";
  const familyName = header.familyName.trim() || "পারিবারিক প্রোফাইল";
  doc.setFontSize(17);
  doc.text(title, margin, 36);
  doc.setFontSize(10);
  doc.text(`পরিবার: ${familyName}`, margin, 54);
  doc.setDrawColor(207, 226, 211);
  doc.line(margin, 66, pageWidth - margin, 66);
  const imageRatio = canvas.height / canvas.width;
  const maxWidth = pageWidth - margin * 2;
  const imageTop = 82;
  const maxHeight = pageHeight - imageTop - margin;
  const width = Math.min(maxWidth, maxHeight / imageRatio);
  const height = width * imageRatio;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - width) / 2, imageTop + (maxHeight - height) / 2, width, height, undefined, "FAST");
  doc.save(householdChartExportFilename("pdf"));
}
