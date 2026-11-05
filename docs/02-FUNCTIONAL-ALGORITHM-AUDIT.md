# 02 — Functional & Algorithm Audit

Evidence-based audit of the accounting/financial functionality of Money_Tracker at commit `4f8e76c979acc0a79e8153d785f632c5a8211ad7` (2026-10-30). **READ-ONLY** — no code, schema, dependency or configuration was changed; findings require owner approval before any implementation.

**Method note:** conclusions are drawn from direct reads of `server/db.ts`, `server/accounting-core.ts`, `server/routers.ts`, `server/accountingAudit.ts`, `server/money.ts`, `drizzle/schema.ts`, and the pinned test suites. Features named differently from the audit brief (e.g. "vouchers" for journals, "quick transactions" for the flat engine) were mapped rather than flagged missing.

**Classification legend:** `EXISTING` · `PARTIAL` · `MISSING` · `NOT REQUIRED` · `NOT VERIFIED` (needs runtime evidence not available in a static, DB-less audit).

---

## A. Financial Transaction Engine

| # | Requirement | Verdict | Evidence / notes |
|---|---|---|---|
| A1 | Double-entry accounting | **EXISTING** | Every posting is a voucher with debit+credit lines; balance enforced three times: Zod `superRefine` in exact cents (`server/routers.ts:104-113`), `validateVoucherInput` (`server/db.ts:1171-1198`, incl. positivity and "no direct posted vouchers" guard `:1192`), and daily 5-level re-audit (`server/accountingAudit.ts`). |
| A2 | Debit/Credit balancing | **EXISTING** | Voucher-level Σdeb=Σcred at insert; project-wide ledger Σdeb=Σcred proof (`accountingAudit.ts:233 trial_balance_unbalanced`). |
| A3 | Voucher creation & validation | **EXISTING** | `createVoucher` (`routers.ts:950`) gated `voucher.create` + rate limit 50/15min + `idempotent`; amounts `z.number().finite().positive().max(999999999999.99)`; dates ≤30 days ahead. |
| A4 | Journal generation | **EXISTING** | `postVoucherInternals` writes `finance_journal_entries` (`JE-%08d`) + `finance_journal_lines` with `totalDebit/totalCredit` (`server/db.ts:1558-1589`). |
| A5 | General Ledger posting | **EXISTING** | `finance_ledger_entries` per CoA account with `entryType`, `amount`, `runningBalance`, `postedAt` (`db.ts:1539-1547`); accounts locked `FOR UPDATE` in sorted-id order (deadlock-safe) `:1503-1512`. |
| A6 | Account balance calculation | **EXISTING** | Reports aggregate ledger in integer cents (`accounting-core.ts:101-153`); incremental CoA `currentBalance` maintained at posting (`db.ts:1524-1538`). |
| A7 | Transaction atomicity | **EXISTING** | All mutations inside `db.transaction`; posting transition + ledger + journal + audit in one tx (`db.ts:1614-1692`); reversal voucher + status flip + audit in one tx (`:2815-2912`). |
| A8 | Duplicate transaction prevention | **EXISTING** | Two independent layers: middleware idempotency table `(userId,idempotencyKey)` unique, INSERT-first claim with request-hash conflict detection (`server/_core/idempotency.ts:76-163`); transaction-level unique index + SHA-256 fingerprint of normalized payload (cents-normalized) (`db.ts:5751-5788`; migration 0018). |
| A9 | Rounding / decimal precision | **EXISTING** | `decimal(18,2)` columns; integer-cents discipline (`server/money.ts`, header documents the IEEE-754 ban); precision tests incl. 10,000 micro-transactions and DECIMAL max (`accounting-core.test.ts:858-899`). Legacy `decimal(15,2)` drift repaired by migration 0016. |
| A10 | Idempotency & retry safety | **EXISTING** | `idempotent` middleware on create/submit/approve/post/reverse/update/delete/settle/invoices/advances; outcomes claimed/in_progress/replay/conflict; TTL 24h + purge; claims released on handler failure so clients can retry (`_core/idempotency.ts:289-304`). |
| A11 | Concurrent posting protection | **EXISTING** | Preflight + in-tx re-read with `SELECT … FOR UPDATE`; conditional CAS updates `WHERE status = <expected>` + `affectedRows` checks on every transition (submit/approve/post/reverse, `db.ts:1364/1440/1666/2885`); deterministic lock ordering; `seed-race.e2e.ts`, `concurrent-operations.test.ts`. |
| A12 | Period locking | **PARTIAL** | Month locks (`finance_period_locks`) gate create/post/update/reverse via `assertPeriodNotLockedTx` (`db.ts:1121-1143`, locks lock-row `FOR UPDATE`). Gaps (see §E.1–E.3): fiscal-period close counts locked months by `finance_period_locks.lockedAt` (a timestamp, not a month key) `accounting-core.ts:564-573`; close does not require all months in the period to be locked; fiscal-period creation has no overlap validation. |
| A13 | Reversal handling | **EXISTING** | Single-use reversal (existing-reversal check `FOR UPDATE` `:2844-2854`), mirrored posted voucher (debits↔credits swapped, `voucherType:"reversal"`), original flipped to `reversed` with CAS guard; self-reversal blocked (`:2840-2842`); wallet-opening restatement reuses the same machinery with an explicit, audited `enforceSelfCheck:false` exception. |
| A14 | Immutable posted transactions | **EXISTING** | No edit path for posted vouchers; `status:"posted"` direct creation requires `_internalPostedBy` ("no direct posted vouchers" `db.ts:1192-1196`). Quick-entry update/delete = reverse + repost, audited as approved SoD exception (`db.ts:5924, 6020`). Manual reversal still requires `voucher.reverse` permission. |

**Engine conclusion:** the core posting engine is substantially complete and strongly guarded. The one partially-implemented area is *period/fiscal-year* management (A12), not the posting path.

## B. Accounting Reports

All in `server/accounting-core.ts`; route-gated `accounting.read`; ownership enforced per call.

| # | Requirement | Verdict | Evidence / notes |
|---|---|---|---|
| B1 | Trial Balance | **EXISTING** | `generateTrialBalance` (`:205-269`); normal/contra column placement; summed in cents; `isBalanced` at <1 cent. Cumulative TB in the combined report by explicit design (`:478-483`) so TB and balance sheet share `to`-as-of basis. |
| B2 | Income Statement | **EXISTING** | `generateIncomeStatement` (`:279-336`); net income = revenue − expenses; period-scoped correctly; profit/loss and contra handling unit-tested (`accounting-core.test.ts:395-464`). |
| B3 | Balance Sheet | **EXISTING** | `generateBalanceSheet` (`:355-465`); derived retained earnings folds cumulative P&L into equity (real 3200 account when present, `:340-344, 427-448`); `assets == liabilities + equity` at <1 cent; IDOR/precontra cases tested incl. e2e (`accounting-core.test.ts:465-655`, `financial-statements.e2e.ts:117-215`). |
| B4 | Cash Flow Statement | **PARTIAL** | Indirect method exists (`generateCashFlowStatement`, `:795-973`) and opening/closing/netChange are internally consistent (closing derived as opening + Σsections). Two classification weaknesses: (1) *all* non-cash liabilities (incl. loans) are folded into **operating** (`:850-861`) although the module's own comment promises loans in financing; the financing section contains only equity movements (`:899-917`). (2) Cash/investing/operating segmentation relies on **account code prefix conventions** (`11*` cash; `13xx–19xx` investing); user-created canonical accounts may use arbitrary codes, so custom accounts can be misclassified. |
| B5 | Account Ledger | **PARTIAL** | `generateAccountLedger` (`:655-758`) returns history with running balances; but `journalNo` is always `null` and the SELECT carries a placeholder narration field (`:705`) — the ledger report does not join `finance_journal_entries` even though the data exists. Functionally usable; presentation-grade data is incomplete. |
| B6 | Opening/closing balances | **EXISTING** | Opening balances are ledger vouchers (Dr Cash / Cr Capital; overdraft flips sides) with exactly one live voucher per wallet, restatement = reverse+repost (`db.ts:5197-5343`); idempotent backfill (`:5356-5411`) verified by e2e incl. repeat-run idempotency (`financial-statements.e2e.ts:232-315`). |

| Cross-check | Verdict | Evidence |
|---|---|---|
| Total Debit = Total Credit (within any report) | **EXISTING** (ledger basis) | TB identitypolice + auditor level 5. **But see finding R-1** below: direct CoA `openingBalance` (creation-time input, `routers.ts:116-126`) is included in TB/BS without a ledger counterpart, so the standing reports can disagree with the ledger-only audit. |
| Assets = Liabilities + Equity | **EXISTING** | Enforced by folding P&L into equity and asserted `isBalanced`; e2e "balances every statement…" + "ties TB/IS/BS after a transaction". |
| Report totals reconcile with the underlying ledger | **EXISTING with one gap (R-1)** | Statements are computed from the same `finance_ledger_entries`; daily auditor re-proves voucher↔total↔ledger↔journal↔project-TB in cents (`accountingAudit.ts:44-51`). The auditor does **not** include CoA `openingBalance` in its project-TB check (it imports no `financeChartOfAccounts`), so creation-time opening balances are outside automated reconciliation (Finding R-1). |

| # | Requirement | Verdict | Notes |
|---|---|---|---|
| B7 | Date-range calculations | **EXISTING** | Range filters on voucher date; cash-flow opening position computed as "everything before `from`" (`:925-943`); combined report documents the TB-cumulative/IS-period split deliberately. |
| B8 | Fiscal-year transitions | **PARTIAL** | `finance_fiscal_periods` exist with create/list/close (`:496-594`), but there is no year-end close algorithm (no closing entries moving P&L to equity), close uses `lockedAt` windows instead of month keys, and closing does not require every month in the period to be locked (see §A12, §E.1-E.2). Balance-sheet retained-earnings derivation papers over the absence of closing entries for statement purposes. |

## C. Workflow Lifecycle (DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED)

| # | Requirement | Verdict | Evidence / notes |
|---|---|---|---|
| C1 | Valid state transitions | **EXISTING** | `assertVoucherTransition` map: draft→submitted; submitted→approved\|draft; approved→posted\|draft; posted→reversed (`db.ts:1317-1339`); schema enum matches. |
| C2 | Invalid transition rejection | **EXISTING** | Guard checked preflight *and* inside the tx, plus CAS `WHERE status=<expected>` + `affectedRows` as TOCTOU backstop; bilingual rejection messages; transition-race tests in `voucher-lifecycle.test.ts` / `voucher-maker-checker.test.ts`. |
| C3 | Self-approval prevention | **EXISTING** | Creator cannot approve (`db.ts:1425-1433`, message "নিজের তৈরি ভাউচার নিজে অনুমোদন কা য়াবে না"), cannot post (`:1612-1613, 1629-1630`), cannot reverse (`:2840-2842`); submitter cannot approve their own submission (4-eyes, `:1431-1434`); pinned by `self-approval-prevention.test.ts`, `self-reversal-sod.test.ts`. System-internal restatements (wallet opening, quick-entry edit) use an explicit `enforceSelfCheck:false`/`_internalPostedBy` bypass — narrowly scoped, but they mean a **user's own quick transaction is auto-posted without approval** by design (see finding W-2). |
| C4 | Creator/approver separation | **EXISTING (2-user)** · **UNREACHABLE (1-user)** | Permission layer separates roles (`voucher.approve/post/reverse` only ACCOUNTING_ADMIN/SUPER_ADMIN; MANAGER approves but cannot post). Architecture limitation, documented in `voucher-maker-checker.test.ts:318-325`: projects have a single owner (`assertOwnedProject` keys on `projects.userId`), so in a sole-owner project the positive M→A→P path cannot be completed by humans at all — the only actor is always the creator. Multi-actor workflows need either a second authorized user on the same project or the pending "Maker–Approver–Poster" design (Finding W-1). |
| C5 | Posting permissions | **EXISTING** | Route gate `voucher.post` + rate limit 30/15min (`routers.ts:794`) + row-level ownership + creator check + period lock. |
| C6 | Reversal authorization | **EXISTING** | `voucher.reverse` + rate limit 20/15min + single-use + creator check + period lock on reversal date. |
| C7 | Transaction history | **EXISTING** | Immutable `finance_voucher_audit` trail (FK `ON DELETE RESTRICT`, schema.ts:641) written inside each transition tx; plus append-only audit log via `logAudit`. |
| C8 | Audit logging | **EXISTING** | Both transition-scoped snapshots (`{from,to}`, reversal refs/reason) and application-level audit entries with IP context (`extractAuditContext`); permission denials audited (`authz.ts:11-30`). |
| C9 | Recovery from interrupted operations | **PARTIAL** | Atomic transactions guarantee no partial posted state; failed handlers release idempotency claims for retry (`idempotency.ts:289-304`). There is no dedicated stuck-transaction recovery tool, but a stuck invocation would surface in the daily invariant audit and blocking rows are detectable; acceptable, not a separate algorithm. |
| C10 | Race conditions | **EXISTING** | CAS + pessimistic locks + sorted lock order; voucher-number race uses settings-row lock with conditional update + retry (`claimNextVoucher`, `db.ts:1062-1099`); seed race exercised by e2e (`seed-race.e2e.ts`). |
| C11 | Workflow bypasses | **EXISTING (except documented exception)** | Route-gate + row-checks + "no directly posted vouchers" (`db.ts:1192-1196`) leave exactly two deliberate bypasses: (1) `_internalPostedBy` system postings (opening balances, quick vouchers), (2) the maker-checker impossibility in single-owner projects (W-1). `updateTransaction`/`deleteTransaction` restatement is a third, audited exception (quick-entry self-service). |

## D. Additional algorithms — are they genuinely required?

| Algorithm | Verdict | Justification |
|---|---|---|
| Automated consistency validation | **EXISTING** | `accountingAudit.ts` proves 5 invariants daily in cents; verdicts land in `audit_logs` + health panel; nightly workflow fails on any violation. Restore path is the acknowledged risk it guards. |
| Balance verification (TB ↔ statements ↔ ledger) | **EXISTING** | Reports share one ledger source; identities asserted per report; e2e ties TB/IS/BS to a real DB. Gap only for CoA opening balances (R-1). |
| Financial reconciliation (bank/statement) | **PARTIAL / NOT VERIFIED** | `finance_bank_reconciliations(_items)` tables + `createBankReconciliation` exist (`db.ts:2982`, routers `finance.reconcile*` family), but their workflow completeness (matching algorithm, item clearance against ledger, drift detection) was not runtime-verified in this static audit; needs an e2e/DB-backed pass before certifying. |
| Wallet/GL mirror reconciliation (finance_accounts.currentBalance & CoA.currentBalance vs ledger) | **PARTIAL** | `currentBalance` is maintained incrementally at posting, and the e2e "reconciles a freshly created wallet against the ledger" (`financial-statements.e2e.ts:217`) bridges wallet↔ledger; but the daily auditor does not re-check the kickered mirror balances against ledger sums, so out-of-band writes (manual SQL, restore anomaly) could drift undetected between drills. |
| Financial-period closing (true close) | **PARTIAL** | As §B8: `closeFiscalPeriod` flips status but does not (a) verify all months locked, (b) write closing entries; statements remain correct via derived retained earnings. For real bookkeeping (audited books, multi-year tax filing) a true period-close algorithm with automatic P&L→equity close entries is a justified future upgrade, not an immediate P0. |
| Duplicate *detection* (same substance, no idempotency key) | **NOT REQUIRED (now)** | Idempotency keys + fingerprint cover retry/refresh duplication, the dominant failure mode; heuristic "same amount/date/narration" duplicate detection would add false positives for legitimately repeated expenses. Revisit only if user complaint(data) shows manual double entry. |
| Exception detection (suspect patterns) | **MISSING (justified priority: P3)** | Nothing scans for e.g. off-hours postings, round-trip transfers, above-threshold spikes. The business scale (personal/small-business BDT bookkeeping) makes this a nice-to-have; the invariant auditor + maker-checker already cover integrity, so this adds fraud-detection value, not correctness value. |
| Transaction rollback safety | **EXISTING** | All-or-nothing transactions; restore drill performs a real restore then rolls back; failures release idempotency claims; FK restrict prevents orphaning history. |
| Recovery & replay safeguards | **EXISTING (partial ledger)** | Replay = idempotent middleware replay of stored response; offline client sync replays batches (`syncOfflineTransactions`, ≤500). No event-replay/"replay the ledger from vouchers" reconstruction tool exists (GET-backup export serves that need manually). |

## E. Consolidated findings (require owner approval to act)

| ID | Sev | Finding | Recommend (after approval) |
|---|---|---|---|
| R-1 | **P1** | CoA `openingBalance` is user-settable at account creation (`routers.ts:116-126`, `db.ts:1879-1880`) and is included in TB/BS as a static opening, but has no ledger counterpart and is invisible to the daily invariant auditor (ledger-only). A one-sided opening silently unbalances `Total Debit = Total Credit` while the nightly audit stays green — breaking the core auditability guarantee. | Either reject nonzero `openingBalance` on CoA creation (force the opening-voucher path used by wallets), or extend `accountingAudit.ts` to reconcile statement-basis balances (including CoA openings) against the ledger. |
| W-1 | P1 (functional) | In single-owner projects the human approve→post path is unreachable: the only possible actor is the owner who is always the creator (`assertOwnedProject` + creator checks); positive lifecycle only occurs through system-internal postings. Documented in `voucher-maker-checker.test.ts:318-325` as "Maker–Approver–Poster proposal pending". | Approve the Maker–Approver–Poster design or grant a second role within a project (households/members tables already exist for shared domains) before enforcing real maker-checker on production books. |
| C1b | P2 | Cash-flow classification: all liabilities (loans, long-term) in *operating*; financing holds only equity; code-prefix-based classification is convention-dependent (`accounting-core.ts:806-917`). | Reclassify liability account types into financing (or per-account classification column), and treat custom accounts' cash-detection explicitly. |
| E.1 | P2 | `closeFiscalPeriod` counts locked months by `finance_period_locks.lockedAt` timestamps instead of `monthKey` within `[startDate,endDate]` (`accounting-core.ts:564-573`). | Match on `monthKey` derived from period bounds. |
| E.2 | P3 | Period close doesn't require all months locked; no year-end close entries. | Gate close on `COUNT(monthKey in period) == COUNT(locked)`; optional closing-entry generation. |
| E.3 | P3 | `createFiscalPeriod` accepts overlapping periods. | Overlap validation + audit. |
| B5 | P3 | Account ledger report: `journalNo` always null; SELECT narration placeholder retained (`accounting-core.ts:705, 732`). | Join journal entries for source-of-entry traceability. |
| W-2 | P2 (design review) | Quick-entry path auto-posts the actor's own transaction to the ledger without approval (`canonicalQuickVoucherInTx`, `db.ts:5704`,`5814-5838`). It's the deliberate everyday UX, and `accounting.create` is a server-enforced permission, but it is a SoD exception inherent to the product design (self-bookkeeping). | Keep, but document explicitly as the product's accepted control; consider a configurable "strict mode" for multi-operator deployments. |
| D-1 | P2 | Bank/statement reconciliation feature depth (`finance_bank_reconciliations(_items)`) not runtime-verified in this audit. | Run a DB-backed e2e pass (needs disposable MariaDB) before certifying for real-world use. |
| D-2 | P3 | Wallet/CoA `currentBalance` mirrors not covered by the daily invariant audit (only posting-time updates + e2e bridge test). | Add a mirror-vs-ledger reconciliation pass to `accountingAudit.ts`. |

### What is confirmed *not* broken (high-confidence)

- Double-entry integrity of the posting engine (three independent enforcement points + 5-level nightly audit + e2e reconciliation on a real DB).
- Immutability of posted vouchers (no edit path; restatement always via reversal with CAS guards).
- Self-approval / maker-checker rejection logic for multi-actor deployments.
- Opening-balance ledger bridge for wallets (single live opening voucher per wallet; restatement idempotent).
- Money precision (integer cents end-to-end; DECIMAL(18,2)).
- Ownership scoping (IDOR rejected across all report generators and mutations; server-derived userId).
- Race-safety of the transition machinery (CAS + FOR UPDATE + deterministic ordering; race tests).

## F. Readiness statement (functional scope)

The transaction engine, double-entry model, report generation (TB/IS/BS/Ledger), and the voucher state machine are **implemented and test-pinned at a level suitable for real bookkeeping**, with two open functional gaps that should be resolved before relying on multi-party review controls: (W-1) single-owner projects cannot exercise human approve→post, and (R-1) direct CoA opening balances are outside both the ledger's balancing rule and the automated audit. Remaining items (cash-flow classification fidelity, fiscal-close rigor, ledger-report completeness, reconciliation depth) are quality upgrades rather than correctness blockers, except where listed P2 above.

*Everything above must be treated as findings pending owner approval — no code change has been made in this audit (owner-approval gate honored).*
