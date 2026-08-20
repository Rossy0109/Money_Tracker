import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(resolve(import.meta.dirname, "Home.tsx"), "utf8");

describe("voucher ledger and settlement history presentation", () => {
  it("uses automatic voucher settings and a description-only ledger interface", () => {
    expect(homeSource).toContain("ভাউচার সেটিংস");
    expect(homeSource).toContain("trpc.finance.voucherSettings.useQuery");
    expect(homeSource).toContain("trpc.finance.saveVoucherSettings.useMutation");
    expect(homeSource).toContain("ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে");
    expect(homeSource).toContain("টাকার পরিমাণ");
    expect(homeSource).toContain("row.note");
    expect(homeSource).not.toContain("row.reason");
  });

  it("keeps debt and receivable histories visible separately with settlement records", () => {
    expect(homeSource).toContain('title="দেনার খাতা"');
    expect(homeSource).toContain('title="পাওনার খাতা"');
    expect(homeSource).toContain("সমন্বয়ের ইতিহাস");
    expect(homeSource).toContain("due.settlements.map");
    expect(homeSource).toContain("settlement.accountName");
    expect(homeSource).toContain("settlement.voucherNo");
  });
});
