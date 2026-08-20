import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = fs.readFileSync(path.resolve(import.meta.dirname, "Home.tsx"), "utf8");

describe("dashboard functional workflow wiring", () => {
  it("keeps every protected finance, export, and administrator workflow connected to its typed client action", () => {
    const requiredClientActions = [
      "trpc.finance.addTransaction.useMutation",
      "trpc.finance.updateTransaction.useMutation",
      "trpc.finance.deleteTransaction.useMutation",
      "trpc.finance.addAccount.useMutation",
      "trpc.finance.updateAccount.useMutation",
      "trpc.finance.deleteAccount.useMutation",
      "trpc.finance.saveBudget.useMutation",
      "trpc.finance.addBill.useMutation",
      "trpc.finance.updateBill.useMutation",
      "trpc.finance.setBillPaid.useMutation",
      "trpc.finance.deleteBill.useMutation",
      "trpc.finance.addDue.useMutation",
      "trpc.finance.settleDue.useMutation",
      "trpc.finance.saveVoucherSettings.useMutation",
      "trpc.finance.exportData.useQuery",
      "trpc.projects.create.useMutation",
      "trpc.admin.verifyAccess.useMutation",
      "trpc.admin.auditLogs.useQuery",
      "trpc.admin.auditLogExport.useQuery",
      "trpc.admin.auditActivity.useQuery",
    ];

    for (const action of requiredClientActions) {
      expect(homeSource, `${action} should stay wired into the Bengali dashboard`).toContain(action);
    }
    expect(homeSource).toContain("toast.error(");
    expect(homeSource).toContain("downloadAuditLogs");
    expect(homeSource).toContain("downloadExport");
  });
});
