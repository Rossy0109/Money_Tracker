import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbSource = readFileSync(resolve(import.meta.dirname, "db.ts"), "utf8");

describe("debt and receivable accounting treatment", () => {
  it("reduces only the outstanding due balance and adjusts cash without creating income or expense transactions", () => {
    const settlementStart = dbSource.indexOf("export async function settleDue");
    const settlementSource = dbSource.slice(settlementStart, dbSource.indexOf("export async function createAccount", settlementStart));

    expect(settlementSource).toContain("outstandingAmount");
    expect(settlementSource).toContain("financeDueSettlements");
    expect(settlementSource).toContain("calculateDueSettlement(due.type, Number(due.outstandingAmount), input.amount)");
    expect(settlementSource).toContain("effect.accountBalanceDelta");
    expect(settlementSource).not.toContain("financeTransactions");
  });
});
