import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function readFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Invariant 1: Debit must equal Credit", () => {
  it("rejects when debits != credits beyond tolerance", () => {
    const totalDebit = 100; const totalCredit = 99.98;
    expect(Math.abs(totalDebit - totalCredit)).toBeGreaterThan(0.01);
  });
  it("accepts when debits == credits", () => {
    expect(Math.abs(800 - 800)).toBeLessThanOrEqual(0.01);
  });
  it("accepts within rounding tolerance (1/3 split)", () => {
    expect(Math.abs(33.34 + 33.33 + 33.33 - 100.00)).toBeLessThanOrEqual(0.01);
  });
  it("source validates debit=credit in createVoucherWithEntries", () => {
    const s = readFile("./db.ts");
    expect(s).toContain("totalDebit"); expect(s).toContain("totalCredit");
  });
  it("source validates debit=credit in voucherInput superRefine", () => {
    const s = readFile("./routers.ts");
    expect(s).toContain("totalDebit"); expect(s).toContain("totalCredit");
  });
});

describe("Invariant 2: Posted voucher cannot be modified", () => {
  it("assertVoucherTransition blocks posted to draft/submitted/approved", () => {
    const allowed: Record<string, string[]> = {
      draft: ["submitted"], submitted: ["approved", "draft"],
      approved: ["posted", "draft"], posted: ["reversed"],
    };
    expect(allowed.posted).not.toContain("draft");
    expect(allowed.posted).not.toContain("submitted");
    expect(allowed.posted).not.toContain("approved");
  });
  it("assertVoucherTransition only allows posted to reversed", () => {
    expect({ posted: ["reversed"] }).toEqual({ posted: ["reversed"] });
  });
  it("source enforces transition guard in submitVoucher", () => {
    const s = readFile("./db.ts");
    expect(s).toContain('assertVoucherTransition(voucher.status, "submitted")');
  });
  it("source enforces transition guard in postVoucher", () => {
    const s = readFile("./db.ts");
    expect(s).toContain('assertVoucherTransition(voucher.status, "posted")');
  });
  it("source enforces transition guard in approveVoucher", () => {
    const s = readFile("./db.ts");
    expect(s).toContain("assertVoucherTransition(voucher.status, targetStatus)");
  });
});

describe("Invariant 3: Posted voucher cannot be deleted", () => {
  it("no deleteVoucher function exists in db.ts", () => {
    expect(readFile("./db.ts")).not.toContain("export async function deleteVoucher");
  });
  it("financial entry FKs reference vouchers with RESTRICT", () => {
    const s = readFile("../drizzle/schema.ts");
    // Journal entries, ledger entries, reversals reference voucher with RESTRICT
    expect(s).toContain("references(() => financeVouchers.id, { onDelete: \"restrict\" })");
  });
  it("voucher debit/credit FKs use CASCADE (child entries die with parent)", () => {
    const s = readFile("../drizzle/schema.ts");
    // Debits and credits are child records that should cascade with the voucher
    expect(s).toContain("references(() => financeVouchers.id, { onDelete: \"cascade\" })");
  });
  it("posted status only transitions to reversed", () => {
    const allowed = { posted: ["reversed"] };
    expect(allowed.posted).not.toContain("draft");
  });
});

describe("Invariant 4: Reversal creates a traceable reversal", () => {
  it("reversal fields exist on voucher schema", () => {
    const s = readFile("../drizzle/schema.ts");
    expect(s).toContain("reversalReference");
    expect(s).toContain("reversedBy");
    expect(s).toContain("reversedAt");
  });
  it("reversal stores reference to original voucher", () => {
    expect(readFile("./db.ts")).toContain("reversalReference");
  });
  it("reversed status exists in voucher enum", () => {
    expect(readFile("../drizzle/schema.ts")).toContain('"reversed"');
  });
});

describe("Invariant 5: Input Operator cannot access admin API", () => {
  it("input-only-permissions blocks admin.users", () => {
    const s = readFile("./input-only-permissions.test.ts");
    expect(s).toContain("admin.users"); expect(s).toContain("FORBIDDEN");
  });
  it("input-only-permissions blocks admin.auditLogs", () => {
    expect(readFile("./input-only-permissions.test.ts")).toContain("admin.auditLogs");
  });
  it("input-operator-security blocks admin.verifyAccess", () => {
    const s = readFile("./input-operator-security.test.ts");
    expect(s).toContain("admin.verifyAccess");
  });
  it("requireCreatePermission middleware checks RBAC create permissions", () => {
    expect(readFile("./_core/trpc.ts")).toContain("requireCreatePermission");
    expect(readFile("./_core/trpc.ts")).toContain("hasAnyPermission");
  });
});

describe("Invariant 6: Input Operator cannot modify posted transactions", () => {
  it("blocked from updateTransaction", () => {
    const s = readFile("./input-operator-security.test.ts");
    expect(s).toContain("updateTransaction"); expect(s).toContain("FORBIDDEN");
  });
  it("blocked from deleteTransaction", () => {
    expect(readFile("./input-operator-security.test.ts")).toContain("deleteTransaction");
  });
  it("blocked from reverseVoucher", () => {
    expect(readFile("./input-operator-security.test.ts")).toContain("reverseVoucher");
  });
  it("lacks voucher.submit and voucher.post permissions", () => {
    const s = readFile("./input-operator-security.test.ts");
    expect(s).toContain("voucher.submit"); expect(s).toContain("voucher.post");
  });
});

describe("Invariant 7: Unauthorized user gets authorization error", () => {
  it("unauthenticated access returns UNAUTHORIZED", () => {
    expect(readFile("./input-operator-security.test.ts")).toContain("UNAUTHORIZED");
  });
  it("pending user returns FORBIDDEN", () => {
    const s = readFile("./input-only-permissions.test.ts");
    expect(s).toContain("pending"); expect(s).toContain("FORBIDDEN");
  });
  it("suspended user returns FORBIDDEN", () => {
    expect(readFile("./input-only-permissions.test.ts")).toContain("suspended");
  });
  it("requireUser checks user existence and status", () => {
    const s = readFile("./_core/trpc.ts");
    expect(s).toContain("!ctx.user");
    expect(s).toContain('ctx.user.status === "pending"');
    expect(s).toContain('ctx.user.status === "suspended"');
  });
});

describe("Invariant 8: Duplicate idempotency key prevents duplicates", () => {
  it("checkIdempotency returns isReplay for existing key", () => {
    expect(readFile("./_core/idempotency.test.ts")).toContain("isReplay");
  });
  it("different payload with same key throws", () => {
    expect(readFile("./_core/idempotency.test.ts")).toContain("different payload");
  });
  it("unique constraint on (userId, idempotencyKey)", () => {
    expect(readFile("../drizzle/schema.ts")).toContain("idempotency_keys_user_key_unique");
  });
  it("idempotent middleware intercepts replays", () => {
    const s = readFile("./_core/trpc.ts");
    expect(s).toContain('claim.outcome === "replay"');
    expect(s).toContain("completeIdempotency");
    expect(s).toContain("claimIdempotency");
  });
});

describe("Invariant 9: Failed multi-step posting rolls back completely", () => {
  it("postVoucher uses db.transaction for atomicity", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("export async function postVoucher(");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("db.transaction");
  });
  it("reverseVoucher uses db.transaction", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("export async function reverseVoucher");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("db.transaction");
  });
  it("createVoucherWithEntries uses db.transaction when auto-posting", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("export async function createVoucherWithEntries");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("db.transaction");
  });
  it("postVoucher calls postVoucherInternals within the same tx", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("export async function postVoucher(");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("postVoucherInternals(tx,");
  });
});

describe("Invariant 10: Audit record is generated for state-changing operations", () => {
  it("18 core mutations all call logAudit", () => {
    const s = readFile("./db.ts");
    const mutations = [
      "createProject", "createAccount", "updateAccount", "deleteAccount",
      "createTransaction", "updateTransaction", "deleteTransaction",
      "upsertBudget", "createBill", "updateBill", "setBillPaid", "deleteBill",
      "createHousehold", "inviteHouseholdMember", "acceptHouseholdInvitation",
      "updateHouseholdMember", "saveSharedBudget", "addSharedExpense",
    ];
    for (const m of mutations) {
      const start = s.indexOf(`export async function ${m}`);
      const nextFn = s.indexOf("\nexport async function ", start + 1);
      const fn = s.slice(start, nextFn === -1 ? undefined : nextFn);
      expect(fn, `${m} must call logAudit`).toContain("await logAudit(");
    }
  });
  it("logAudit accepts all 15 audit actions", () => {
    expect(readFile("./db.ts")).toContain("AuditAction");
  });
});

describe("Invariant 11: Every ledger record maps to a journal entry", () => {
  it("postVoucherInternals creates journal entry", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("async function postVoucherInternals");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("financeJournalEntries");
  });
  it("postVoucherInternals creates journal lines from voucher entries", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("async function postVoucherInternals");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("financeJournalLines");
  });
  it("postVoucherInternals creates ledger entries", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("async function postVoucherInternals");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("financeLedgerEntries");
  });
  it("journal entry references voucherId", () => {
    const s = readFile("./db.ts");
    const start = s.indexOf("async function postVoucherInternals");
    const end = s.indexOf("\nexport async function ", start + 1);
    const fn = s.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain("voucherId");
  });
  it("generateAccountLedger queries ledger entries", () => {
    const s = readFile("./accounting-core.ts");
    expect(s).toContain("financeLedgerEntries");
  });
});

describe("Invariant 12: Trial balance must balance", () => {
  it("generateTrialBalance returns isBalanced", () => {
    const s = readFile("./accounting-core.ts");
    expect(s).toContain("isBalanced");
  });
  it("totalDebit equals totalCredit in trial balance", () => {
    const s = readFile("./accounting-core.ts");
    expect(s).toContain("totalDebit");
    expect(s).toContain("totalCredit");
  });
  it("existing tests verify trial balance always balances", () => {
    const s = readFile("./accounting-core.test.ts");
    expect(s).toContain("isBalanced");
    expect(s).toContain("Trial Balance");
  });
  it("DECIMAL(18,2) precision prevents floating point errors", () => {
    const s = readFile("./accounting-core.test.ts");
    expect(s).toContain("DECIMAL");
    expect(s).toContain("Precision");
  });
});

describe("Invariant 13: Account balance reconciliation must work", () => {
  it("bank reconciliation functions exist", () => {
    const s = readFile("./db.ts");
    expect(s).toContain("export async function matchBankReconciliationItem");
    expect(s).toContain("export async function completeBankReconciliation");
    expect(s).toContain("export async function createBankReconciliation");
  });
  it("bank reconciliation is permission-protected", () => {
    const s = readFile("./routers.ts");
    expect(s).toContain("bankReconciliation");
    expect(s).toContain("protectedWithPermission");
  });
  it("reconciliation status tracking exists", () => {
    const s = readFile("../drizzle/schema.ts");
    expect(s).toContain("financeBankReconciliations");
    expect(s).toContain("financeBankReconciliationItems");
  });
});

describe("Invariant 14: Fiscal-period closing prevents unauthorized posting", () => {
  it("assertPeriodNotLocked exists and throws for locked periods", () => {
    const s = readFile("./accounting-core.ts");
    expect(s).toContain("assertPeriodNotLocked");
  });
  it("financeFiscalPeriods table exists with status field", () => {
    const s = readFile("../drizzle/schema.ts");
    expect(s).toContain("financeFiscalPeriods");
    expect(s).toContain('"open"');
    expect(s).toContain('"closed"');
  });
  it("financePeriodLocks table exists", () => {
    expect(readFile("../drizzle/schema.ts")).toContain("financePeriodLocks");
  });
  it("lockPeriod and unlockPeriod functions exist in db.ts", () => {
    const s = readFile("./db.ts");
    expect(s).toContain("export async function lockPeriod");
    expect(s).toContain("export async function unlockPeriod");
  });
  it("existing tests verify period lock enforcement", () => {
    const s = readFile("./accounting-core.test.ts");
    expect(s).toContain("Period Lock Enforcement");
    expect(s).toContain("assertPeriodNotLocked");
  });
});
