# ATLAS REPORT — Phase 1 (Financial Data Integrity)

**Agent:** ATLAS (Nemotron 3 Ultra Free role)
**Date:** 2026-10-06
**Scope:** schema, migrations, vouchers/ledger/journal, invariants, idempotency, ownership. Read-only.

## Verification results

| Invariant | Status | Evidence |
|---|---|---|
| ΣDEBIT == ΣCREDIT at entry | ✅ Enforced | integer-cents equality at create (`server/db.ts:1154`), router `superRefine` (`server/routers.ts:103-114`) |
| ΣDEBIT == ΣCREDIT at post | ⚠️ Gap | `postVoucher` re-reads lines but never re-asserts equality (`db.ts:1573-1600`); covered transitively only because lines are immutable post-create. Recommend asserting in `postVoucherInternals` (`db.ts:1492-1499`). Restore path plants lines verbatim (`db.ts:7667-7668`). |
| POSTED immutable | ✅ | Only status-transition updates exist (`db.ts:1330,1395,1602,2810`); zero update/delete on lines/ledger/journal in `server/` |
| Reversal preserves history | ✅ | `reverseVoucherInTx` (`db.ts:2739-2836`) posts opposite voucher atomically, keeps both in reports; unique reversal index |
| Atomic posting | ✅ | `postVoucher` tx `db.ts:1556-1627`; FOR UPDATE locks incl. CoA rows in sorted order (deadlock-safe) |
| Decimal safety | ✅ | `decimal(18,2)` columns, integer-cents math (`server/money.ts:17-40`); minor float round-trips only for transport |
| Idempotency | ⚠️ Partial | Router middleware (`_core/trpc.ts:272-370`) on createVoucher/postVoucher; DB-level on createTransaction (`db.ts:5622-5690`, unique idx). **Gap: `settleDue` (`routers.ts:1376-1389`) has no idempotency key** — retry can double-settle while `outstandingAmount >= amount` holds. |
| Lifecycle DRAFT→SUBMITTED→APPROVED→POSTED→REVERSED | ✅ | `assertVoucherTransition` (`db.ts:1292-1302`); maker≠checker enforced (self-approve `:1380-1387`, self-post `:1554`, self-reverse `:2764`); direct posted creation blocked (`:1166-1170`); internal flows use `_internalPostedBy` |
| Period lock | ⚠️ Gap | Checked at create (`:1180`), reverse (`:2767`), update/delete tx (`:5796`) — **NOT at post**. A voucher approved in an open month can be posted after that month locks. Fix: `assertPeriodNotLockedTx(voucher.date)` in post tx. |
| Ownership scoping | ✅ | Every entry point asserts `assertOwnedProject` (`:1310,1363,1540,2847,5610`); user+project filters on all lookups and reports (`accounting-core.ts:110-115,660-664`) |
| Voucher numbering | ✅ | `claimNextVoucher` CAS + row lock + 3 retries (`db.ts:1036-1073`), unique `(projectId, voucherNo)` index backstop |

## Red flags

1. **P1** Period-lock gap at posting (above).
2. **P1** `settleDue` not idempotent (above).
3. **P2** Restore path skips balance validation (`db.ts:7667`); compensated only by daily `accountingAudit.ts` (`:154-171` flags `voucher_unbalanced`, `voucher_totals_mismatch`, `ledger_mismatch`, `trial_balance_unbalanced`).
4. **P2** No post-time re-validation of Σdr==Σcr (above).
5. **P2 (latent)** Cascade asymmetry: `financeVoucherDebits/Credits.voucherId` cascade (`schema.ts:437,463`) while ledger/journal/audit use `restrict`; posted vouchers are safe, but draft delete cascades lines. Align to `restrict` for defense-in-depth.
6. **P3** `integrityCheck.ts` = row counts only; corruption detection relies solely on `accountingAudit.ts` — don't conflate operationally.

## Migrations / DB

- 20 migrations present (`drizzle/0000`–`0019`), incl. `0014_rbac_and_idempotency`, `0015_fk-restrict-financial-history`, `0016_schema_drift_repair`, `0018_canonical_accounts_and_transaction_idempotency`. FK `restrict` on financial history is correct direction.
- `db:push` = `generate && migrate`; rehearsal via `pnpm test:migrations` against disposable DB — **not run** (no disposable DB provisioned in this environment). Must run in GUARDIAN phase.

## Unchanged-by-me constraint honored

- No `DROP TABLE`, `TRUNCATE`, no rewrite of migration history, no source edits. Working tree dirty state acknowledged (`server/db.ts` modified!) — ATLAS recommends the triage queue from the task matrix be completed before any new migration or voucher-path edit.

## Recommendations for FORGE/SENTINEL/GUARDIAN

- FORGE: add `.use(idempotent)` + key to `settleDue`; add period-lock assertion in `postVoucherInternals` path.
- GUARDIAN: migration rehearsal against MySQL/MariaDB disposable DB; add tests for post-time balance assertion and late-lock posting.
