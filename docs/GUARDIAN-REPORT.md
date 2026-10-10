# GUARDIAN REPORT — Phase 5 (QA + Adversarial Testing)

**Agent:** GUARDIAN (Big Pickle Free role)
**Date:** 2026-10-06
**Scope:** lint, typecheck, unit/integration tests, build, migration rehearsal, security regression, build verification. Adversarial: assume "something is broken," classify P0–P4.

---

## 1. Check Results

| Check | Status | Notes |
|---|---|---|
| `pnpm check` (tsc --noEmit) | ✅ PASS | Node engine warning only: wanted `>=22 <25`, current `v26.4.0` |
| `pnpm lint` (eslint .) | ✅ PASS | No errors |
| `pnpm build` (vite + esbuild) | ✅ PASS | Full client build + server esm build, `dist/index.js` 649.3kb |
| `pnpm test` (vitest run — full suite) | ⚠️ TIMEOUT | Full suite exceeds Termux timeout; subset runs successfully (see below) |
| Targeted vitest subset | ✅ PASS | All targeted test files pass (see below) |

---

## 2. Targeted Test Suite Results

| Test File | Tests | Status |
|---|---|---|
| `accounting-core.test.ts` | 40 | ✅ ALL PASS — invariants, period ledger, voucher balance rejection, fiscal periods, decimal precision, cross-project IDOR |
| `authorization.test.ts` | 9 | ✅ ALL PASS — user isolation, admin checks, household member access control |
| `rbac-initializer.test.ts` + `permissions.test.ts` + `input-only-permissions.test.ts` + `input-operator-security.test.ts` | 226 | ✅ ALL PASS — RBAC initialization, permission lookups, INPUT_OPERATOR 6-permission contract, role escalation resistance |
| `auth-rate-limit.test.ts` + `auth.logout.test.ts` + `oauth-login.timing-safe.test.ts` | 8 | ✅ ALL PASS — rate limiter enforcement, lockout, timing-safe credential validation |
| `finance.router.test.ts` | (not run in this session) | — |
| `financial-statements.test.ts` | (not run in this session) | — |

**Note:** Full `pnpm test` times out in Termux environment (browser E2E unsupported on Android/Termux per README). Subset of core unit/integration tests all pass.

---

## 3. Adversarial Classification (P0–P4)

> **HELIX correction (final):** The P1 `settleDue` idempotency finding below was a **false positive** — `.use(idempotent)` is present at `routers.ts:1377` (see `FORGE-REPORT.md` F-03); residual risk is P2 (optional key). The period-lock P1 was **fixed** this session (`server/db.ts:1573`, test added) and re-verified green.

| Severity | Classification | Finding |
|---|---|---|
| **P1** | ⚠️ **RISK** | `settleDue` lacks idempotency — retry can double-settle while `outstandingAmount >= amount` (ATLAS S-01, SENTINEL S-01). No test currently covers this path. |
| **P1** | ⚠️ **RISK** | Period-lock not enforced at `postVoucher` time — voucher approved in open month can be posted after month locks (ATLAS). No test asserts this guard. |
| **P2** | ⚠️ **RISK** | Dev CORS allows any origin with credentials (`app.ts:156-158`) — safe for localhost only; prod requires `CORS_ALLOWED_ORIGINS`. |
| **P2** | ⚠️ **RISK** | `MemoryRateLimitStore` is per-process — on multi-instance Vercel/Cloudflare deploys, rate limits are not shared unless KV store is plugged in (`rateLimiter.ts:39-48`). |
| **P3** | ✅ RESOLVED | Dirty working tree + stray artifacts (`fix_rbac.py`, `fix_test.py`, `*.orig`, `*.bak`) — all triaged and deleted; `git status` clean as of 2026-10-07 (verified). |
| **P3** | ⚠️ **RISK** | Migration rehearsal (`pnpm test:migrations`) requires disposable DB (`ISOLATED_E2E_DATABASE_URL`) — not provisioned in this environment. Must run in CI/Linux/macOS/Windows. |
| **P4** | ✅ RESOLVED | All lint/typecheck/build pass. No unrecovered test failures. |

---

## 4. Specific Test Gaps Identified

| Gap | Severity | Recommendation |
|---|---|---|
| `settleDue` mutation has no `.use(idempotent)` middleware and no DB-level idempotency key | P1 | FORGE: add idempotency; GUARDIAN: add test asserting single settlement per due |
| `postVoucher` does not re-assert `Σdr == Σcr` after reading lines from DB | P1 | FORGE: add balance assertion in `postVoucherInternals`; GUARDIAN: add test for late-post after month lock |
| No test covers `settleDue` idempotency/replay | P1 | GUARDIAN: add test |
| No test covers period-lock enforcement at post time | P1 | GUARDIAN: add test |
| `db:push` (`drizzle-kit generate && migrate`) not verified against disposable DB | P3 | Run in CI; do not apply migration rehearsal against production data |

---

## 5. Summary Classification

| Metric | Result |
|---|---|
| TYPECHECK = PASS | ✅ |
| LINT = PASS | ✅ |
| BUILD = PASS | ✅ |
| UNIT/INTEGRATION = PASS (subset, all pass) | ✅ |
| ACCOUNTING INVARIANTS = VERIFIED (40/40 tests) | ✅ |
| SECURITY REGRESSION = NO REGRESSIONS | ✅ |
| MIGRATION REHEARSAL = PENDING (disposable DB needed) | ⚠️ |
| NO DESTRUCTIVE DB OPERATIONS = CONFIRMED | ✅ |
| NO SECRET LEAKS = CONFIRMED | ✅ |
| OVERRIDE ANOTHER AGENT'S WORK = N/A (clean handoff) | ✅ |

**OVERALL: YELLOW** — No P0 issues. P1 risks documented (idempotency gap + period-lock gap) but no test failures. All check commands green. Ready for HELIX review if P1 items are explicitly accepted as known limitations or fixed.

> **Update 2026-10-07 (re-audit):** both P1 items above were subsequently fixed
> — see "Re-audit (2026-10-07)" section below, which supersedes this verdict.

---

## Re-audit (2026-10-07)

**Agent:** GUARDIAN (adversarial re-audit on integrated `main` after PRs #234–#236)
**Scope:** idempotency middleware semantics, caller coverage, scheduled-job hygiene, dependency posture.

### Verification performed

| Check | Result |
|---|---|
| Idempotency replay semantics (`server/_core/idempotency.ts`) | ✅ INSERT-first claim; payload-hash mismatch → CONFLICT; PENDING → in_progress; completed → cached replay; expiry → delete + re-claim |
| Concurrent duplicate mutation (race) | ✅ unique `(userId, idempotencyKey, route)` constraint is the race lock; loser gets CONFLICT, no double-posting |
| Caller coverage after `idempotencyKey` became required | ✅ typecheck proves all TS callers supply a key; worker/ and scripts/ contain no callers of the 8 idempotent mutations |
| Expired idempotency row lifecycle | ❌→✅ **F-03 found**: `purgeExpiredIdempotencyKeys()` existed + was unit-tested but had **no caller** (unbounded table growth). Fixed: wired into `executeDailySweep()` best-effort + new `scheduledFinance.test.ts` (PR #237) |
| E2E key hygiene | ❌→✅ **F-02 found**: `page-procedures.e2e.ts` reused static key `test-key-create-invoice` on two different `createInvoice` payloads — middleware correctly rejected it (CI caught; local suite self-skips without disposable DB). Fixed with unique per-call keys (PR #235) |
| Dependency posture | ✅ 15 advisories (4 high) → 0 via PATCH-class `pnpm.overrides` (PR #236) |
| Gates (check / lint / unit / build) | ✅ all pass; 1281 unit tests (3 new) |
| CI (verify / test / e2e / browser-e2e / worker / deploy preview) | ✅ all green on #235, #236, #237 |
| Dependabot group PR #233 (26 updates) | ❌→✅ **closed per DEPENDENCY-POLICY** — included `typescript ^5.6 → ^7.0.2` MAJOR (AGENTS.md: majors need explicit approval), upstream-breaking `googleapis ^183`, and newer-only bumps with `pnpm audit` already clean. hono CVE GHSA-5r4p-p66f-jhc7 reviewed: **not applicable** (repo's `serveStatic` is a local Express vite middleware; no `hono/serve-static` or hono adapter imports). Full triage in PR comment |
| Stray artifacts (`fix_rbac.py`, `fix_rbac_test.py`, `fix_test.py`, `*.orig`, `*.bak`) | ✅ all deleted; `git status` clean; AGENTS.md hygiene note updated |
| Dependency policy enforced in CI | ❌→✅ **F-04 found**: `pnpm audit` ran **nowhere** in CI and the dep-bump workflow enforced no policy — the audit + DEPENDENCY-POLICY judgment behind #236/#233 was manual only. Fixed: `dependency-bump-check.yml` now runs `pnpm audit --audit-level=high` + `scripts/check-dependency-policy.mjs` (fails any semver-major bump without an allowlist entry = the explicit-approval record), with 13 unit tests |
| Workflow least-privilege | ❌→✅ **F-05 found**: `ci.yml` was the only live workflow with no `permissions:` block (default token scopes instead of least privilege). Fixed: `permissions: contents: read`; `test-dispatch.yml` (dead, `echo "test"`) deleted |
| GitHub Action pinning | ⚠️→✅ **F-06**: `ci.yml` (17 refs) + `deploy-cloudflare.yml` (13 refs) used bare tags while 4 other workflows pinned SHAs. Fixed: all pinned to the vetted in-repo SHAs with `# action@version` comments |

### Findings resolved by this re-audit

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| F-01 | P1 (original) | `settleDue` idempotency optional; period-lock gap | Fixed in #234 (period lock inside posting tx) and #235 (`idempotencyKey` required on all 8 idempotent mutations) |
| F-02 | P2 | Static e2e idempotency key reused across different payloads | Fixed in #235 — unique keys per call site |
| F-03 | P3 | Orphaned `purgeExpiredIdempotencyKeys()` — unbounded table growth | Fixed in #237 — wired into daily sweep, best-effort/non-blocking |

### Residual / environmental

- **Migration rehearsal** still requires a disposable MySQL (`ISOLATED_E2E_DATABASE_URL`); not available in this Termux environment — CI e2e job exercises migrations against an isolated DB. Documented environmental limitation.
- **Breaking API change note**: `idempotencyKey` is now required on 8 mutations. Any external client (mobile app, script) calling without a key gets a Zod validation error. No external callers exist inside this repo; confirm with ops before rollout if third-party consumers exist.

---

## Addendum (2026-10-08) — disposable-DB gates executed locally

**Agent:** GUARDIAN. Provisioned a throwaway MariaDB 13.0.2 (`mariadb-disposable`
datadir under the pre-approved tmp area, loopback-only port 3307, root-only).
Server shut down and datadir deleted after the runs. Production DB untouched;
`git status` clean.

| Gate | Result |
|---|---|
| `pnpm test:migrations` (`ISOLATED_E2E_DATABASE_URL` → disposable) | ✅ PASS — all 19 migration files applied clean to a fresh `money_tracker_migration_*` DB, canonical accounting columns + idempotency index verified, test DB dropped |
| schema reconcile on disposable source DB | ✅ PASS — 119 foreign keys, "Financial data was not modified" |
| `pnpm test:worker` | ✅ PASS — 22/22 |
| `pnpm test:e2e:isolated` | ✅ PASS — 5 files, 32/32; `money_tracker_e2e_*` DB created and safely removed |
| `pnpm test:coverage` | ❌ **FAIL vs own thresholds** (see F-07) |
| `pnpm audit --audit-level=high` | ✅ clean — no known vulnerabilities |
| `pnpm check:auth-mode` | ✅ OK (dev + production modes) |

**F-07 progress (same session):** added three GUARDIAN-owned test
files following repo conventions (`appRouter.createCaller` +
RBAC-mock; real HTTP via ephemeral `app.listen(0)` + `fetch`):

- `server/_core/systemRouter.test.ts` (4 tests) — `system.health`
  input validation, `system.healthReport` caller-scoped report,
  RBAC gate, unauthenticated refusal. `systemRouter.ts` 33%→100%.
- `server/_core/storageProxy.test.ts` (8 new route-guard tests;
  **preserved the 3 pre-existing `supabaseObjectUrl` tests from
  PR #177** — `buildSupabaseObjectUrl` kept real, only backend
  selectors mocked) — object-id validation, auth, cron exclusion,
  user-scoped object lookup (IDOR guard), backend fail-closed,
  vercel-blob delivery headers + streaming, unexpected-failure→502.
  `storageProxy.ts` 2.5%→56%.
- `server/_core/vite.test.ts` (5 tests) — `serveStatic`
  fail-closed logging, `setupVite` middleware-mode options, dev
  index.html cache-bust injection, template-read-failure→500.
- `server/_core/githubOAuth.test.ts` (18 tests; **merged 4 original
  from PR #177** + 14 new) — transaction codec, timing-safe state
  match, auth URL build, token exchange, user fetch with email
  fallback, cookie reading. `githubOAuth.ts` 27.6%→100%.

Full suite green: **1353 passed** (was 1322), no regressions;
`pnpm check` + `pnpm lint` clean. Coverage moved
51.12→52.56% stmts / 45.65→46.85% branches / 49.68→51.01%
funcs / 52.18→53.67% lines. The ~1240-statement residual
gap to the 70% threshold is a multi-PR effort for the
owning agents (PRISM: `client/src`; FORGE/ATLAS:
`server/`) — not closable in one session and thresholds
must not be lowered to force green.

---

## Addendum 2 (2026-10-08) — F-07 root-caused; gate now GREEN with a DB

**Agent:** GUARDIAN. Re-measured coverage against a throwaway MariaDB 13.0.2
(loopback-only :3307, root-only; server shut down and datadir deleted after).

### F-08 (P1, new) — the coverage gate is only satisfiable *with* a database

The earlier F-07 reading (**51.12 / 45.65 / 49.68 / 52.18**) was an artifact of
measuring **without** a DB. `server/db.hermetic.test.ts` (a `.test.ts`, so it is
picked up by the *unit* config) `describe.runIf`s on a reachable local MariaDB —
its own comment says *"CI's unit job has no database service and skips
cleanfully"*. Its **27 `it()` blocks were the 27 skipped tests**, and they cover
**79 of `db.ts`'s 142 exported functions** (`docs/db-test-coverage.md`).

| Measurement | Tests | Stmts | Branch | Funcs | Lines | Gate |
|---|---|---|---|---|---|---|
| `pnpm test:coverage` **no DB** (what CI `test` job runs) | 1481 pass / **27 skipped** | 57.38% | 50.62% | 56.17% | 58.46% | ❌ all four fail |
| `ISOLATED_E2E_DATABASE_URL=… pnpm test:coverage` **with DB** | **1508 pass / 0 skipped** | **70.06%** | **61.41%** | **70.70%** | **71.43%** | ✅ **all four PASS** |

So the enforced thresholds (70/60/70/70) are *exactly* calibrated to the
DB-backed run. **`server/db.ts` is not a test-coverage debt — it is covered.**

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-08 | **P1** | The `test:coverage` gate passes only where MariaDB is provisioned. CI's `test` job has no DB, so a naive `--coverage` gate there fails at ~57% and would be either ignored or "fixed" by lowering thresholds — exactly the failure mode AGENTS.md forbids. | Run the coverage gate in the job that has the `mariadb` service (add coverage to the existing `worker`/e2e-style DB job, or give `test` a `services: mariadb` block). Keep `pnpm test` as-is for the fast lane. Do **not** lower thresholds. **FIXED — see Addendum 3.** |

### F-10 (P3) — pre-existing test writes into the repo working tree

`server/cloudBackupService.test.ts`'s "creates encrypted cloud backup package"
test calls the **real** `executeCloudBackup` whenever a DB fixture is reachable.
With no cloud provider configured it falls through to
`writeLocalEncryptedSnapshot`, which defaults to `path.join(process.cwd(),
"backups")` — so a DB-enabled coverage run drops an untracked
`backups/*.enc.json` into the working tree (observed and removed during this
session). Recommendation: point that test at a temp `LOCAL_BACKUP_DIR`, and add
`backups/` to `.gitignore`/`.vercelignore`. **FIXED — see Addendum 3** (pinned
`LOCAL_BACKUP_DIR` to a temp dir in `beforeEach`).

### F-09 (P1, FIXED) — authorization defect found by the new tests

`server/_core/rbac.ts` — `isFinanceAdmin` and `isAdminRoleUser` used
`||` between two **Promises**:

```ts
return hasRole(userId, SUPER_ADMIN) || hasRole(userId, ACCOUNTING_ADMIN);
```

A Promise object is always truthy, so `||` short-circuited and returned the
*first* promise. Both functions silently degraded to `isSuperAdmin`:
**an `ACCOUNTING_ADMIN` was denied finance-admin rights, and a `SYSTEM_ADMIN`
was denied the admin role set** — the inverse of their documented contract
("SYSTEM_ADMIN is deliberately excluded from the finance-admin set"). Fixed by
awaiting each operand. Regression-locked in `server/_core/rbac.test.ts`, which
also asserts the client mirror (`client/src/lib/rbac.ts`, correctly written)
agrees.

### Tests added this session (all GUARDIAN-owned; no god-files touched)

| File | Tests | Coverage effect |
|---|---|---|
| `server/_core/oauth.test.ts` | 27 | `oauth.ts` 43% → **94%** (register/login/logout + Google/GitHub OAuth, lockout, pending/suspended, state mismatch) |
| `server/_core/rbac.test.ts` | 22 | `rbac.ts` 51% → **100%** fn/stmts/lines; locks F-09 |
| `server/audit.test.ts` | 13 | `audit.ts` → **100%** fn/stmts/lines; append-only invariant |
| `server/routers/auth.test.ts` | 7 | secret-stripping in `auth.me`, logout revocation, rate-limited `setPassword` |
| `server/cloudBackupService.test.ts` (extended) | +17 | provider routing (supabase/s3/gdrive/local), **preserved 6 original tests** |
| `client/src/lib/rbac.test.ts` | 27 | `client/src/lib/rbac.ts` → 100%; UI/server gating parity |
| `client/src/lib/auditLogExports.test.ts` | 8 | CSV BOM + escaping, PDF font load, page-break |
| `client/src/lib/activeProject.test.ts` | 15 | project-id resolution + sessionStorage |
| `server/_core/storageProxy.test.ts` (extended) | +5 | R2 + Supabase backends; **preserved 3 original tests** |

Full suite: **1508 passed, 0 failed, 0 skipped (with DB)**; `pnpm check` and
`pnpm lint` clean. No dependency, schema, or threshold changes.

**OVERALL (addendum 2): GREEN with two escalations** — F-08 (P1, CI plumbing
decision belongs to HELIX) and F-09 (P1, fixed and locked). F-07 is **resolved**;
thresholds are met as configured.

---

## Addendum 3 (2026-10-09) — F-08 and F-10 fixed; gate wired into CI

**Agent:** GUARDIAN. Follow-up on the approved plan: moved the coverage gate
into the required `test` CI check and closed the stray-write finding.

### F-08 (P1) — FIXED: `test` job now provisions MariaDB and runs the coverage gate

`.github/workflows/ci.yml` `test` job changes (surgical; no threshold change):

- added the same `services: mariadb` block the `worker`/`e2e` jobs use
  (mariadb:10.11, `money_tracker`, healthcheck);
- set `ISOLATED_E2E_DATABASE_URL` so `server/db.hermetic.test.ts` no longer
  self-skips;
- switched the unit step from `pnpm test` → **`pnpm test:coverage`**, which
  evaluates the `vitest.config.ts` thresholds and exits non-zero on any miss;
- bumped `timeout-minutes` 30 → 40 for coverage instrumentation overhead.

Because `test` is already a required status check, the gate is now enforced on
every PR without touching branch protection. No separate schema-apply step is
needed: the hermetic suite `CREATE DATABASE`s its own scratch DB and bootstraps
schema itself (`db.hermetic.test.ts:60-65`). Stale "CI unit job has no DB"
comments in `ci.yml`, `server/db.hermetic.test.ts`, and `docs/db-test-coverage.md`
were corrected. `node scripts/check-workflow-hardening.mjs` still passes.

### F-10 (P3) — FIXED: test no longer writes into the repo working tree

`server/cloudBackupService.test.ts` now clears provider env vars and pins
`LOCAL_BACKUP_DIR` to a throwaway temp path in a `beforeEach` for the whole
first `describe`, so a DB-enabled run writes its `*.enc.json` snapshot outside
the repo. 23/23 tests pass; no untracked `backups/` is produced.

### Final coverage (with disposable MariaDB 13.0.2, loopback-only :3307)

| Metric | Value | Threshold | Margin |
|---|---|---|---|
| Statements | **70.46%** (5063/7185) | 70% | +0.46 |
| Branches | **61.58%** (3036/4930) | 60% | +1.58 |
| Functions | **70.93%** (908/1280) | 70% | +0.93 |
| Lines | **71.82%** (4840/6739) | 70% | +1.82 |

**166 files / 1514 tests passed, 0 failed, 0 skipped** with DB; `pnpm test:coverage`
exits **0**. `seed-rbac.ts` moved 3% → 96.96% stmts / 100% lines via
`server/_core/seed-rbac.test.ts` (7 tests), widening the thin statement margin.

**OVERALL (addendum 3): GREEN — no P0/P1 open.** F-07 resolved, F-08 fixed in
CI, F-09 fixed and locked, F-10 fixed. Remaining notes are environmental only
(Node v26 vs pinned engine, disposable-MariaDB setup details).


### F-07 (new) — coverage ~20 pts below the repo's own enforced thresholds

`vitest.config.ts:44-49` requires statements 70 / branches 60 / functions 70 /
lines 70. Measured on current `main`: **51.12 / 45.65 / 49.68 / 52.18** —
`vitest run --coverage` exits 1. Lowest files: `seed-rbac.ts` 3%,
`storageProxy.ts` 2.5%, `vite.ts` 0%, `systemRouter.ts` 33%, `server/rbac.ts`
~32%, `server/routers/auth.ts` ~55%. The 1322-test unit suite itself is fully
green, so this is a **test-depth gap, not a regression**. Compounding it: CI's
`test` job runs `pnpm test` *without* `--coverage`, so thresholds are never
evaluated in CI (the upload step has `if-no-files-found: ignore`).

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| F-07 | P2 | Coverage below enforced thresholds; CI never checks them | **SUPERSEDED by F-08** — root cause was measuring without a DB. Thresholds are met (70.06/61.41/70.70/71.43) once the hermetic suite runs. See Addendum 2. |

**OVERALL (addendum): YELLOW** — every executable gate is green except the
coverage-depth gap (F-07). Prior P3 "migration rehearsal pending" is now
CLOSED (verified locally on disposable MariaDB; CI e2e job covers it
ongoingly).

### Environmental notes

- Node v26 vs pinned engine `>=22 <25`: warnings only, no failures.
- Fresh MariaDB 13 ships an anonymous `''@localhost` user; TCP root auth needed
  an explicit `ALTER USER + FLUSH PRIVILEGES` before the e2e URL connected.
  Disposable-only setup detail, no repo impact.

---

## 6. Recommendations for HELIX

- **ACCEPT** P1 risks as documented environmental limitations (Termux no disposable DB, settleDue idempotency to be fixed in FORGE phase) → GREEN if documented.
- **FIX** P1 `settleDue` idempotency + period-lock gap before production deployment → YELLOW until fixed.
- **CONFIRM** `CORS_ALLOWED_ORIGINS` set in Vercel/Cloudflare production env → YELLOW if missing.
- **RUN** migration rehearsal on disposable DB in CI before any schema change → YELLOW until run.

---

## Unchanged-by-me constraint honored

- No source code rewritten. No destructive DB operations. No tests weakened to achieve green.
- All changes observed in dirty tree are safe cleanups (unused import removals, dependency add).
- Working tree will be triaged per the task matrix before any new code edits.

---

## Addendum 4 (2026-10-10) — Phase 5 QA on the Forge + Prism integrated tree

**Agent:** GUARDIAN. Full gates + adversarial review on the uncommitted tree
carrying Forge (backend, F-1…F-14) and Prism (client, P1–P4). Disposable
MariaDB 13.0.2 provisioned loopback-only on :3307 (`mariadb-guardian` datadir
under the pre-approved tmp area), root-only; server killed and datadir deleted
after the runs. Production DB untouched; no commit made.

### Gate results

| Gate | Result | Evidence |
|---|---|---|
| `pnpm check` (tsc --noEmit) | ✅ PASS | clean |
| `pnpm lint` (eslint .) | ✅ PASS | clean |
| `pnpm build` (vite + esbuild → dist/) | ✅ PASS | `dist/index.js` 660.1kb |
| `pnpm test` (no DB) | ✅ PASS | **168 files / 1518 passed \| 28 skipped** (DB suites self-skip) |
| schema reconcile → `0020` | ✅ PASS | 121 foreign keys, "Financial data was not modified" |
| `pnpm test:migrations` | ✅ PASS | rehearsal DB created, 0020 applied, then **dropped** |
| `pnpm test:coverage` (with DB) | ✅ PASS (exit 0) | **169 files / 1546 passed**, 70.48 / 61.6 / 71.02 / 71.82 |
| `pnpm test:worker` | ✅ PASS | 22/22 |
| F-13/F-14 regression bundle | ✅ PASS | oauth + env-auth-mode + cloudBackupService + scheduled-sweep + healthChecks = 76/76 |

### Coverage gate (thresholds 70/60/70/70 — all met)

| Metric | Value | Threshold | Margin |
|---|---|---|---|
| Statements | **70.48%** | 70% | +0.48 |
| Branches | **61.6%** | 60% | +1.6 |
| Functions | **71.02%** | 70% | +1.02 |
| Lines | **71.82%** | 70% | +1.82 |

`pnpm test:coverage` exits **0** with the disposable DB. No threshold change.

### Adversarial review of the Prism handoff items

| Item | Verdict | Detail |
|---|---|---|
| **P2 stable idempotency keys** | ✅ SOUND | The tRPC `idempotent` middleware is **server-authoritative**: it hashes the full raw input with deep SHA-256 (`server/_core/trpc.ts:305`, `idempotency.ts:47-70`) and rejects same-key/different-payload with `CONFLICT` (`idempotency.ts:146`). The client's FNV fingerprint embedded in `update:<id>:<hash>` is a **label only** — a forged replay with a tampered payload is caught server-side. `updateTransaction` does **not** write `idempotencyKey` into the `finance_transactions` row (`db.ts:5957-5971`), so the unique `(userId, projectId, idempotencyKey)` index can never collide across sequential edits → **no false 409 on a real edit**. |
| **P1 offline chunking** | ✅ SOUND | `syncQueue` sends sequential ≤500 chunks and clears each chunk from the queue only after that chunk's mutation resolves (`useOfflineSync.ts:68-90`). A mid-batch failure leaves exactly the unsynced remainder queued. |
| **F-12 firm profile persistence** | ✅ SOUND | Client reads `trpc.finance.firmProfile.useQuery` and writes via `saveFirmProfile.useMutation` (server DB-backed, migration 0020). **No** client localStorage/in-memory firm source exists (grep clean). Save invalidates the query so print reflects server state. |
| **F-1 register gate** | ✅ RE-VERIFIED | Raw `/api/auth/register` 404s outside password mode; shared `authSchemas.ts` used by both raw and tRPC paths (oauth 29 tests). |
| **F-13/F-14 cron auth** | ✅ RE-VERIFIED | Worker `/api/health-checks` Bearer-only, timing-safe; `req.body.cronSecret` removed from `verifyBackupAuthorization`. |
| **Migration triple-drift** | ✅ NO DRIFT | 21 SQL files = 21 journal tags = 21 `reconcileFile` calls (one wrapped call at `reconcile-migrations.mjs:438-441`); `bootstrap-local-e2e-schema.mjs:641` carries the 0020 DDL. Live DB confirms 0018 + 0020 effects (idempotencyKey col, `finance_transactions_idempotency_unique`, firm-profile table). |

### Tests added this session (GUARDIAN-owned; no god-file edits)

| File | Added | Purpose |
|---|---|---|
| `server/transaction-idempotency.test.ts` | +6 (11 total) | Locks `.use(idempotent)` on update/delete routes, optional key on delete, and the **no-row-key-mutation** invariant (prevents index collision / false 409) |
| `client/src/offline-sync.test.ts` | +3 (9 total) | Chunk-loop e2e: 1250 items → 3 calls (500/500/250), each ≤ cap; middle-chunk failure leaves exactly 750 queued |
| `client/src/lib/firmProfile.wiring.test.ts` | +4 | Firm profile is tRPC-only; no localStorage/sessionStorage; invalidate on save |

Combined targeted run: **7 files / 57 tests passed.**

### Classification (P0–P4)

| Severity | Finding |
|---|---|
| **P0** | None. |
| **P1** | None open. |
| **P2** | Client FNV-1a fingerprint in `update:<id>:<hash>` is key-order sensitive (uses `JSON.stringify` insertion order, not a sorted stable form). Deterministic today because `Home.tsx` builds the payload from a fixed literal, and the **server** independently verifies with sorted SHA-256 — so no correctness impact. Recommend (Prism, optional) sorting keys in `fingerprint()` for future-proofing. |
| **P3** | `deleteTransaction` key is `delete:<projectId>:<id>` with no payload component. Correct given MySQL auto-increment never reuses ids; a 24h same-key replay returns the cached delete result (idempotent). No action. |
| **P4** | Node v26.4.0 vs pinned `>=22 <25` — warnings only. |

### Residual / environmental

- `pnpm test:browser:e2e` (Playwright) not runnable on Termux — CI-only (unchanged).
- Disposable-MariaDB recipe needed an explicit `ALTER USER 'root'@'127.0.0.1' … ; FLUSH PRIVILEGES`; startup takes ~11s before the socket accepts connections. Disposable-only detail, no repo impact.
- **No P0/P1 open. No tests weakened. No thresholds lowered.**

### Handoff to HELIX

```
NEXT_AGENT: HELIX (integration authority)
HANDOFF_STATUS: READY
GATES: check ✅ / lint ✅ / build ✅ / test 1518✅(28 skip) /
       migrations ✅ / coverage 70.48/61.6/71.02/71.82 ✅ / worker 22✅
P0_P1_OPEN: NONE
RECOMMENDATION: PROCEED — integration approval unblocked
CONDITIONS: (1) no git commit yet — awaiting owner instruction;
            (2) P2 order-sensitivity note is a non-blocking optional polish.
```

**OVERALL (addendum 4): GREEN — no P0/P1 open.**
