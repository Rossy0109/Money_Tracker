import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("finance integrity safeguards", () => {
  it("updates an account balance inside the same transaction that assigns a voucher and inserts a ledger entry", () => {
    const createTransaction = dbSource.slice(dbSource.indexOf("export async function createTransaction"), dbSource.indexOf("export async function updateTransaction"));
    expect(createTransaction).toContain("await db.transaction(async tx =>");
    expect(createTransaction).toContain("const voucherNo = await claimNextVoucher(tx");
    expect(createTransaction).toContain("await tx.insert(financeTransactions)");
    expect(createTransaction).toContain("await tx.update(financeAccounts)");
    expect(createTransaction).not.toContain("await adjustAccountBalance");
  });

  it("keeps transaction edits and deletions together with balance reconciliation and audit writes", () => {
    const updateTransaction = dbSource.slice(dbSource.indexOf("export async function updateTransaction"), dbSource.indexOf("export async function deleteTransaction"));
    const deleteTransaction = dbSource.slice(dbSource.indexOf("export async function deleteTransaction"), dbSource.indexOf("export async function upsertBudget"));
    for (const operation of [updateTransaction, deleteTransaction]) {
      expect(operation).toContain("await db.transaction(async tx =>");
      expect(operation).toContain("await tx.update(financeAccounts)");
      expect(operation).toContain("await tx.insert(auditLogs)");
      expect(operation).not.toContain("await adjustAccountBalance");
    }
    expect(deleteTransaction).toContain("eq(financeTransactions.userId, userId)");
    expect(deleteTransaction).toContain("eq(financeTransactions.projectId, projectId)");
  });

  it("includes debt, receivable settlement, and voucher settings records in a user-scoped export", () => {
    const exportUserData = dbSource.slice(dbSource.indexOf("export async function exportUserData"), dbSource.indexOf("export type AuditLogFilters"));
    expect(exportUserData).toContain("financeDues");
    expect(exportUserData).toContain("financeDueSettlements");
    expect(exportUserData).toContain("financeVoucherSettings");
    expect(exportUserData).toContain("eq(financeDues.userId, userId)");
    expect(exportUserData).toContain("eq(financeDueSettlements.userId, userId)");
  });
});
