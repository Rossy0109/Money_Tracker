import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  financeJournalEntries,
  financeJournalLines,
  financeLedgerEntries,
  financeProjects,
  financeVoucherCredits,
  financeVoucherDebits,
  financeVouchers,
} from "../drizzle/schema";

vi.mock("./scheduledBackup", () => ({
  verifyBackupAuthorization: vi.fn(),
}));
vi.mock("./audit", () => ({
  logAudit: vi.fn(async () => {}),
  systemActorUserId: vi.fn(async () => 42),
}));
vi.mock("./db", () => ({
  getDb: vi.fn(),
  databaseRequired: vi.fn((db: unknown) => db),
  listUsersForAdmin: vi.fn(async () => []),
}));

import { verifyBackupAuthorization } from "./scheduledBackup";
import { logAudit, systemActorUserId } from "./audit";
import { getDb, listUsersForAdmin } from "./db";
import {
  evaluateInvariants,
  runAccountingAudit,
  runScheduledAccountingAudit,
  verifyAccountingAuditRow,
  type AccountingAuditRow,
  type InvariantDataset,
} from "./accountingAudit";

function readFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/** Balanced project: one posted voucher, its ledger row and journal entry. */
function balancedDataset(
  overrides: Partial<InvariantDataset> = {}
): InvariantDataset {
  return {
    projectId: 1,
    projectName: "প্রজেক্ট",
    vouchers: [
      {
        id: 10,
        voucherNo: "V-1",
        status: "posted",
        totalDebit: "500.00",
        totalCredit: "500.00",
      },
    ],
    debitSums: [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
    creditSums: [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
    ledgerSums: [
      { voucherId: 10, debitTotal: "500.00", creditTotal: "500.00" },
    ],
    journals: [
      {
        id: 3,
        voucherId: 10,
        totalDebit: "500.00",
        totalCredit: "500.00",
      },
    ],
    journalLineSums: [
      {
        journalEntryId: 3,
        debitTotal: "500.00",
        creditTotal: "500.00",
        nonPositive: 0,
      },
    ],
    ...overrides,
  };
}

describe("evaluateInvariants", () => {
  it("accepts a project where every level balances", () => {
    expect(evaluateInvariants(balancedDataset())).toEqual([]);
  });

  it("flags voucher lines that do not balance", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        creditSums: [{ voucherId: 10, total: "480.00", nonPositive: 0 }],
      })
    );
    expect(violations.map(v => v.kind)).toContain("voucher_unbalanced");
    expect(violations.map(v => v.kind)).toContain("voucher_totals_mismatch");
    const unbalanced = violations.find(v => v.kind === "voucher_unbalanced");
    expect(unbalanced?.scope).toBe("voucher");
    expect(unbalanced?.refId).toBe(10);
    expect(unbalanced?.detail).toContain("500.00");
    expect(unbalanced?.detail).toContain("480.00");
  });

  it("flags cached totals that disagree with the lines behind them", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        vouchers: [
          {
            id: 10,
            voucherNo: "V-1",
            status: "draft",
            totalDebit: "500.00",
            totalCredit: "500.00",
          },
        ],
        debitSums: [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
        creditSums: [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
        ledgerSums: [],
        journals: [],
        journalLineSums: [],
      })
    );
    expect(violations).toEqual([]);
    const mismatch = evaluateInvariants(
      balancedDataset({
        vouchers: [
          {
            id: 10,
            voucherNo: "V-1",
            status: "draft",
            totalDebit: "500.00",
            totalCredit: "490.00",
          },
        ],
        ledgerSums: [],
        journals: [],
        journalLineSums: [],
      })
    );
    expect(mismatch.map(v => v.kind)).toContain("voucher_totals_mismatch");
  });

  it("flags a line of zero or less", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        creditSums: [{ voucherId: 10, total: "500.00", nonPositive: 1 }],
      })
    );
    expect(violations.map(v => v.kind)).toContain("non_positive_amount");
  });

  it("flags ledger rows that do not match the voucher they posted", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        ledgerSums: [
          { voucherId: 10, debitTotal: "500.00", creditTotal: "450.00" },
        ],
      })
    );
    expect(violations.map(v => v.kind)).toContain("ledger_mismatch");
    // The project-wide trial balance follows the same rows.
    expect(violations.map(v => v.kind)).toContain("trial_balance_unbalanced");
  });

  it("flags a journal entry whose lines or totals disagree", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        journalLineSums: [
          {
            journalEntryId: 3,
            debitTotal: "500.00",
            creditTotal: "400.00",
            nonPositive: 0,
          },
        ],
      })
    );
    expect(violations.map(v => v.kind)).toContain("journal_unbalanced");
    expect(violations.find(v => v.kind === "journal_unbalanced")?.scope).toBe(
      "journal"
    );
  });

  it("flags a journal line of zero or less", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        journalLineSums: [
          {
            journalEntryId: 3,
            debitTotal: "500.00",
            creditTotal: "500.00",
            nonPositive: 2,
          },
        ],
      })
    );
    expect(violations.map(v => v.kind)).toContain(
      "journal_non_positive_amount"
    );
  });

  it("skips a journal entry without lines (completeness, not balance)", () => {
    const violations = evaluateInvariants(
      balancedDataset({ journalLineSums: [] })
    );
    expect(violations).toEqual([]);
  });

  it("flags a trial balance that cannot balance", () => {
    const violations = evaluateInvariants(
      balancedDataset({
        vouchers: [],
        debitSums: [],
        creditSums: [],
        journals: [],
        journalLineSums: [],
        ledgerSums: [
          { voucherId: 10, debitTotal: "500.00", creditTotal: "450.00" },
        ],
      })
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("trial_balance_unbalanced");
    expect(violations[0].scope).toBe("project");
    expect(violations[0].refId).toBe(1);
  });
});

describe("verifyAccountingAuditRow", () => {
  const row = (
    overrides: Partial<AccountingAuditRow> = {}
  ): AccountingAuditRow => ({
    id: 7,
    entityType: "accounting_invariants",
    summary: "ডাবল-এন্ট্রি অডিট: 3 প্রজেক্ট, ০ অসামঞ্জস্য",
    createdAt: new Date(),
    ...overrides,
  });

  it("fails when no run has ever been recorded", () => {
    const verdict = verifyAccountingAuditRow([]);
    expect(verdict.verified).toBe(false);
    expect(verdict.row).toBeNull();
    expect(verdict.reason).toContain("রেকর্ড নেই");
  });

  it("accepts a fresh successful run", () => {
    const verdict = verifyAccountingAuditRow([row()]);
    expect(verdict.verified).toBe(true);
    expect(verdict.row?.id).toBe(7);
  });

  it("fails when the newest run is older than the window", () => {
    const stale = row({ createdAt: new Date(Date.now() - 30 * 3_600_000) });
    const verdict = verifyAccountingAuditRow([stale]);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toContain("30");
  });

  it("fails when the newest run recorded violations", () => {
    const failed = row({
      entityType: "accounting_invariants_failed",
      summary: "ডাবল-এন্ট্রি অডিট ব্যর্থ: 3 প্রজেক্টে 2 অসামঞ্জস্য",
    });
    const verdict = verifyAccountingAuditRow([failed]);
    expect(verdict.verified).toBe(false);
    expect(verdict.reason).toBe(failed.summary);
  });
});

interface QueryChain {
  from(table: unknown): QueryChain;
  where(condition: unknown): QueryChain;
  innerJoin(table: unknown, condition: unknown): QueryChain;
  groupBy(column: unknown): QueryChain;
  then(
    onfulfilled?: ((value: unknown[]) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ): Promise<unknown>;
}

/** Every chained query resolves to the canned rows for the table it selected. */
function installDb(rowsByTable: Map<unknown, unknown[]>) {
  const makeChain = (table: unknown): QueryChain => {
    const rows = rowsByTable.get(table) ?? [];
    const chain: QueryChain = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      groupBy: () => chain,
      then: (onfulfilled, onrejected) =>
        Promise.resolve(rows).then(onfulfilled, onrejected),
    };
    return chain;
  };

  vi.mocked(getDb).mockResolvedValue({
    select: vi.fn(() => ({
      from: (table: unknown) => makeChain(table),
    })),
  } as never);
}

function cleanRows(): Map<unknown, unknown[]> {
  return new Map<unknown, unknown[]>([
    [financeProjects, [{ id: 9, name: "প্রজেক্ট" }]],
    [
      financeVouchers,
      [
        {
          id: 10,
          voucherNo: "V-1",
          status: "posted",
          totalDebit: "500.00",
          totalCredit: "500.00",
        },
      ],
    ],
    [
      financeVoucherDebits,
      [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
    ],
    [
      financeVoucherCredits,
      [{ voucherId: 10, total: "500.00", nonPositive: 0 }],
    ],
    [
      financeLedgerEntries,
      [{ voucherId: 10, debitTotal: "500.00", creditTotal: "500.00" }],
    ],
    [
      financeJournalEntries,
      [{ id: 3, voucherId: 10, totalDebit: "500.00", totalCredit: "500.00" }],
    ],
    [
      financeJournalLines,
      [
        {
          journalEntryId: 3,
          debitTotal: "500.00",
          creditTotal: "500.00",
          nonPositive: 0,
        },
      ],
    ],
  ]);
}

function mockResponse() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

const activeUser = {
  id: 5,
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
  status: "active",
  loginMethod: "password",
  lastSignedIn: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(systemActorUserId).mockResolvedValue(42);
  vi.mocked(logAudit).mockResolvedValue(undefined);
  vi.mocked(listUsersForAdmin).mockResolvedValue([activeUser] as never);
});

describe("runAccountingAudit", () => {
  it("verifies a project whose every level balances", async () => {
    installDb(cleanRows());
    const verdict = await runAccountingAudit();
    expect(verdict.verified).toBe(true);
    expect(verdict.projects).toBe(1);
    expect(verdict.violations).toBe(0);
    expect(verdict.samples).toEqual([]);
  });

  it("reports the violations of an unbalanced project", async () => {
    const rows = cleanRows();
    rows.set(financeVoucherCredits, [
      { voucherId: 10, total: "480.00", nonPositive: 0 },
    ]);
    installDb(rows);
    const verdict = await runAccountingAudit();
    expect(verdict.verified).toBe(false);
    expect(verdict.violations).toBeGreaterThan(0);
    expect(verdict.samples[0]?.projectId).toBe(9);
    expect(verdict.samples[0]?.violations.map(v => v.kind)).toContain(
      "voucher_unbalanced"
    );
    expect(verdict.reason).toContain("ভারসাম্যহীনতা");
  });

  it("cannot prove anything when no project exists", async () => {
    installDb(new Map([[financeProjects, []]]));
    const verdict = await runAccountingAudit();
    expect(verdict.verified).toBe(false);
    expect(verdict.projects).toBe(0);
    expect(verdict.reason).toContain("প্রজেক্ট");
  });
});

describe("runScheduledAccountingAudit", () => {
  it("rejects a request without the cron secret", async () => {
    vi.mocked(verifyBackupAuthorization).mockResolvedValue(false);
    const res = mockResponse();
    await runScheduledAccountingAudit({} as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ verified: false })
    );
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("records a successful run in the audit trail", async () => {
    vi.mocked(verifyBackupAuthorization).mockResolvedValue(true);
    installDb(cleanRows());
    const res = mockResponse();
    await runScheduledAccountingAudit({ query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ verified: true, projects: 1, violations: 0 })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        entityType: "accounting_invariants",
        actorUserId: 42,
      })
    );
  });

  it("answers 200 with verified:false and a failed audit row when data is unbalanced", async () => {
    vi.mocked(verifyBackupAuthorization).mockResolvedValue(true);
    const rows = cleanRows();
    rows.set(financeVoucherCredits, [
      { voucherId: 10, total: "480.00", nonPositive: 0 },
    ]);
    installDb(rows);
    const res = mockResponse();
    await runScheduledAccountingAudit({ query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ verified: false, violations: 2 })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "accounting_invariants_failed",
        summary: expect.stringContaining("অসামঞ্জস্য"),
      })
    );
  });

  it("answers 500 when the run itself fails", async () => {
    vi.mocked(verifyBackupAuthorization).mockResolvedValue(true);
    vi.mocked(getDb).mockRejectedValue(new Error("ডেটাবেস অপ্রাপ্য"));
    const res = mockResponse();
    await runScheduledAccountingAudit({ query: {} } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        verified: false,
        error: expect.stringContaining("ডেটাবেস অপ্রাপ্য"),
      })
    );
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  it("registers the endpoint for Express and the worker", () => {
    expect(readFile("./_core/app.ts")).toContain(
      'app.all("/api/scheduled/accounting-audit", runScheduledAccountingAudit)'
    );
    expect(readFile("../worker/app.ts")).toContain(
      'path: "/api/scheduled/accounting-audit"'
    );
    expect(readFile("../worker/app.ts")).toContain(
      "runScheduledAccountingAudit"
    );
  });

  it("surfaces the verdict on the health panel", () => {
    const health = readFile("./healthChecks.ts");
    expect(health).toContain('id: "accounting.invariants"');
    expect(health).toContain(
      'accountingInvariants: toRate("accounting.invariants")'
    );
    expect(health).toContain('summary.accountingInvariants !== "fail"');
    expect(health).toContain("verifyAccountingAuditRow");
  });

  it("runs daily from GitHub Actions with the cron secret only", () => {
    const workflow = readFile("../.github/workflows/accounting-audit.yml");
    expect(workflow).toContain('cron: "30 5 * * *"');
    expect(workflow).toContain(
      "secrets.CRON_SECRET || secrets.BACKUP_CRON_SECRET"
    );
    expect(workflow).toContain("jq -e '.verified == true'");
    expect(workflow).toContain("/api/scheduled/accounting-audit");
    expect(workflow).not.toContain("DATABASE_URL");
    expect(workflow).not.toContain("BACKUP_ENCRYPTION");
  });

  it("keeps the audit actions inside the schema enum", () => {
    const source = readFile("./accountingAudit.ts");
    expect(source).toContain('action: "update"');
    expect(source).toContain('"accounting_invariants"');
    expect(source).toContain('"accounting_invariants_failed"');
    // entityType is a free-form varchar, so these markers need no migration —
    // and the fixed action enum must not have grown a new value.
    const schema = readFile("../drizzle/schema.ts");
    expect(schema).not.toContain("accounting_invariants");
  });
});
