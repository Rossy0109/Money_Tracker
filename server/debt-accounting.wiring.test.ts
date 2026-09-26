import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirnameFromMetaUrl } from "../dirname";

const dbSource = readFileSync(
  resolve(dirnameFromMetaUrl(import.meta.url), "db.ts"),
  "utf8"
);

describe("debt and receivable accounting treatment", () => {
  it("reduces only the outstanding due balance and adjusts cash without creating income or expense transactions", () => {
    const settlementStart = dbSource.indexOf("export async function settleDue");
    const settlementSource = dbSource.slice(
      settlementStart,
      dbSource.indexOf("export async function createAccount", settlementStart)
    );

    expect(settlementSource).toContain("outstandingAmount");
    expect(settlementSource).toContain("financeDueSettlements");
    expect(settlementSource).toMatch(
      /calculateDueSettlement\(\s*due\.type,\s*Number\(due\.outstandingAmount\),\s*input\.amount\s*\)/
    );
    expect(settlementSource).toContain("effect.accountBalanceDelta");
    expect(settlementSource).not.toContain("financeTransactions");
  });
});
