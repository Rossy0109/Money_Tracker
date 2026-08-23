export type HouseholdChartExportKind = "image" | "pdf";

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

export async function downloadHouseholdChartImage(element: HTMLElement) {
  const canvas = await captureChart(element);
  triggerDownload(canvas.toDataURL("image/png"), householdChartExportFilename("image"));
}

export async function downloadHouseholdChartPdf(element: HTMLElement) {
  const canvas = await captureChart(element);
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const imageRatio = canvas.height / canvas.width;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const width = Math.min(maxWidth, maxHeight / imageRatio);
  const height = width * imageRatio;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  doc.save(householdChartExportFilename("pdf"));
}
