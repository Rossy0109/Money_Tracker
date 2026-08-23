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

  it("loads household chart capture and PDF code only after an authorized export click", () => {
    const source = readClientFile("pages/FamilyHousehold.tsx");
    expect(source).toContain('await import("@/lib/householdChartExport")');
    expect(source).not.toContain('from "@/lib/householdChartExport"');
    expect(source).toContain("if (!monthlyChartExportRef.current || monthlyContributors.length === 0) return");
  });
});
