# 05 — Post-Remediation Audit & Runtime Certification

Read-only re-audit of the tree after the remediation roadmap in
`docs/04-READINESS-VERDICT.md` was completed. Base of that audit:
`4f8e76c` (2026-10-30). This pass runs at `51b6cae` + the certification
branch (2026-11-08): **20 commits, 3 merged PRs** (`#283`, `#284`, `#285`).
F-1 shipped in PR #286 (`fcbd117`); F-2/F-3 shipped in the follow-up
`remediation/f2-f3` branch.

Scope of this pass (owner-approved "do it all"):
1. Runtime certification of the items listed in `04` §3 ("NOT-VERIFIED").
2. A fresh re-ranking of what is left after P1–P3 remediation.
3. Fix of any P0/P1 defect the certification uncovers.

`01`–`04` remain the historical audit of the base commit; this document is
the current state of record.

---

## 1. Verdict

**No open code P0/P1.** One cross-tenant P1 defect was found by the new
certification e2e and fixed in this cycle (F-1). The two P2 scalability risks
in the backup/restore path (F-2, F-3) were fixed in the follow-up cycle and
re-measured: a 210k-row project now backs up and drills on Node's **default
2 GB heap** (peak 533 MB) with a 90 s restore instead of OOM / 732 s.

**F-7 (2026-11-10, production incident):** the live dashboard failed because
migrations 0020–0024 were never applied to the production TiDB database and
the manual reconciler could not apply 0023/0024 even if dispatched. The code
and process fix is in this PR; the production apply is owner-gated and was
still pending at publication.

Everything from the `04` roadmap is merged and CI-green:

| Row | Items | Evidence |
|---|---|---|
| P1 | W-1, R-1 | PR #283, merged `31f8081` |
| P2 | C1b, E.1, W-2, D-1, S-1, S-2 | PR #284, merged `ef0aee6` |
| P3 | E.2, E.3, B5, D-2, BR-1, S-3, S-4, S-5 | PR #285, merged `51b6cae` |
| F-1 | Cross-tenant reconciliation authZ | PR #286, merged `fcbd117` |
| F-2/F-3 | Backup memory ceiling + batched restore | `remediation/f2-f3` |

---

## 2. New findings (ranked)

### F-1 — P1 — Cross-tenant tampering of bank-reconciliation items — **FIXED this cycle**

Before the fix, `matchBankReconciliationItem` and
`unmatchBankReconciliationItem` loaded the item **by bare id**
(`where(eq(financeBankReconciliationItems.id, itemId))`), then updated it and
recalculated the owning reconciliation. `assertOwnedProject` only covered the
`projectId` the attacker passed in, so any signed-in project owner who knew a
sequential item id could match/unmatch another user's statement line and
mutate that user's reconciliation arithmetic. `addBankReconciliationItem`
also accepted any `ledgerEntryId` without verifying it belonged to the same
bank account/project.

Evidence: the new `server/bank-reconciliation.e2e.ts` attacks this path with
a second real user and asserts the item is untouched; it failed against the
old lookup (before the patch the attack mutated the victim row) and passes
with the fix.

Fix (`server/db.ts`):
- `loadScopedReconciliationItem` joins `finance_bank_reconciliations` and
  filters on `userId` **and** `projectId`; both mutations use it.
- `assertReconciliationLedgerScope` requires the ledger entry to belong to
  the reconciliation's account and the caller's project, for both
  `addBankReconciliationItem` (pre-match) and `matchBankReconciliationItem`.
- Certification e2e: full happy path + cross-account match rejection +
  cross-tenant match/unmatch/read/create rejection + victim-row integrity +
  completion tolerance boundary (0.01 allowed, 0.02 blocked) + list ordering.

### F-2 — P2 — Backup/restore memory ceiling — **FIXED**

Measured with the real path (`executeCloudBackup` → encrypt → upload →
download → decrypt → `restoreProjectBackup`), only the Supabase HTTP
transport mocked:

| Project rows | Payload | Node heap needed | Result |
|---|---|---|---|
| 70,008 | 46.4 MB | default 2 GB | pass (backup 76 s, drill 260 s) |
| 210,008 | 139.7 MB | **>2 GB — OOM at default** | pass only with `--max-old-space-size=6144` (backup 251 s, drill 732 s) |

Root causes and fixes (all in the production path):

- **Hex codec was the actual OOM trigger.** `bytesToHex` appended one
  character at a time, so encrypting a 49 MB plaintext built a cons-string
  rope with ~49M nodes (~1.5 GB). It now uses `Buffer.toString("hex")` on
  Node and a flat chunked encoder elsewhere; `hexToBytes` uses a nibble
  table instead of one `slice` + `parseInt` per byte.
- **Serialization copies.** Export queries run one at a time
  (`settleSequentially`) instead of `Promise.all`; plaintext and
  verify-checksum use compact JSON; `toArrayBuffer` reuses whole-buffer
  views instead of slicing.
- **Compatibility.** Verification accepts the legacy indented checksum on
  mismatch, so backups written before this change still verify.

Re-measured after the fix at the same 210k rows / 30k vouchers:

| Node heap | Backup | Drill | Peak heap |
|---|---|---|---|
| default 2 GB | 60.5 s | 89.6 s | 533 MB |
| 4 GB | 35.1 s | 18.4 s | — |

`verified: true`, 19 tables, manifest counts equal, clean rollback/cleanup.
Remaining caveat: the export still holds the whole project in memory, so
scaling is now ~linear with a much smaller constant — very large projects
(low millions of rows) would still need a streaming export.

### F-3 — P2 — Restore is row-by-row inside one transaction — **FIXED**

`restoreProjectBackup` issued one `INSERT` per row and one `UPDATE` per
account/category mapping: 210,008 rows → **732 s** restore inside a single
rollback transaction.

It now inserts in 500-row batches (`insertRestoreBatch`), re-resolves child
ids from natural keys (account name, category name+type, CoA/voucher/journal
number, fiscal-period name, account-group code) or an ordered select — never
from guessed contiguous ids — and inserts transactions after their CoA and
voucher parents exist, which removes the two late `UPDATE` passes. Parent
links (CoA, account groups) are attached after the batch insert. Low-volume
child tables (dues, settlements, budgets, bills, recurring, audit,
references, reversals) stay row-by-row because some lack a natural key.
Measured drop: **732 s → 90 s** at the default 2 GB heap (18 s at 4 GB).

### F-4 — P3 — Completion-tolerance inconsistency

`recalculateReconciliation` auto-sets `status = "completed"` when the
difference is exactly 0 cents, while `completeBankReconciliation` accepts a
**1-cent** difference (`Math.abs(cents) > 1` throws) and stamps the actor.
So a 0.01 difference can be "completed" by an explicit call but not by a
match-triggered recalc. Pick one rule (0 or 1 cent) and assert it in the e2e
that already pins the boundary.

### F-5 — P3 — Reconciliation model double-count question

`createBankReconciliation` snapshots `bookBalance = account.currentBalance`
(which already includes posted deposits), then `recalculateReconciliation`
adds matched debits and subtracts matched credits to that snapshot. When the
matched entry is already in the book balance, matching it again shifts the
difference by that amount — the lifecycle e2e relies on this ("statement
2000 vs book 1500, match the 500 deposit → 0"). It is a coherent
"items explain the statement-vs-book gap" model, but it must be documented
explicitly for the accounting owner, or a user who matches an already-posted
line will see an inverted difference. No code change made without an
accounting decision.

### F-6 — P3 — Two moderate dev-tooling advisories — **FIXED**

`pnpm audit` reported 2 moderate: `glob` 13.0.6 (GHSA-3g3m-2fjr-6pw4) and
`minimatch` 10.2.6 (GHSA-g3hv-75wg-m249, DoS). Neither has a fixed release on
its current major (`glob ≥14.0.2`, `minimatch ≥11.0.1`), so
`DEPENDENCY-POLICY.md` required explicit owner approval — granted for F-6.

Fix: targeted pnpm overrides, no direct dependency ranges changed:

| Chain | Override |
|---|---|
| `@sentry/bundler-plugins>glob`, `@vercel/nft>glob` | `14.0.4` |
| `minimatch@10` (eslint config-array, typescript-estree, vercel CLI) | `11.0.5` |

Compatibility review: Sentry bundler-plugins and `@vercel/nft` only call the
`glob()` function; eslint's `@eslint/config-array` uses
`new Minimatch(...).match()` and `@typescript-eslint/typescript-estree` uses
`minimatch()`, all retained in minimatch 11. All consumers are dev tooling.
`pnpm audit` now reports **0 vulnerabilities** (`--audit-level=high` gate
passes); lint, build, coverage, migrations, e2e and worker suites all green.

### F-7 — P0 operational — Production schema drift (0020–0024 unapplied) — **FIXED in code; owner apply pending**

On 2026-11-10 the deployed dashboard failed with
`Failed query: select ... from finance_project_members ...`.
`listProjects` (`server/db.ts:3588`) joins `finance_project_members`
(migration `0023`, W-1), but production was last reconciled on **2026-09-28**
(run `36481157449`, target `github_sample` on TiDB Cloud) when the
reconciler chain ended at `0019`. Migrations `0020`–`0024` were never applied.

Compounding defect: `scripts/reconcile-migrations.mjs` hardcoded the chain
through `0022`, so the documented remediation path would also have skipped
`0023` (`finance_project_members`, `finance_vouchers.createdBy`) and `0024`
(`rate_limit_counters`).

Production impact until applied: dashboard load for every user
(`listProjects`); voucher list/create/export (`createdBy`); firm profile
(`0020`); and all DB-backed rate limiting on Vercel including OAuth login
callbacks and rate-limited mutations (`0024`, 1146).

Fix (this PR):
- the reconciler derives the chain from `drizzle/meta/_journal.json` and
  fails if a journal entry has no SQL file;
- `verify-migrations.mjs` derives every created table / added column from the
  journal and fails the rehearsal when the reconciler output is missing any;
- the schema report includes the three new tables.

Evidence (disposable MariaDB): a database reconciled only through `0022`
reproduces errors `1146` / `1054` for the dashboard query, `createdBy` and
`rate_limit_counters`; after the fix it matches a `drizzle-kit migrate`
reference (50/50 tables, 125 FKs) and all queries succeed. The new guard
fails against the old reconciler with
`missing journal tables: finance_project_members, rate_limit_counters`
and passes after. Gate: `pnpm check`, `pnpm build`, `pnpm test:coverage`
(72.40/63.81/72.37/73.70), `pnpm test:migrations` (125 FKs),
`pnpm test:e2e:isolated` (7 files / 38 tests), `pnpm test:worker` (22).

Production remediation (owner-only — agents keep prod read-only):
1. Merge this PR, or dispatch the workflow on this branch; `main`'s
   reconciler still stops at `0022`.
2. Confirm the GitHub `PROD_DATABASE_URL` secret matches Vercel Production.
   The workflow reads only that secret: the legacy generic `DATABASE_URL`
   secret is a PostgreSQL URL and no longer shadows it (F-7 follow-up).
3. Dispatch `DB Schema Reconcile (manual)` with `mode=dry-run`; confirm the
   `Target:` host/database and review the 0020–0024 plan (`0021`→`0022` is a
   harmless create/drop of `drive_connections`).
4. Re-dispatch with `mode=apply` and `confirm=APPLY-TO-PROD`.
5. Verify dashboard, vouchers, firm profile and login; expect 125 FKs.

---

## 3. Runtime certification evidence (`04` §3 items)

### 3.1 Bank reconciliation — CERTIFIED

`server/bank-reconciliation.e2e.ts` (new) + existing
`server/finance-lifecycle.e2e.ts` run against a real disposable MariaDB:

- create → add line → match → unmatch → complete with the difference gate
  (existing suite), plus notes/joins/list ordering, 0.01 vs 0.02 boundary,
  same-account enforcement, and cross-tenant isolation of every item path.
- `pnpm test:e2e:isolated`: **7 files / 38 tests passed**.

### 3.2 Restore drill at volume — CERTIFIED LOCALLY, cloud transport pending

Local rehearsal exercised the full production drill code with only the
Supabase HTTP transport mocked (list + put + get):

| Run | Rows | Payload | Backup | Drill | Verified | Rollback |
|---|---|---|---|---|---|---|
| smoke | 148 | 100 KB | 0.4 s | 0.4 s | ✅ 19 tables, counts equal | ✅ no rows left, DB dropped |
| mid | 70,008 | 46.4 MB | 76.3 s | 259.6 s | ✅ 19 tables, counts equal | ✅ no rows left, DB dropped |
| target | 210,008 | 139.7 MB | 251.4 s | 732.1 s | ✅ 19 tables, counts equal | ✅ no rows left, DB dropped |

Checksum chain: the drill matched the downloaded object against the
`cloud_backup` audit row (`fileName`, SHA-256, recorded `recordCounts`) and
the restored row counts equaled the manifest across all 19 counted tables.
Real Supabase/S3 transport remains exercised only by the weekly CI drill —
that part is unchanged and still NOT-VERIFIED locally.

### 3.3 Remaining not-verified

- Real cloud storage transport for the drill (CI weekly job; mock used locally).
- Playwright browser matrix (CI only; unsupported on this host).
- Production Vercel/Worker env variance under load.
- Projects larger than 210k rows (see F-2/F-3 scaling).

---

## 4. Fresh re-audit checklist

| Area | Result |
|---|---|
| Ownership scoping | Heuristic scan of every `db.ts` function taking `userId`: **0** without an ownership filter/assertion. F-1 was the one real gap and is fixed. |
| Raw SQL | 13 `sql\`` uses in `db.ts`, all parameterized (`values()`, decimal arithmetic); no id interpolation (S-4 pinned by test). |
| Skipped tests / TODO | 0 skipped tests, 0 TODO/FIXME in product code. |
| AuthN/AuthZ | AuthZ stays server-side; guard-coverage scan (BR-1) covers 139 procedures; no client-supplied user ids. |
| Accounting invariants | Double-entry, immutable postings, TB/A=L+E e2e, mirror-drift audit (D-2), fiscal-close gates (E.1/E.2/E.3). |
| Migrations | Rehearsal green (125 FKs, temp DB removed) and now journal-derived, so the reconciler cannot skip a migration. No new migrations since 0024. |
| CI gates | 5 required checks green on `main`; workflow hardening + dependency policy gates intact. |
| Dependencies | No high/critical; 2 moderate dev advisories fixed via major overrides (F-6), `pnpm audit` = 0. |
| Backups/ops | Daily encrypted backup + manifest + weekly drill + retention/prune + maintenance report all present; 210k-row drill verified on the default 2 GB heap after F-2/F-3. |
| Docs | `01`–`04` current to 2026-11-05; this document is the post-remediation record. |

---

## 5. Method & disclosure

- Read-only for the existing tree: no schema, migration, dependency or
  configuration changes; no production database or cloud bucket touched.
- Runtime work used disposable local MariaDB databases on `127.0.0.1:3307`
  created and dropped by the harness; the restore rehearsal used a mock
  Supabase HTTP server in-process.
- The F-1 authorization fix shipped in the certification cycle; F-2/F-3
  (batched restore, bounded export memory, hex codec) shipped in the
  follow-up cycle — both through the normal PR/CI gate with owner approval.
- Rehearsal scripts live outside the repo (`/tmp/opencode`), so no strays.
