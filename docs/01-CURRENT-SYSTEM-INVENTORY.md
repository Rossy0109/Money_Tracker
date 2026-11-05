# 01 — Current System Inventory

Money_Tracker (আমার হিসাব) — repository-wide technical inventory.

| Field | Value |
|---|---|
| Audit date | 2026-10-30 |
| Audit mode | READ-ONLY (no source, schema, dependency, config or backup changes; no commits) |
| Repository | https://github.com/Rossy0109/Money_Tracker |
| Branch | `main` (up to date with `origin/main`) |
| Commit SHA | `4f8e76c979acc0a79e8153d785f632c5a8211ad7` |
| Working tree | Modified: `AGENTS.md` (documentation refresh from a prior session). Untracked (deliberately local-only agent tooling, not committed): `.agents/`, `.claude/`, `.mcp.json`, `skills-lock.json` |
| Evidence basis | Direct file reads (`server/db.ts`, `server/accounting-core.ts`, `server/routers.ts`, scripts, workflows, schema), `package.json`, GitHub branch-protection API. **No test execution was performed** (DB-backed suites require a disposable MariaDB; see §9 for what CI verifies instead) |

---

## 1. Technology stack and runtime versions

| Layer | Technology | Version (lockfile/manifest) |
|---|---|---|
| Client | React, Vite, Tailwind CSS, wouter, TanStack Query, Radix UI, react-hook-form + zod, recharts | react 19.3, vite 8.3.5, tailwind 4.3.3, tanstack/react-query 5.105 |
| API | Express 5 + tRPC 11 (superjson), zod 4 validation at every procedure boundary | express 5.2.1, @trpc/* 11.19 |
| ORM | Drizzle ORM | 0.45.4 (drizzle-kit 0.31.11) |
| Database | MySQL/MariaDB — production: **TiDB Serverless** (mysql2 driver) | mysql2 3.24.6 |
| Auth | JWT sessions (jose HS256, cookie + Bearer), Google/GitHub OAuth, email+password mode | jose **6.2.12 (pinned exactly, dependency policy)** |
| Server runtime | Node ≥22 <25 (`engines`), pnpm 9.15.4 (`packageManager`) | esbuild 0.28.2, tsx 4.23 dev |
| Edge runtime | Cloudflare Worker (Hono shim over Express-parity routes, `mysql2` over `cloudflare:sockets`) | workerd, wrangler 4.154 |
| Serverless runtime | Vercel functions (`api/[...path].js` → bundled `vercel-handler`), region `sin1` | vercel 62.7 |
| Storage | Supabase Storage (primary private objects + backups), Vercel Blob (Vercel target), S3-compatible optional | @vercel/blob 2.8, @aws-sdk/client-s3 3.1158 |
| Logging/monitoring | pino/pino-http, Sentry (node/react/vite-plugin) | pino 10.4 |
| Test | Vitest 5 (unit + worker + e2e configs), Playwright 1.64 (mobile browser flows) | —

Note: the local audit machine runs Node v26.12.1 (outside `engines`' `<25` range); CI pins Node 22, which is the normative runtime.

## 2. Architecture

### 2.1 Architecture diagram

```
                       ┌──────────────────────────  ONE SOURCE TREE  ──────────────────────────┐
                       │        client/  (React 19 SPA, Vite root, aliases @/ @shared/)       │
                       │        shared/  (zod schemas, rbac matrix, platform crypto)          │
                       │        drizzle/ (schema.ts, 23 numbered SQL migrations, journal)     │
                       └───────────────────────────────────────────────────────────────────────┘
                                              │  bundled by esbuild/vite
        ┌─────────────────────┬───────────────┴────────────────┬──────────────────────────┐
        ▼                     ▼                                ▼                          ▼
  STANDALONE              VERCEL (promoted prod)        CLOUDFLARE WORKER               GitHub Actions
  pnpm start              mon-k-tracker-blond-          manual deploy only              (scheduler + CI/CD)
  dist/index.js           pi.vercel.app  →  TiDB        2nd writer kept behind          nightly/frequent jobs
  Express 5               Serverless api/[...path]      explicit dispatch               (see §7)
  serveStatic SPA                                                                     
        │                     │                                │                          │
        └─────────────────────┴───────────────┬────────────────┴──────────────────────────┘
                                              ▼
                                   MySQL/MariaDB wire protocol
                                              ▼
                               ┌────────────────────────────┐
                               │  TiDB Serverless / MariaDB │  48 tables (drizzle/schema.ts)
                               └────────────────────────────┘
                                  │                    │
                    ┌─────────────┘                    └──────────────┐
                    ▼                                                ▼
        Supabase Storage (backups, private                audit_logs (append-only trail:
        objects; R2 disabled on account)                  lifecycle transitions, cloud_backup,
                                                          restore_drill, accounting_invariants)
```

### 2.2 Server internals

- Entry: `server/_core/index.ts` (Express app, env validation, RBAC init refusing prod start on failure). App assembled in `server/_core/app.ts` — Express middlewares (helmet-style headers, rate limit, static SPA) + `app.all("/api/scheduled/*", …)` cron endpoints + tRPC mount (`/api/trpc`).
- tRPC context: `server/_core/context.ts` — the **only** place `ctx.user` is derived (`sdk.authenticateRequest(req)`; JWT cookie → `users_sessions` revocation check). Admin elevation cookie adds `ctx.adminElevation`.
- Domain layer: `server/db.ts` (~9.5k LOC god-file; ATLAS-owned): transactions, vouchers, lifecycle transitions, ledger posting, period locks, wallet-opening reconciliation, export/restore, dues, inventory, payroll.
- Reports: `server/accounting-core.ts` (TB / income statement / balance sheet / account ledger / daily+monthly reports); cash flow + fiscal periods + locks also there.
- Automated invariants: `server/accountingAudit.ts` (5-level double-entry proof, cron-protected).
- Routers: `server/routers.ts` + `server/routers/auth.ts`; procedure middleware in `server/_core/trpc.ts` (public/protected/inputOnly/admin/elevatedAdmin + `idempotent`), RBAC wiring in `server/_core/rbac-procedures.ts` + `server/_core/authz.ts`; role predicates in `server/_core/rbac.ts` (F-09-locked: sequential `await`, never `Promise || Promise`).
- Money: `server/money.ts` — integer-cents arithmetic (`toCents`/`fromCents`/`sumCents`); decimal(18,2) columns; ban on raw float accumulation.
- Shared contracts: `shared/rbac.ts` (role/permission matrix), `shared/platform/crypto.ts` (AES-256-GCM backup envelopes).

### 2.3 Database inventory (48 tables in `drizzle/schema.ts`, 23 migrations in `drizzle/`)

Ledger core: `finance_vouchers` (status enum `draft|submitted|approved|posted|reversed`), `finance_voucher_debits`, `finance_voucher_credits`, `finance_ledger_entries` (per-account `chartOfAccountId`, `entryType`, `amount`, `runningBalance`, `postedAt`), `finance_journal_entries` (+`finance_journal_lines`), `finance_chart_of_accounts` (canonical GL accounts; `isDetail`, `openingBalance`, `currentBalance`), `finance_account_types` (ASSET/LIABILITY/EQUITY/REVENUE/…, `normalBalance`), `finance_account_groups`, `finance_fiscal_periods`, `finance_period_locks` (monthKey), `finance_voucher_reversals`, `finance_voucher_audit` (immutable trail, FK restrict), `finance_voucher_settings` (numbering), `finance_voucher_references`, `finance_voucher_settings`.

Legacy/quick paths: `finance_transactions` (quick-entry engine, `idempotencyKey` + unique index, FK-linked `voucherId` to a canonical voucher), `finance_accounts` (wallets; `openingBalanceVoucherId` links to exactly one live opening voucher).

Related domains: `finance_households(_members)`, `finance_shared_budgets/_expenses`, `finance_budgets`, `finance_categories`, `finance_bills`, `finance_dues/_settlements`, `finance_recurring_transactions`, `finance_invoices/_items`, `finance_inventory_items`, `finance_employees`, `finance_salary_payments`, `finance_employee_advances`, `finance_bank_reconciliations(_items)`, `finance_firm_profiles`, `finance_private_storage_objects`.

Platform/RBAC: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions`, `failed_login_attempts`, `login_history`, `audit_logs`, `idempotency_keys`.

Migration safety posture: migrations 0014 (RBAC + idempotency), 0015 (`ON DELETE RESTRICT` for financial history), 0016 (decimal drift repair 15,2→18,2), 0018 (canonical accounts + transaction idempotency), 0019 (wallet opening-balance voucher), 0022 (drop Drive). Production edits only via manual `db-reconcile` workflow with `APPLY-TO-PROD` confirmation.

### 2.4 API surface (tRPC, 5 routers)

| Router | Location | Notable procedures |
|---|---|---|
| `system` | `server/_core/systemRouter.ts` | health, healthReport |
| `auth` | `server/routers/auth.ts` | me/login/register/logout/setPassword/reset flows |
| `admin` | `server/routers.ts:443-630` | elevation (verifyAccess/elevationStatus/revoke), users/roles/audit queries |
| `projects` | `server/routers.ts:631-662` | list/create/active |
| `finance` | `server/routers.ts:663-1939` | addTransaction / update / delete (reversal-based), syncOfflineTransactions, dues; voucher lifecycle `createVoucher`→`submitVoucher`→`approveVoucher`(approve\|return)→`postVoucher`→`reverseVoucher`; CoA CRUD + seed + groups; reports (`trialBalance`, `incomeStatement`, `balanceSheet`, `accountingReport`, `accountLedger`, `cashFlowStatement`, `dailyTransactions`, `monthlyTransactions`, `financialStatements`); budget/bills/recurring/invoices/inventory/payroll; period locks; fiscal periods; export + project backup preview/restore (`RESTORE_NEW_PROJECT` confirmation literal), `triggerCloudBackup` |

Every `finance` procedure: `assertOwnedProject(userId, projectId)` at the DB layer (`server/db.ts:3463`), ±90+ call sites; ownership assertions also on accounts/categories/canonical accounts. userId is never accepted from the client.

### 2.5 Authentication and authorization

- Session: jose HS256 JWT in cookie (1-year TTL, documented rationale `server/_core/sdk.ts:149-152`) with DB revocation table check; Bearer fallback.
- Login: password mode (rate-limited 15/15min per IP, per-email lockout, constant-time compare, pending/suspended gates, failed-attempt audit) or `google` OAuth mode (state/transaction cookie + id-token verify; GitHub OAuth also present). `AUTH_MODE`/`VITE_AUTH_MODE` consistency enforced by `predev`/`prebuild` (`scripts/check-auth-mode.mjs`).
- RBAC: 7 roles (`SUPER_ADMIN`, `SYSTEM_ADMIN`, `ACCOUNTING_ADMIN`, `HR_ADMIN`, `MANAGER`, `INPUT_OPERATOR`, `VIEWER`), DB-backed matrix (`drizzle/0014`); `INPUT_OPERATOR` holds exactly 6 create-only permissions; `voucher.approve|post|reverse` held only by `ACCOUNTING_ADMIN`/`SUPER_ADMIN` (`shared/rbac.ts:225-290`); `SYSTEM_ADMIN` deliberately has **no** financial write authority (`server/_core/rbac.ts:222-231`).
- Sensitive admin routes additionally require a second factor: `elevatedAdminProcedure` (5/15min, timing-safe compare, inline password or elevation cookie).

## 3. Dependency map (high-signal)

```
client ──▶ @trpc/react-query ──▶ /api/trpc (Express | Vercel fn | Worker Hono+shim)
shared/  ──▶ zod schemas ──────▶ server/routers.ts (procedure inputs)
server/_core/context.ts ──▶ server/_core/sdk.ts (jose) ──▶ users_sessions
rhiers routers ──▶ server/db.ts (assertOwnedProject) ──▶ drizzle-orm ──▶ mysql2 ──▶ TiDB/MariaDB
server/db.ts (ledger) ──▶ finance_ledger_entries ◀── server/accounting-core.ts (reports)
server/accounting-core.ts ──▶ server/money.ts (integer cents)
voucher posting ──▶ finance_chart_of_accounts.currentBalance + ledger runningBalance
scheduled/* endpoints ──▶ scheduledFinance / cloudBackupService / accountingAudit / restoreDrill
cloudBackupService ──▶ Supabase REST | S3 SDK | local_encrypted ──▶ AES-256-GCM envelopes (keyring)
restoreDrill ──▶ backupDownload ──▶ restoreProjectBackup (tx + intentional rollback)
```

## 4. Financial transaction architecture (summary — deep audit in `02-FUNCTIONAL-ALGORITHM-AUDIT.md`)

- **Two books, one ledger**: quick-entry `finance_transactions` always materializes an internal posted **canonical voucher** (`canonicalQuickVoucherInTx`, `server/db.ts:5814`) so `finance_ledger_entries` is the single source of truth consumed by every report.
- **Voucher workflow** (DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED) with maker-checker guards, CAS status updates, `SELECT … FOR UPDATE`, deterministic sorted lock order, month-lock enforcement, immutable per-voucher audit trail.
- **Reversals are the only way to "unpost"**: manual reversal (with SoD) or automated restatement of quick-entry transactions; original entries remain and a mirrored posted voucher offsets them net-to-zero.
- **Opening balances** ride ledger vouchers (Dr Cash / Cr Capital; overdrafts logically flip); restatement = reverse + repost (idempotent backfill helpers).
- **Money = decimal(18,2)** with integer-cents arithmetic at every aggregation point; double-entry enforced in Zod *and* server-side at exactly-representable cents.

## 5. Background jobs (all externally triggered)

No in-process scheduler. HTTP endpoints (`/api/scheduled/*`, bearer `CRON_SECRET` timing-safe-checked; `ADMIN_ACCESS_PASSWORD` never accepted) driven by GitHub Actions:

| Workflow | Schedule (UTC) | Purpose | Verdict chain |
|---|---|---|---|
| daily-backup | 18:00 daily (= 00:00 BDT) | verify/create bucket, backup all projects, verify integrity, re-read audit row, prune (90d/7-per-project) | jq-enforced success + `stored==projects` + `verified==projects` + integrity verdict |
| accounting-audit | 05:30 daily | run double-entry invariant audit (5 levels) | `.verified == true` else fail |
| weekly-restore-drill | Mon 05:00 | download newest backup, decrypt, verify checksum/manifest, restore in tx then rollback | `.verified == true` |
| health-watch | */15 | probe `/api/healthz`, `auth.me`, `/` ×3 | opens/closes a single issue |
| maintenance-report | Mon 06:15 | aggregate audit/CI/lifecycle status into an issue | informational |
| prune-backups / db-reconcile | dispatch-only | retention; migration reconcile with `APPLY-TO-PROD` literal | manual |

Cloudflare Worker maps cron triggers in `worker/cron.ts` but **no `[triggers]` is declared in `wrangler.toml`** — scheduled execution is GitHub-Actions-driven today.

## 6. Backup and recovery

- Envelope: `finance-encrypted-cloud-backup-v1`, AES-256-GCM, keyring `BACKUP_ENCRYPTION_KEYS` (first encrypts/all decrypt), `keyId` stamping; full manifest + byte checksum + normalized checksum (`cloudBackupService.ts`, `backupIntegrity.ts`).
- Targets in priority order: Supabase Storage → S3-compatible → verified `local_encrypted`; per-run `audit_logs` row only on complete success; HTTP 500 if any project failed (`scheduledBackup.ts:236`).
- Restore: `restoreProjectBackup` requires literal `RESTORE_NEW_PROJECT` confirmation; weekly drill executes a real restore inside a transaction then intentionally rolls back, matching row counts against the manifest.
- Full-history FK `ON DELETE RESTRICT` (migration 0015) prevents deletion of referenced financial rows.

## 7. Test infrastructure and CI/CD

- Vitest suites: unit (`server/**`, `client/src/**`, `scripts/**`), worker (`worker/**`), e2e (`server/**/*.e2e.ts`). Coverage thresholds 70/60/70/70 enforced; DB-backed behavior requires a disposable loopback MariaDB (`ISOLATED_E2E_DATABASE_URL`); e2e runner creates and drops a scratch DB (`scripts/run-isolated-e2e.mjs`); browser e2e (Playwright, android-chrome + iphone-safari projects) boots the real server on a loopback port.
- Notable suites: `accounting-core.test.ts` (~40 cases: TB/IS/BS/CF/precision/IDOR), `financial-statements.e2e.ts` (real-DB statement reconciliation incl. opening-balance backfill/restate), `voucher-lifecycle.test.ts`, `voucher-maker-checker.test.ts`, `self-approval-prevention.test.ts`, `self-reversal-sod.test.ts`, `transaction-idempotency.test.ts`, `concurrent-operations.test.ts`, `seed-race.e2e.ts`, `accounting-invariants.test.ts`, `worker/**` tests.
- CI jobs (`ci.yml`, on PR + push to `main`): `verify` (typecheck, lint, workflow-hardening gate, build, Bengali font presence) → `test` (MariaDB + `pnpm test:coverage`) → `worker` (schema reconcile + `pnpm test:worker` + wrangler dry-run) → `e2e` (migration rehearsal + hermetic re-run + isolated e2e) → `browser-e2e`. All five are required status checks on protected `main` (branch protection: strict, enforce_admins on, no force-push/deletion, 0 required approvals — sole committer).
- CD: `deploy-vercel.yml` on green CI for `main` (pinned SHA). `deploy-cloudflare.yml` manual dispatch with its own verify/test gates.

## 8. Deployment configuration

| Target | Trigger | Notes |
|---|---|---|
| Vercel (`sin1`) | auto after green CI on `main` | `vercel.json` (no `crons` declared), `build:vercel` via esbuild, static SPA in `public/`, env via dashboard only |
| Cloudflare Worker | manual dispatch only | `nodejs_compat`, KV rate-limit, R2 disabled (account limitation), `[assets]` SPA; held as second writer deliberately |
| Standalone | manual | `pnpm start`, same dist bundle |

## 9. Verification status of this inventory

Inventory facts above were verified by direct reading on 2026-10-30 at commit `4f8e76c…`. Runtime verification of DB behaviors (CI suites) was **not** executed in this session (read-only posture; the coverage/e2e gates require a disposable MariaDB, which CI itself provisions — see §7 for what is enforced there). The e2e accounting reconciliation evidence base (`financial-statements.e2e.ts`, `accounting-core.test.ts`) was reviewed statically and is summarized in `02-FUNCTIONAL-ALGORITHM-AUDIT.md`.
