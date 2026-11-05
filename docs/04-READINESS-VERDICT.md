# 04 — System Readiness Verdict & Remediation Roadmap

Consolidation of the four-part audit of Money_Tracker at commit `4f8e76c979acc0a79e8153d785f632c5a8211ad7` (2026-10-30). Sources: `01-CURRENT-SYSTEM-INVENTORY.md`, `02-FUNCTIONAL-ALGORITHM-AUDIT.md`, `03-SECURITY-AUTHORIZATION-AUDIT.md`. READ-ONLY audit — every recommendation below requires **owner approval** before implementation.

---

## 1. Verdict

### Is Money_Tracker ready for reliable real-world financial operations?

**Conditionally yes for single-bookkeeper use on the promoted Vercel target — with two conditions that should be closed first (W-1, R-1). It is not yet certified for multi-party, maker-class-book workflows.**

What carries the "yes":
- **Accounting core is sound.** Double-entry enforced at three independent points (Zod cents-exact, server validation, nightly 5-level invariant audit); all statements computed from one ledger source; trial balance and A = L + E identities hold and are e2e-verified against a real MariaDB; integer-cents arithmetic eliminates float drift; posted vouchers are immutable (mutations = reversal + repost).
- **The audit chain is unusually strong.** Nightly double-entry proof, nightly backup with manifest verification, weekly restore *drill* that restores-then-rolls-back, health watch, weekly maintenance report — failures surface as broken workflows/issues, not silent green.
- **Security posture is coherent.** Server-derived identity, DB-enforced row ownership everywhere, role matrix mirrored in code and DB, elevation-gated admin writes, timing-safe comparisons, strict prod CSP + allowlisted CORS, secrets only via provider env. No Critical/High findings.
- **Lifecycle discipline is enforced by CI.** Five required checks (incl. coverage 70/60/70/70 with a real DB, migration rehearsal and isolated e2e), workflow-hardening gate, dependency policy gate, protected `main`, manual gated DB migration path.

What withholds the full "yes":
1. **W-1 (P1):** in a single-owner project, humans cannot complete the approve→post path — the only possible actor is the creator who is blocked by design. Every real posting today flows through system-internal auto-posting (quick-entry/opening balances). Fine for personal self-bookkeeping; impossible for the documented maker-checker control on real books.
2. **R-1 (P1):** chart-of-accounts opening balances are user-settable, have no ledger counterpart, and are invisible to the nightly invariant audit — a one-sided opening can silently unbalance the trial balance while daily audits stay green.
3. Certification of the bank-reconciliation feature and the fiscal-period closing machinery is incomplete (static-only review; needs a disposable-DB e2e pass).

## 2. Prioritized remediation roadmap (all items require owner approval)

### P1 — close before certifying multi-user production books
| ID | Item | Where | Proposal |
|---|---|---|---|
| W-1 | Maker–Checker unreachable in single-owner projects | `db.ts` creator checks + `assertOwnedProject`; documented in `voucher-maker-checker.test.ts:318-325` | Decide: (a) approve the Maker–Approver–Poster design honoring manual reversals on the CoA side, or (b) extend project membership (household/member tables already exist for shared domains) granting a second account `voucher.approve/post` without ownership transfer. While single-owner remains, document auto-posting as the accepted control. |
| R-1 | CoA openingBalance outside ledger + audit | `routers.ts:116-126`, `db.ts:1879`, `accounting-core.ts:223-227`, `accountingAudit.ts` (no CoA import) | Reject non-zero `openingBalance` at CoA creation (force the wallet-style opening voucher), **or** extend `accountingAudit.ts` with a statement-basis reconciliation including CoA openings. Add a regression test pinning TB-vs-auditor agreement. |

### P2 — quality/robustness (next cycle)
| ID | Item | Where |
|---|---|---|
| C1b | Cash-flow classification: liabilities (loans) should be financing; code-prefix convention fragility for custom accounts | `accounting-core.ts:806-917` |
| E.1 | Fiscal close uses `lockedAt` timestamps instead of `monthKey` within period bounds | `accounting-core.ts:564-573` |
| W-2 | Document quick-entry auto-posting as the accepted SoD exception; consider a "strict mode" flag for multi-operator deployments. | `db.ts:5704,5814` |
| D-1 | Runtime-verifying bank reconciliation + period-close machinery on a disposable MariaDB (e2e) before certifying. | `finance.reconcile*`, `closeFiscalPeriod` |
| S-1 | Serverless rate-limit store (per-process counters undercount on Vercel) → KV/DB store. | `_core/rateLimiter.ts` |
| S-2 | Session TTL: 1-year cookie → shorter with sliding refresh (product decision). | `_core/sdk.ts` |

### P3 — hardening / backlog
E.2 (close requires all months locked) · E.3 (fiscal-period overlap validation) · B5 (ledger report `journalNo` always null) · D-2 (mirror-balance reconciliation in the auditor) · BR-1 (router-wide guard-coverage test) · S-3 (hash reset tokens at rest) · S-4 (`inArray` instead of `IN (${ids.join(",")})`) · S-5 (preview session mirror in sessionStorage) · duplicate-content & exception detection remain explicitly out of scope (justified in 02 §D).

## 3. Explicit NOT-VERIFIED list (runtime evidence pending)

These were reviewed statically only; certification demands a disposable-DB run (which CI has the machinery for):
- Bank reconciliations end-to-end (`finance_bank_reconciliations(_items)` workflows).
- Restore-drill + decrypt tooling against production-shaped data volumes (CI covers the drill weekly in prod itself — supported, but not re-run here).
- Full `financial-statements.e2e.ts` suite locally (requires the disposable MariaDB; superseded by CI's nightly coverage gate).
- Vercel/Worker env variance (`ENV` defaults under heat) — covered by CI placeholder env, not by this audit.

## 4. Audit-scope disclosure (read-only compliance)

- No source, schema, dependency, configuration or backup changes were made; no commits/pushes; no deployments; no test runs (all verification is static file evidence + the CI checks described from their definitions).
- **Working-tree state to reconcile with the owner** (all uncommitted):
  - `AGENTS.md` — modified by the earlier documentation session (not part of this audit).
  - `docs/01-CURRENT-SYSTEM-INVENTORY.md`, `docs/02-FUNCTIONAL-ALGORITHM-AUDIT.md`, `docs/03-SECURITY-AUTHORIZATION-AUDIT.md`, `docs/04-READINESS-VERDICT.md` — audit deliverables from this session.
  - `02-DATABASE-INTEGRITY-REPORT.md` (repo root, 323 lines) — **untracked stray this session did not author**; schema-integrity-style content consistent with another pipeline agent's output; flag for the owner to keep/move/commit per the stray-file policy.
  - `.agents/`, `.claude/`, `.mcp.json`, `skills-lock.json` — pre-existing local-only agent tooling (per AGENTS.md: do not commit).

*Owner approval is mandatory before any implementation item in §2.*
