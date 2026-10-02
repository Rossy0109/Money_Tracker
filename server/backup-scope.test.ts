import { describe, expect, it } from "vitest";
import { previewProjectBackup } from "./db";

type AnyBackup = Parameters<typeof previewProjectBackup>[0] &
  Record<string, any>;

function baseBackup(): AnyBackup {
  return {
    project: { id: 1, name: "প্রকল্প" },
    exportedAt: new Date("2026-01-01T00:00:00.000Z"),
    accounts: [{ id: 1, name: "নগদ", type: "cash" }],
    categories: [{ id: 1, name: "খরচ", type: "expense" }],
    transactions: [
      {
        id: 1,
        categoryId: 1,
        accountId: 1,
        occurredAt: new Date("2026-01-02T00:00:00.000Z"),
        amount: "100",
      },
    ],
    budgets: [],
    bills: [],
    dues: [],
    settlements: [],
    recurring: [],
  };
}

describe("project backup scope", () => {
  it("counts period controls, account groups and voucher audit rows", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      accountGroups: [{ id: 1, accountTypeId: 1, code: "G1" }],
      fiscalPeriods: [{ id: 1, name: "2026" }],
      periodLocks: [{ id: 1, monthKey: "2026-01" }],
      voucherReversals: [{ id: 1, originalVoucherId: 9, reversalVoucherId: 9 }],
      voucherAudit: [{ id: 1, voucherId: 9 }],
      voucherReferences: [{ id: 1, voucherId: 9 }],
      vouchers: [{ id: 9, voucherNo: "JV-1" }],
    };

    const { counts } = previewProjectBackup(backup);
    expect(counts).toMatchObject({
      accountGroups: 1,
      fiscalPeriods: 1,
      periodLocks: 1,
      voucherReversals: 1,
      voucherAudit: 1,
      voucherReferences: 1,
    });
  });

  it("keeps backups written before the scope change valid", () => {
    const { counts } = previewProjectBackup(baseBackup());
    expect(counts).toMatchObject({
      accountGroups: 0,
      fiscalPeriods: 0,
      periodLocks: 0,
      voucherReversals: 0,
      voucherAudit: 0,
      voucherReferences: 0,
      journalLines: 0,
    });
  });

  it("rejects a voucher line that points at a missing voucher", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      vouchers: [{ id: 9, voucherNo: "JV-1" }],
      voucherDebits: [{ id: 1, voucherId: 999 }],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/ভাউচার রেফারেন্স/);
  });

  it("rejects a reversal whose voucher pair is not in the backup", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      vouchers: [{ id: 9, voucherNo: "JV-1" }],
      voucherReversals: [
        { id: 1, originalVoucherId: 9, reversalVoucherId: 42 },
      ],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/ভাউচার রেফারেন্স/);
  });

  it("rejects an audit row that points at a missing voucher", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      vouchers: [{ id: 9, voucherNo: "JV-1" }],
      voucherAudit: [{ id: 1, voucherId: 12 }],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/ভাউচার রেফারেন্স/);
  });

  it("rejects a journal line that points at a missing journal entry", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      journalEntries: [{ id: 1 }],
      journalLines: [{ id: 1, journalEntryId: 77 }],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/জার্নাল লাইন/);
  });

  it("rejects duplicate ids in the newly scoped tables", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      periodLocks: [
        { id: 3, monthKey: "2026-01" },
        { id: 3, monthKey: "2026-02" },
      ],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/একই আইডি/);
  });

  it("rejects an account group whose parent is not in the backup", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      accountGroups: [{ id: 1, accountTypeId: 1, parentId: 88, code: "G" }],
    };
    expect(() => previewProjectBackup(backup)).toThrow(/প্যারেন্ট/);
  });

  it("accepts a complete backup that carries every new table", () => {
    const backup: AnyBackup = {
      ...baseBackup(),
      accountGroups: [
        { id: 1, accountTypeId: 1, parentId: null, code: "ROOT" },
        { id: 2, accountTypeId: 1, parentId: 1, code: "CHILD" },
      ],
      fiscalPeriods: [{ id: 5, name: "2026", status: "open" }],
      periodLocks: [{ id: 6, monthKey: "2026-01" }],
      vouchers: [{ id: 9, voucherNo: "JV-1" }],
      voucherReversals: [
        { id: 1, originalVoucherId: 9, reversalVoucherId: 9 },
      ],
      voucherAudit: [{ id: 2, voucherId: 9 }],
      voucherReferences: [{ id: 3, voucherId: 9 }],
    };
    expect(() => previewProjectBackup(backup)).not.toThrow();
  });
});
