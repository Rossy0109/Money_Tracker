import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dataLayerSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const auditedMutations = [
  "createProject",
  "createAccount",
  "updateAccount",
  "deleteAccount",
  "createTransaction",
  "updateTransaction",
  "deleteTransaction",
  "upsertBudget",
  "createBill",
  "updateBill",
  "setBillPaid",
  "deleteBill",
];

describe("audit logging coverage", () => {
  it("records every protected create, update, and delete data mutation through the immutable audit helper", () => {
    for (const mutation of auditedMutations) {
      const start = dataLayerSource.indexOf(`export async function ${mutation}`);
      const nextFunction = dataLayerSource.indexOf("\nexport async function ", start + 1);
      const implementation = dataLayerSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
      expect(start, `${mutation} should exist in the finance data layer`).toBeGreaterThanOrEqual(0);
      expect(implementation, `${mutation} should write an audit entry`).toContain("await logAudit(");
    }
  });
});
