import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const canvas = { width: 1200, height: 600, toDataURL: vi.fn(() => "data:image/png;base64,chart") };
  const pdfDocument = {
    internal: { pageSize: { getWidth: () => 842, getHeight: () => 595 } },
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    setDrawColor: vi.fn(),
    line: vi.fn(),
    addImage: vi.fn(),
    save: vi.fn(),
  };
  return {
    canvas,
    capture: vi.fn(async () => canvas),
    jsPDF: vi.fn(() => pdfDocument),
    pdfDocument,
  };
});

vi.mock("html2canvas", () => ({ default: mocks.capture }));
vi.mock("jspdf", () => ({ jsPDF: mocks.jsPDF }));

import { downloadHouseholdChartImage, downloadHouseholdChartPdf, householdChartExportFilename } from "./householdChartExport";

describe("household chart export filenames", () => {
  const date = new Date("2026-08-23T12:00:00.000Z");
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };

  beforeEach(() => {
    mocks.capture.mockClear();
    mocks.canvas.toDataURL.mockClear();
    mocks.jsPDF.mockClear();
    mocks.pdfDocument.addImage.mockClear();
    mocks.pdfDocument.save.mockClear();
    mocks.pdfDocument.addFileToVFS.mockClear();
    mocks.pdfDocument.addFont.mockClear();
    mocks.pdfDocument.setFont.mockClear();
    mocks.pdfDocument.setFontSize.mockClear();
    mocks.pdfDocument.text.mockClear();
    mocks.pdfDocument.setDrawColor.mockClear();
    mocks.pdfDocument.line.mockClear();
    anchor.href = "";
    anchor.download = "";
    anchor.click.mockClear();
    anchor.remove.mockClear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { devicePixelRatio: 1, fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0, 1, 2]).buffer })) },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  });

  it("creates an offline PNG filename with a stable ISO date", () => {
    expect(householdChartExportFilename("image", date)).toBe("household-member-monthly-comparison-2026-08-23.png");
  });

  it("creates an offline PDF filename with a stable ISO date", () => {
    expect(householdChartExportFilename("pdf", date)).toBe("household-member-monthly-comparison-2026-08-23.pdf");
  });

  it("captures the authorized chart node and triggers a PNG download", async () => {
    await downloadHouseholdChartImage({} as HTMLElement);

    expect(mocks.capture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ backgroundColor: "#ffffff", useCORS: true }));
    expect(anchor.download).toMatch(/^household-member-monthly-comparison-\d{4}-\d{2}-\d{2}\.png$/);
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it("captures the authorized chart node and saves a Bengali family-title PDF", async () => {
    await downloadHouseholdChartPdf({} as HTMLElement, { familyName: "আহমেদ পরিবার", title: "জুলাই–ডিসেম্বর ব্যয়ের তুলনা" });

    expect(mocks.pdfDocument.text).toHaveBeenCalledWith("জুলাই–ডিসেম্বর ব্যয়ের তুলনা", 28, 36);
    expect(mocks.pdfDocument.text).toHaveBeenCalledWith("পরিবার: আহমেদ পরিবার", 28, 54);
    expect(mocks.pdfDocument.addImage).toHaveBeenCalledWith("data:image/png;base64,chart", "PNG", expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), undefined, "FAST");
    expect(mocks.pdfDocument.save).toHaveBeenCalledWith(expect.stringMatching(/^household-member-monthly-comparison-\d{4}-\d{2}-\d{2}\.pdf$/));
  });
});
