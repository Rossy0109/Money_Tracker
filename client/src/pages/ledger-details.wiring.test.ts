import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(resolve(import.meta.dirname, "Home.tsx"), "utf8");
const duesPanelPath = resolve(import.meta.dirname, "../components/dashboard/DuesPanel.tsx");
const duesPanelSource = existsSync(duesPanelPath) ? readFileSync(duesPanelPath, "utf8") : "";
const combinedSource = homeSource + "\n" + duesPanelSource;

describe("voucher ledger and settlement history presentation", () => {
  it("uses automatic voucher settings and a description-only ledger interface", () => {
    expect(combinedSource).toContain("ভাউচার সেটিংস");
    expect(combinedSource).toContain("trpc.finance.voucherSettings.useQuery");
    expect(combinedSource).toContain("trpc.finance.saveVoucherSettings.useMutation");
    expect(combinedSource).toContain("ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে");
    expect(combinedSource).toContain("টাকার পরিমাণ");
    expect(combinedSource).toContain("row.note");
    expect(combinedSource).not.toContain("row.reason");
  });

  it("keeps debt and receivable histories visible separately with settlement records", () => {
    expect(combinedSource).toContain('title="দেনার খাতা"');
    expect(combinedSource).toContain('title="পাওনার খাতা"');
    expect(combinedSource).toContain("সমন্বয়ের ইতিহাস");
    expect(combinedSource).toContain("due.settlements.map");
    expect(combinedSource).toContain("settlement.accountName");
    expect(combinedSource).toContain("settlement.voucherNo");
  });
});
