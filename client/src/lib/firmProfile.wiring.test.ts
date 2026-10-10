import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  reports: resolve(process.cwd(), "client/src/pages/ReportsAndPrint.tsx"),
} as const;

const reportsSource = readFileSync(files.reports, "utf8");

/**
 * Contract: firm profile (নাম/উপাধি) is persisted server-side only
 * (F-12/finance_firm_profiles, migration 0020) and is always read
 * through the tRPC query — never from an in-memory store or
 * localStorage. The print pipeline must therefore reflect the latest
 * server state after any save.
 */
describe("Firm profile persistence contract", () => {
  it("reads firm profile via the server-backed tRPC query", () => {
    expect(reportsSource).toContain("trpc.finance.firmProfile.useQuery");
  });

  it("saves firm profile through the server mutation, never localStorage", () => {
    expect(reportsSource).toContain("trpc.finance.saveFirmProfile.useMutation");
    expect(reportsSource).not.toContain("localStorage");
    expect(reportsSource).not.toContain("sessionStorage");
  });

  it("invalidates stale firm-profile data after a save so print reads server state", () => {
    expect(reportsSource).toContain("utils.finance.firmProfile.invalidate()");
  });

  it("seeds the print draft from the query result (no separate mirror)", () => {
    // The draft is populated only from firmProfile.data, so there is
    // exactly one source of truth.
    expect(reportsSource).toContain("firmProfile.data.name");
    expect(reportsSource).toContain("setFirmDraft({");
  });
});