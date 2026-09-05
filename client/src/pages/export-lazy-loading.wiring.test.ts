import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readClientFile = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "client/src", relativePath), "utf8");

describe("export lazy-loading wiring", () => {
  it("keeps accounting report labels lightweight and loads audit/PDF exporters only after a user action", () => {
    const source = readClientFile("pages/Home.tsx");
    expect(source).toContain('from "@/lib/accountingReportDefinitions"');
    expect(source).toContain('await import("@/lib/auditLogExports")');
    expect(source).toContain('await import("@/lib/monthlyReportPdf")');
    expect(source).not.toContain('from "@/lib/monthlyReportPdf"');
  });

  it("loads invoice PDF generation code only when the user requests an invoice export", () => {
    const source = readClientFile("pages/Invoices.tsx");
    expect(source).toContain('await import("@/lib/invoicePdf")');
    expect(source).not.toContain('from "@/lib/invoicePdf"');
  });

  it("loads payslip PDF generation code only when an employee payslip export is clicked", () => {
    const source = readClientFile("pages/Payroll.tsx");
    expect(source).toContain('await import("@/lib/payslipPdf")');
    expect(source).not.toContain('from "@/lib/payslipPdf"');
  });

  it("loads party ledger PDF generation on-demand inside PartyLedger page", () => {
    const source = readClientFile("pages/PartyLedger.tsx");
    expect(source).toContain('await import("jspdf")');
    expect(source).not.toContain('from "jspdf"');
  });
});
