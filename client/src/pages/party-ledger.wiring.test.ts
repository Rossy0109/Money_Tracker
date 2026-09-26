import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { containsSnippet } from "@shared/sourceText";

const partyLedgerSource = readFileSync(
  new URL("PartyLedger.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const dashboardLayoutSource = readFileSync(
  new URL("../components/DashboardLayout.tsx", import.meta.url),
  "utf8"
);

describe("Party Ledger (পার্টি খতিয়ান) wiring and capabilities", () => {
  it("registers /party-ledger route and sidebar navigation", () => {
    expect(appSource).toContain(
      'path={"/party-ledger"} component={PartyLedger}'
    );
    expect(
      containsSnippet(
        dashboardLayoutSource,
        'label: "পার্টি খতিয়ান", href: "/party-ledger"'
      )
    ).toBe(true);
  });

  it("includes running balance, settlement workflow, WhatsApp sharing and PDF export", () => {
    expect(partyLedgerSource).toContain("পার্টি ও খতিয়ান খাতা (Party Ledger)");
    expect(partyLedgerSource).toContain("চলমান ব্যালেন্স (৳)");
    expect(partyLedgerSource).toContain("বকেয়া সমন্বয় / পেমেন্ট এন্ট্রি");
    expect(partyLedgerSource).toContain("handleSendWhatsApp");
    expect(partyLedgerSource).toContain("handleDownloadPdf");
    expect(partyLedgerSource).toContain("trpc.finance.settleDue.useMutation");
  });
});
