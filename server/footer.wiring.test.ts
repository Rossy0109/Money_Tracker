import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");

describe("application footer wiring", () => {
  it("renders the requested copyright notice in the shared authenticated layout", () => {
    expect(layoutSource).toContain("Kamrul Ahmed");
    expect(layoutSource).toContain("সর্বস্বত্ব সংরক্ষিত");
  });
});
