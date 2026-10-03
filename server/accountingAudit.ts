/**
 * Daily proof that the double-entry data still balances.
 *
 * The voucher path validates every line before it can be written
 * (validateVoucherInput: debits must equal credits, every amount must be
 * positive) — but the restore path writes the backup's numbers verbatim, and
 * nothing between those two paths re-checks the invariant that makes an
 * accounting system an accounting system. This module reads the balances back
 * and compares them in integer cents at every level the system maintains:
 *
 *   1. voucher lines:  Σ debits == Σ credits
 *   2. cached totals:  Σ lines == finance_vouchers.totalDebit / totalCredit
 *   3. ledger rows:    Σ finance_ledger_entries == the voucher totals it posted
 *   4. journal entry:  Σ lines == journal.totalDebit / totalCredit
 *   5. trial balance:  project-wide Σ ledger debits == Σ ledger credits
 *
 * Deliberate scope: balance only. Completeness questions (a posted voucher
 * with no ledger rows, a journal entry with no lines) belong to the backup
 * integrity check, which compares row counts against the stored manifest —
 * judging them here would flag legacy rows this code cannot repair.
 *
 * The run is cron-protected (same secret as the backup trigger: no production
 * database credential in GitHub Actions), records its verdict in `audit_logs`,
 * and the health panel reads that row back so a violated invariant shows up as
 * a failed check instead of a silently wrong balance.
 */
import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  auditLogs,
  financeJournalEntries,
  financeJournalLines,
  financeLedgerEntries,
  financeProjects,
  financeVoucherCredits,
  financeVoucherDebits,
  financeVouchers,
} from "../drizzle/schema";
import { logAudit, systemActorUserId } from "./audit";
import { databaseRequired, getDb, listUsersForAdmin } from "./db";
import { toCents } from "./money";
import { verifyBackupAuthorization } from "./scheduledBackup";

export type InvariantKind =
  | "voucher_unbalanced"
  | "voucher_totals_mismatch"
  | "non_positive_amount"
  | "journal_unbalanced"
  | "journal_non_positive_amount"
  | "ledger_mismatch"
  | "trial_balance_unbalanced";

export interface InvariantViolation {
  kind: InvariantKind;
  scope: "voucher" | "journal" | "project";
  refId: number;
  detail: string;
}

export interface VoucherLineSum {
  voucherId: number;
  total: string;
  nonPositive: number;
}

export interface InvariantDataset {
  projectId: number;
  projectName: string;
  vouchers: Array<{
    id: number;
    voucherNo: string;
    status: string;
    totalDebit: string;
    totalCredit: string;
  }>;
  debitSums: VoucherLineSum[];
  creditSums: VoucherLineSum[];
  ledgerSums: Array<{
    voucherId: number;
    debitTotal: string;
    creditTotal: string;
  }>;
  journals: Array<{
    id: number;
    voucherId: number;
    totalDebit: string;
    totalCredit: string;
  }>;
  journalLineSums: Array<{
    journalEntryId: number;
    debitTotal: string;
    creditTotal: string;
    nonPositive: number;
  }>;
}

export interface ProjectInvariantAudit {
  projectId: number;
  projectName: string;
  violations: InvariantViolation[];
}

export interface AccountingAuditVerdict {
  verified: boolean;
  reason?: string;
  projects: number;
  violations: number;
  samples: ProjectInvariantAudit[];
}

function asCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Judge one project's rows. Pure: every input is plain data, so the rules can
 * be unit-tested without a database.
 */
export function evaluateInvariants(
  data: InvariantDataset
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const debits = new Map(data.debitSums.map(row => [row.voucherId, row]));
  const credits = new Map(data.creditSums.map(row => [row.voucherId, row]));
  const ledger = new Map(data.ledgerSums.map(row => [row.voucherId, row]));
  const journalLines = new Map(
    data.journalLineSums.map(row => [row.journalEntryId, row])
  );

  for (const voucher of data.vouchers) {
    const debitCents = toCents(debits.get(voucher.id)?.total ?? "0");
    const creditCents = toCents(credits.get(voucher.id)?.total ?? "0");
    const totalDebitCents = toCents(voucher.totalDebit);
    const totalCreditCents = toCents(voucher.totalCredit);
    const nonPositive =
      asCount(debits.get(voucher.id)?.nonPositive) +
      asCount(credits.get(voucher.id)?.nonPositive);

    if (nonPositive > 0) {
      violations.push({
        kind: "non_positive_amount",
        scope: "voucher",
        refId: voucher.id,
        detail: `${voucher.voucherNo}: ${nonPositive} টি লাইন ০.০০ বা তার কম`,
      });
    }
    if (debitCents !== creditCents) {
      violations.push({
        kind: "voucher_unbalanced",
        scope: "voucher",
        refId: voucher.id,
        detail: `${voucher.voucherNo}: ডেবিট ${money(debitCents)} ≠ ক্রেডিট ${money(creditCents)}`,
      });
    }
    if (debitCents !== totalDebitCents || creditCents !== totalCreditCents) {
      violations.push({
        kind: "voucher_totals_mismatch",
        scope: "voucher",
        refId: voucher.id,
        detail:
          `${voucher.voucherNo}: লাইন ${money(debitCents)}/${money(creditCents)} ` +
          `≠ সংরক্ষিত মোট ${money(totalDebitCents)}/${money(totalCreditCents)}`,
      });
    }

    const posted = ledger.get(voucher.id);
    if (
      posted &&
      (toCents(posted.debitTotal) !== totalDebitCents ||
        toCents(posted.creditTotal) !== totalCreditCents)
    ) {
      violations.push({
        kind: "ledger_mismatch",
        scope: "voucher",
        refId: voucher.id,
        detail:
          `${voucher.voucherNo}: লেজার ${money(toCents(posted.debitTotal))}/` +
          `${money(toCents(posted.creditTotal))} ≠ ভাউচার মোট ` +
          `${money(totalDebitCents)}/${money(totalCreditCents)}`,
      });
    }
  }

  for (const journal of data.journals) {
    const lines = journalLines.get(journal.id);
    // A journal entry without lines is a completeness question, not a balance
    // one — skip it here (see the module header).
    if (!lines) continue;
    const debitCents = toCents(lines.debitTotal);
    const creditCents = toCents(lines.creditTotal);
    const nonPositive = asCount(lines.nonPositive);
    if (nonPositive > 0) {
      violations.push({
        kind: "journal_non_positive_amount",
        scope: "journal",
        refId: journal.id,
        detail: `Journal #${journal.id}: ${nonPositive} টি লাইন ০.০০ বা তার কম`,
      });
    }
    if (
      debitCents !== creditCents ||
      debitCents !== toCents(journal.totalDebit) ||
      creditCents !== toCents(journal.totalCredit)
    ) {
      violations.push({
        kind: "journal_unbalanced",
        scope: "journal",
        refId: journal.id,
        detail:
          `Journal #${journal.id}: লাইন ${money(debitCents)}/${money(creditCents)} ` +
          `≠ সংরক্ষিত মোট ${money(toCents(journal.totalDebit))}/${money(toCents(journal.totalCredit))}`,
      });
    }
  }

  const trialDebitCents = data.ledgerSums.reduce(
    (sum, row) => sum + toCents(row.debitTotal),
    0
  );
  const trialCreditCents = data.ledgerSums.reduce(
    (sum, row) => sum + toCents(row.creditTotal),
    0
  );
  if (trialDebitCents !== trialCreditCents) {
    violations.push({
      kind: "trial_balance_unbalanced",
      scope: "project",
      refId: data.projectId,
      detail:
        `Trial balance: লেজার ডেবিট ${money(trialDebitCents)} ≠ ` +
        `ক্রেডিট ${money(trialCreditCents)}`,
    });
  }

  return violations;
}

/** Read every level of one project's balances, aggregated in SQL. */
export async function loadInvariantDataset(
  projectId: number,
  projectName: string
): Promise<InvariantDataset> {
  const db = databaseRequired(await getDb());

  const vouchers = await db
    .select({
      id: financeVouchers.id,
      voucherNo: financeVouchers.voucherNo,
      status: financeVouchers.status,
      totalDebit: financeVouchers.totalDebit,
      totalCredit: financeVouchers.totalCredit,
    })
    .from(financeVouchers)
    .where(eq(financeVouchers.projectId, projectId));

  const debitSums = await db
    .select({
      voucherId: financeVoucherDebits.voucherId,
      total: sql<string>`coalesce(sum(${financeVoucherDebits.amount}), '0')`,
      nonPositive: sql<number>`sum(case when ${financeVoucherDebits.amount} <= 0 then 1 else 0 end)`,
    })
    .from(financeVoucherDebits)
    .innerJoin(
      financeVouchers,
      eq(financeVoucherDebits.voucherId, financeVouchers.id)
    )
    .where(eq(financeVouchers.projectId, projectId))
    .groupBy(financeVoucherDebits.voucherId);

  const creditSums = await db
    .select({
      voucherId: financeVoucherCredits.voucherId,
      total: sql<string>`coalesce(sum(${financeVoucherCredits.amount}), '0')`,
      nonPositive: sql<number>`sum(case when ${financeVoucherCredits.amount} <= 0 then 1 else 0 end)`,
    })
    .from(financeVoucherCredits)
    .innerJoin(
      financeVouchers,
      eq(financeVoucherCredits.voucherId, financeVouchers.id)
    )
    .where(eq(financeVouchers.projectId, projectId))
    .groupBy(financeVoucherCredits.voucherId);

  const ledgerSums = await db
    .select({
      voucherId: financeLedgerEntries.voucherId,
      debitTotal: sql<string>`coalesce(sum(case when ${financeLedgerEntries.entryType} = 'debit' then ${financeLedgerEntries.amount} else 0 end), '0')`,
      creditTotal: sql<string>`coalesce(sum(case when ${financeLedgerEntries.entryType} = 'credit' then ${financeLedgerEntries.amount} else 0 end), '0')`,
    })
    .from(financeLedgerEntries)
    .innerJoin(
      financeVouchers,
      eq(financeLedgerEntries.voucherId, financeVouchers.id)
    )
    .where(eq(financeVouchers.projectId, projectId))
    .groupBy(financeLedgerEntries.voucherId);

  const journals = await db
    .select({
      id: financeJournalEntries.id,
      voucherId: financeJournalEntries.voucherId,
      totalDebit: financeJournalEntries.totalDebit,
      totalCredit: financeJournalEntries.totalCredit,
    })
    .from(financeJournalEntries)
    .where(eq(financeJournalEntries.projectId, projectId));

  const journalLineSums = await db
    .select({
      journalEntryId: financeJournalLines.journalEntryId,
      debitTotal: sql<string>`coalesce(sum(case when ${financeJournalLines.entryType} = 'debit' then ${financeJournalLines.amount} else 0 end), '0')`,
      creditTotal: sql<string>`coalesce(sum(case when ${financeJournalLines.entryType} = 'credit' then ${financeJournalLines.amount} else 0 end), '0')`,
      nonPositive: sql<number>`sum(case when ${financeJournalLines.amount} <= 0 then 1 else 0 end)`,
    })
    .from(financeJournalLines)
    .innerJoin(
      financeJournalEntries,
      eq(financeJournalLines.journalEntryId, financeJournalEntries.id)
    )
    .where(eq(financeJournalEntries.projectId, projectId))
    .groupBy(financeJournalLines.journalEntryId);

  return {
    projectId,
    projectName,
    vouchers,
    debitSums: debitSums.map(row => ({
      voucherId: row.voucherId,
      total: row.total,
      nonPositive: asCount(row.nonPositive),
    })),
    creditSums: creditSums.map(row => ({
      voucherId: row.voucherId,
      total: row.total,
      nonPositive: asCount(row.nonPositive),
    })),
    ledgerSums,
    journals,
    journalLineSums: journalLineSums.map(row => ({
      journalEntryId: row.journalEntryId,
      debitTotal: row.debitTotal,
      creditTotal: row.creditTotal,
      nonPositive: asCount(row.nonPositive),
    })),
  };
}

export interface AccountingAuditOptions {
  userId?: number;
  projectId?: number;
  maxProjects?: number;
}

const DEFAULT_MAX_PROJECTS = 200;
const MAX_SAMPLE_VIOLATIONS = 20;

function clampMaxProjects(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_MAX_PROJECTS;
  return Math.min(parsed, 10_000);
}

function intParam(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

/**
 * Audit every active user's project (or one target). Returns a verdict whose
 * `verified` is false when no project exists to audit — an audit that checked
 * nothing has proven nothing.
 */
export async function runAccountingAudit(
  options: AccountingAuditOptions = {}
): Promise<AccountingAuditVerdict> {
  const db = databaseRequired(await getDb());
  const maxProjects = clampMaxProjects(options.maxProjects);
  const targets: Array<{ id: number; name: string }> = [];

  if (options.projectId != null) {
    const [project] = await db
      .select({ id: financeProjects.id, name: financeProjects.name })
      .from(financeProjects)
      .where(eq(financeProjects.id, options.projectId));
    if (!project) {
      return {
        verified: false,
        reason: `প্রজেক্ট #${options.projectId} পাওয়া যায়নি`,
        projects: 0,
        violations: 0,
        samples: [],
      };
    }
    targets.push({ id: project.id, name: project.name });
  } else {
    const users = (await listUsersForAdmin()).filter(
      user =>
        user.status === "active" &&
        (options.userId == null || user.id === options.userId)
    );
    for (const user of users) {
      const projects = await db
        .select({ id: financeProjects.id, name: financeProjects.name })
        .from(financeProjects)
        .where(eq(financeProjects.userId, user.id));
      targets.push(...projects.map(row => ({ id: row.id, name: row.name })));
      if (targets.length >= maxProjects) break;
    }
  }

  const scoped = targets.slice(0, maxProjects);
  if (scoped.length === 0) {
    return {
      verified: false,
      reason: "অডিট করার মতো কোনো সক্রিয় প্রজেক্ট নেই",
      projects: 0,
      violations: 0,
      samples: [],
    };
  }

  const samples: ProjectInvariantAudit[] = [];
  let violations = 0;
  for (const target of scoped) {
    const dataset = await loadInvariantDataset(target.id, target.name);
    const found = evaluateInvariants(dataset);
    violations += found.length;
    if (found.length > 0 && samples.length < MAX_SAMPLE_VIOLATIONS) {
      samples.push({
        projectId: target.id,
        projectName: target.name,
        violations: found,
      });
    }
  }

  return {
    verified: violations === 0,
    reason:
      violations === 0
        ? undefined
        : `${violations} টি ভারসাম্যহীনতা ${samples
            .slice(0, 3)
            .map(sample => sample.projectName)
            .join(", ")} প্রজেক্টে`,
    projects: scoped.length,
    violations,
    samples,
  };
}

export interface AccountingAuditRow {
  id: number;
  entityType: string;
  summary: string;
  createdAt: Date;
}

/** Newest accounting-audit rows, newest first (the health panel reads these). */
export async function latestAccountingAuditRows(
  limit = 1
): Promise<AccountingAuditRow[]> {
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      inArray(auditLogs.entityType, [
        "accounting_invariants",
        "accounting_invariants_failed",
      ])
    )
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(Math.max(Math.trunc(limit) || 1, 1), 50));
}

export interface AccountingAuditHealthVerdict {
  verified: boolean;
  reason?: string;
  row: AccountingAuditRow | null;
}

/**
 * Judge the newest audit row for the health panel. Pure so it can be
 * unit-tested: `rows` must be newest-first.
 */
export function verifyAccountingAuditRow(
  rows: AccountingAuditRow[],
  windowHours = 26,
  now: Date = new Date()
): AccountingAuditHealthVerdict {
  const row = rows[0] ?? null;
  if (!row) {
    return {
      verified: false,
      reason: "কোনো হিসাব-অডিট রেকর্ড নেই — এখনো কোনো রন হয়নি",
      row: null,
    };
  }
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt as unknown as string);
  const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  // Only "too old" fails: a row a little in the future is clock skew between
  // the app and the database, not a missing run.
  if (ageHours > windowHours) {
    return {
      verified: false,
      reason: `সর্বশেষ হিসাব-অডিট #${row.id} ${Math.round(
        ageHours
      )} ঘণ্টা আগের — দৈনিক রন রেকর্ড হয়নি`,
      row,
    };
  }
  if (row.entityType !== "accounting_invariants") {
    return { verified: false, reason: row.summary, row };
  }
  return { verified: true, row };
}

async function writeAccountingAuditRow(
  verdict: AccountingAuditVerdict
): Promise<void> {
  const actorUserId = await systemActorUserId();
  const summary = verdict.verified
    ? `ডাবল-এন্ট্রি অডিট: ${verdict.projects} প্রজেক্ট, ০ অসামঞ্জস্য`
    : `ডাবল-এন্ট্রি অডিট ব্যর্থ: ${verdict.projects} প্রজেক্টে ${verdict.violations} অসামঞ্জস্য`;
  await logAudit({
    actorUserId,
    action: "update",
    entityType: verdict.verified
      ? "accounting_invariants"
      : "accounting_invariants_failed",
    summary,
    newData: {
      projects: verdict.projects,
      violations: verdict.violations,
      samples: verdict.samples,
    },
  });
}

export async function runScheduledAccountingAudit(
  req: Request,
  res: Response
): Promise<void> {
  if (!(await verifyBackupAuthorization(req))) {
    res.status(403).json({
      success: false,
      verified: false,
      error: "অননুমোদিত অডিট অনুরোধ: ক্রন সিক্রেট আবশ্যক",
    });
    return;
  }

  const query = (req.query ?? {}) as Record<string, unknown>;
  const options: AccountingAuditOptions = {
    userId: intParam(query.userId),
    projectId: intParam(query.projectId),
    maxProjects: intParam(query.maxProjects),
  };

  try {
    const verdict = await runAccountingAudit(options);
    // The audit row is the health panel's source of truth, so a failed write
    // answers 500 instead of pretending the run happened.
    await writeAccountingAuditRow(verdict);
    res.status(200).json({
      success: true,
      verified: verdict.verified,
      reason: verdict.reason,
      projects: verdict.projects,
      violations: verdict.violations,
      samples: verdict.samples,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      verified: false,
      error: `হিসাব-অডিট চালানো যায়নি: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}
