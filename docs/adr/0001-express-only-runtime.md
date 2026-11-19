# ADR-001: Express-only production runtime (retire Hono + Cloudflare Worker)

- **Status:** Accepted for implementation on `chore/arch-finalization`
- **Date:** 2026-11-17
- **Decision owner:** Principal Architecture / HELIX integration authority
- **Baseline commit audited:** `f75437e1655089d0c86bbf22d544193a28e24c95` (`main`, fetched 2026-11-17)
- **Supersedes:** the additive Worker migration described in
  `docs/CLOUDFLARE_COMPATIBILITY_AUDIT.md`, `docs/CLOUDFLARE_DEPLOYMENT.md`,
  `docs/CLOUDFLARE_ROLLBACK.md`, and the multi-target statements in
  `docs/01-CURRENT-SYSTEM-INVENTORY.md` and `docs/AGENT-ARCHITECTURE-REPORT.md`.

---

## 1. Context

The repository supports three build/deploy shapes from one tree:

1. standalone Express (`server/_core/index.ts` → `dist/index.js`),
2. Vercel serverless (`api/[...path].js` → `dist/vercel-handler.js` → the same
   Express app), and
3. a Cloudflare Worker (`worker/index.ts`, Hono + an Express-shaped HTTP shim,
   `mysql2` over `cloudflare:sockets`).

The target architecture is React 19 + Vite, Express 5, tRPC, Drizzle on
TiDB/MySQL, deployed on Vercel, with one storage provider per role, RBAC,
a single scheduler, and verified encrypted backups. Hono and the Worker are
explicitly not part of that target unless a verified production dependency
requires them.

This ADR answers Phase 2 of the architecture finalization: **can Express
independently handle all production functionality, and is anything actually
dependent on Hono or Cloudflare?**

## 2. Evidence gathered (fresh audit, not historical reports)

| Question | Verified evidence |
|---|---|
| Latest `main` | `f75437e1655089d0c86bbf22d544193a28e24c95`; last main CI run `42918896715` = **success** |
| Production target | Vercel project `money-tracker`; canonical host `money-tracker-blond-pi.vercel.app`; `deploy-vercel.yml` deployed `f75437e` successfully (run `42919485556`) |
| Cloudflare production use | `deploy-cloudflare.yml` is `workflow_dispatch` **only** and has **zero runs** in GitHub Actions history. `wrangler.toml` has no `[triggers]`. `docs/CLOUDFLARE_COMPATIBILITY_AUDIT.md` §6 phase 11 (“production verification”) is still **Pending — needs Cloudflare**. |
| Worker runtime proof | The Worker DB path (`cloudflare:sockets` + mysql2 stream) was never exercised against production. The current production DB rejects non-TLS connections (see §7), which is the opposite of a verified Worker deployment. |
| Working tree | Clean audit; pre-existing WIP from `feat/offline-queue-and-maker-checker-ui` was preserved in a named stash before branching (not part of this decision). |
| Open PRs | #293 feature branch (all CI checks green), #294–#298 Dependabot. No PR requires the Worker. |
| Storage | Vercel Production env contains `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` (private object storage) and `SUPABASE_URL` + service-role key (encrypted backups). `wrangler.toml` documents R2 as **disabled** on the account (API error 10042). |
| Scheduler | `vercel.json` has **no** `crons`; `wrangler.toml` has **no** triggers. The only scheduled entry points are GitHub Actions workflows. |
| Backup | Daily backup succeeded through 2026-11-04, then failed daily from 2026-11-05. Weekly drill passed 2026-11-09, failed 2026-11-16. Root cause is DB connectivity/TLS, not the backup provider (§7). |

## 3. Express ↔ Worker parity check

Every Worker route has an Express equivalent that is exercised in production:

| Capability | Express (`server/_core/app.ts`) | Worker (`worker/app.ts`) | Verdict |
|---|---|---|---|
| Liveness | `GET /api/healthz` | same | Express owns it |
| Structured health | `ALL /api/health-checks` (cron secret) | same | Express owns it |
| tRPC | `POST /api/trpc/*` (Express adapter) | fetch adapter | Express already production-proven |
| OAuth | `registerOAuthRoutes(app)` | Express-shaped shim | Express native |
| Private object delivery | `registerStorageProxy(app)` (Vercel Blob / Supabase / R2) | shim + R2/Supabase | Express native; R2 branch dead |
| Scheduled jobs | 7 `app.all("/api/scheduled/*")` routes | route-capture + shim | Express native |
| Static SPA | `serveStatic(app)` | `env.ASSETS.fetch()` | Express/Vercel native |
| Security headers | `helmet` | manual header middleware | Express native |
| Rate limiting | `express-rate-limit` + DB-backed store on Vercel | KV binding | Express native (DB store already fixed S-1) |
| Request logging | `pino-http` | platform logs | Express native |
| API 404 | `app.use("/api", …)` | Hono catch-all | Express native |

The Worker is a **subset** of Express behaviour. It adds no capability that
production relies on:

- KV rate limiting is already replaced on Vercel by `createDbRateLimitStore()`
  (`server/vercel-handler.ts`), which is multi-instance safe.
- `cloudflare:sockets` only replaces Node's TCP stack; it is not a feature.
- R2 private storage is disabled on the account and never enabled in
  `wrangler.toml`.
- The Worker cron handlers map to endpoints that GitHub Actions already owns.

**Conclusion: Express can independently handle 100% of production
functionality. No production dependency on Hono or Cloudflare was found.**

## 4. Decision

1. **Express is the single API/runtime architecture.** Keep the standalone
   Express entry point and the Vercel serverless adapter; both mount the same
   `createApiApp()`.
2. **Retire Hono and the Cloudflare Worker.** Remove `worker/`, `wrangler.toml`,
   the Worker deployment workflow, Worker tests/config, and Worker-only
   dependencies.
3. **One storage provider per role.** Vercel Blob for user-facing private
   objects (already production-selected); Supabase Storage for encrypted
   backups (already verified by the restore drill). Remove the dormant
   Cloudflare R2 binding path. S3-compatible backup upload stays because it is
   provider-neutral and used by `cloudBackupService`.
4. **GitHub Actions is the sole scheduler.** Keep the existing backup, audit,
   restore-drill and health workflows. Add the missing daily sweep schedule so
   recurring transactions and bill reminders actually run.
5. **Do not change production data or deploy from this branch.** Production DB
   remains read-only for agents.

## 5. Dependency / removal matrix

Every item was classified before deletion. “Unused” below means “no production
caller and no test outside the Worker suite”.

| Component / path | Class | Reason |
|---|---|---|
| `server/_core/app.ts`, `server/_core/index.ts`, `server/vercel-handler.ts` | **KEEP** | Production Express pipeline |
| `api/[...path].js`, `scripts/build-vercel-api.mjs` | **KEEP** | Vercel entry point |
| `server/_core/storageProxy.ts` | **KEEP (simplify)** | Express object delivery; remove dead shim/R2 branches |
| `server/_core/storageBackend.ts` | **KEEP (simplify)** | Blob/Supabase selection; remove R2 binding type/selector |
| `server/_core/supabaseAdapter.ts`, `server/cloudBackupService.ts`, `server/backupDownload.ts` | **KEEP** | Verified encrypted backup path |
| `server/scheduled*.ts`, `server/accountingAudit.ts`, `server/restoreDrill.ts`, `server/healthChecks.ts` | **KEEP** | Production jobs called by Express |
| `shared/platform/crypto.ts`, `@noble/hashes` | **KEEP** | Portable crypto used by Node server; not Worker-only |
| `@vercel/blob`, `@aws-sdk/client-s3`, `mysql2`, `drizzle-orm` | **KEEP** | Storage/backup/DB dependencies |
| `worker/app.ts`, `worker/index.ts`, `worker/context.ts`, `worker/db.ts`, `worker/env.ts`, `worker/httpShim.ts`, `worker/security.ts`, `worker/rateLimit.ts`, `worker/rateLimitStore.ts`, `worker/socketStream.ts`, `worker/cron.ts`, `worker/testHelpers.ts`, `worker/worker.test.ts`, `worker/cloudflareSocketsStub.ts` | **REMOVE** | No production caller; Express parity proven |
| `wrangler.toml` | **REMOVE** | Worker deployment config; no `[triggers]`, R2 disabled |
| `.github/workflows/deploy-cloudflare.yml` | **REMOVE** | Manual-only; zero runs; Vercel is production |
| `vitest.worker.config.ts` | **REMOVE** | Only runs deleted Worker tests |
| `hono` dependency | **REMOVE** | Imported only by deleted `worker/app.ts`/`security.ts`/`rateLimit.ts` |
| `wrangler` devDependency | **REMOVE** | Worker build/deploy only |
| `@cloudflare/workers-types` devDependency | **REMOVE** | Worker TS types only |
| `pnpm.overrides["miniflare>undici"]` | **REMOVE** | `miniflare` was a `wrangler` transitive |
| `pnpm.overrides["@vercel/hono>path-to-regexp"]` | **KEEP** | Pins a `vercel` CLI transitive, not the app’s Hono |
| `cloudflare:sockets` Vitest alias | **REMOVE** | Stub lived in `worker/` |
| `tsconfig` `worker/**/*` + `@cloudflare/workers-types` | **REMOVE** | No Worker sources/types |
| ESLint ignores `dist-worker/**`, `.wrangler/**` | **REMOVE** | No Worker build output |
| `.gitignore` `dist-worker/` | **REMOVE** | No Worker build output |
| `R2BucketHandle` / `setR2Bucket` / `getR2Bucket` / `"cloudflare-r2"` | **REMOVE** | Binding is Worker-only and disabled |
| `WorkerShimResponse` / `isShimResponse` branches | **REMOVE** | Only the Worker passed shim responses |
| `worker` CI job | **REPLACE** | Keep the job id/check context `worker` (branch protection is not writable with the current token) but turn it into an Express-only architecture guard |
| `test:worker` / `build:worker` / `deploy:worker` scripts | **REMOVE** | Worker commands |
| `scripts/check-dependency-policy.test.ts` hono fixture | **REPLACE** | Use a dependency that remains in the tree |
| `.github/CODEOWNERS` `/worker/` | **REMOVE** | Path is deleted |
| `docs/CLOUDFLARE_DEPLOYMENT.md`, `docs/CLOUDFLARE_ROLLBACK.md` | **REMOVE** | Obsolete runbooks that would mislead operators |
| `docs/CLOUDFLARE_COMPATIBILITY_AUDIT.md` | **KEEP (banner)** | Historical audit; mark superseded by this ADR |
| `docs/01-CURRENT-SYSTEM-INVENTORY.md`, `docs/AGENT-ARCHITECTURE-REPORT.md` | **UPDATE** | Remove multi-runtime claims |
| `finance-recurring`, `finance-bill-reminder` endpoints | **INVESTIGATED → KEEP** | No client or workflow sets `scheduleCronTaskUid`; they are legacy per-task callbacks. The daily sweep supersedes them, but removing public endpoints is a separate API decision. |
| Standalone Docker/Express target | **KEEP** | Same Express runtime; not a second application architecture |

## 6. Scheduler decision

| Endpoint | Auth | Current scheduler | Action |
|---|---|---|---|
| `/api/scheduled/finance-backup` | cron secret | GitHub Actions `daily-backup.yml` (18:00 UTC) | Keep |
| `/api/scheduled/backup-audit` | cron secret | Invoked by `daily-backup.yml` after backup | Keep |
| `/api/scheduled/accounting-audit` | cron secret | GitHub Actions `accounting-audit.yml` (05:30 UTC) | Keep |
| `/api/scheduled/restore-drill` | cron secret | GitHub Actions `weekly-restore-drill.yml` (Mon 05:00 UTC) | Keep |
| `/api/scheduled/daily-sweep` | cron secret | **None** (registered but never invoked) | **Add `daily-finance-jobs.yml`** |
| `/api/scheduled/finance-recurring` | cron secret or per-task | None (legacy `taskUid` path) | Document as legacy; daily sweep covers the work |
| `/api/scheduled/finance-bill-reminder` | cron secret or per-task | None (legacy `taskUid` path) | Document as legacy; daily sweep covers the work |
| `/api/health-checks` | cron secret | Manual diagnostic | Keep |

The daily sweep is idempotent per run-key/day (`processRecurringSweep`,
`processBillReminderSweep`), so adding a schedule does not risk duplicate
postings on retry.

## 7. Production blockers found during the audit (outside this ADR’s code scope)

These are **not** caused by the Worker and must be closed by the owner before
declaring production ready. They are recorded here so the architecture
decision is not mistaken for a production certification.

### P0 — Production DB rejects non-TLS connections (backup/audit/drill are red)

Evidence:

- `DB Schema Reconcile (manual)` run `43465169930` prints
  `Target: host=gateway01.ap-southeast-1.prod.aws.tidbcloud.com … database=github_sample tls=not requested`
  then fails with
  `Connections using insecure transport are prohibited.`
  (TiDB Cloud requirement).
- `Daily Automated Finance Backup` has failed every day since 2026-11-05
  (last success 2026-11-04). The failure is always the **first** DB query:
  `Failed query: select … from users order by users.createdAt desc`.
- `Daily Accounting Audit` fails on the same `users` query.
- `Weekly Restore Drill` (2026-11-16, run `43875873832`) fails on its first DB
  query (`audit_logs` lookup). The 2026-11-09 drill passed against a backup
  made 2026-11-04.

The shape (any first query fails, endpoint hides the cause) is consistent with
the same TiDB TLS rejection in the Vercel runtime. `server/_core/dbConnection.ts`
supports TLS via `?ssl-mode=verify_identity` or
`?ssl={"rejectUnauthorized":true}` but the production URL must actually carry it.

Required owner action:

1. In Vercel Production, update `DATABASE_URL` to include
   `?ssl-mode=verify_identity` (or the URL-encoded
   `?ssl=%7B%22rejectUnauthorized%22%3Atrue%7D`), redeploy, and confirm a
   DB-backed endpoint (e.g. authenticated `auth.me`) works.
2. Copy the same value into the GitHub `PROD_DATABASE_URL` secret, then run
   `DB Schema Reconcile (manual)` dry-run; it must print
   `tls=encrypted, certificate verified` before applying.
3. Apply migrations `0020`–`0024` (still pending per F-7) and re-run the
   daily backup, accounting audit and restore drill.

### P1 — The restore drill can “verify” an empty backup

Run `42627809007` (2026-11-09) reported `verified:true` for
`project-1-backup-2026-11-04-179130e4.enc.json` while **every** restored table
count was `0` (transactions, accounts, vouchers, ledger entries, …). The drill
compares the restore to the manifest, and the manifest also recorded zero, so
an empty export passes. This is a verification-quality gap, not a Worker issue.
Owner/QA action: fail the drill (or raise an alert) when a non-empty source
project produces an all-zero manifest, and add a regression test for that case.

### P1 — Three scheduled finance jobs had no scheduler

`daily-sweep` was registered but never invoked, so recurring transactions and
bill reminders did not run automatically. This ADR’s implementation adds the
GitHub Actions schedule.

### P2 — Legacy required-check name

The protected branch’s required check context is `worker`. The current token
cannot read or patch branch protection (`403 Resource not accessible`), so the
job id remains `worker` as an Express architecture guard. When an owner with
admin scope is available, rename the check to `runtime-guard` and update branch
protection.

## 8. Consequences

Positive:

- One request pipeline, one auth/RBAC implementation, one storage selection,
  one scheduler, and one set of tests.
- Removes ~1,000 lines of shim/runtime code and three Worker-only dependencies.
- Vercel cold starts no longer carry Hono/Worker-only code paths.
- CI gets a fast architecture guard that fails if the Worker or a second
  scheduler is reintroduced.

Negative / accepted:

- The Worker is no longer available as an emergency fallback. Git history
  retains it; reverting this branch restores it.
- R2 private object storage is no longer selectable without re-adding the
  binding. It was disabled and never populated, so no object migration is
  needed.
- The `worker` CI check name is retained temporarily for branch-protection
  compatibility (see P2).

## 9. Verification plan for the change

Run in order:

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
node scripts/check-workflow-hardening.mjs
```

With a disposable MariaDB only (never production):

```bash
ISOLATED_E2E_DATABASE_URL='mysql://root:password@127.0.0.1:3307/money_tracker' pnpm test:migrations
ISOLATED_E2E_DATABASE_URL='mysql://root:password@127.0.0.1:3307/money_tracker' pnpm test:coverage
```

Regression coverage added:

- `server/_core/architecture-guard.test.ts` asserts the Worker, Hono,
  `wrangler.toml`/`wrangler.json`/`wrangler.jsonc`, Worker-only scripts,
  dependencies and CI commands (`wrangler deploy`/`wrangler publish`,
  `cloudflare/wrangler-action`) cannot return. It also walks
  `server`, `shared`, `client/src`, `scripts` and `api` for Hono imports
  (`from "hono"`, `from "hono/..."`, `require("hono")`) and
  `cloudflare:sockets`, and enforces an exact allowlist of the only workflows
  permitted to contain a `schedule:` block.
- `server/scheduledFinance.test.ts` asserts a rejected bill-reminder sweep
  returns `billReminders.error` and that `/api/scheduled/daily-sweep` responds
  500 when recurring or bill-reminder work fails, so the GitHub Actions client
  cannot read a false success.
- `server/_core/vercelRouting.test.ts` asserts GitHub Actions is the only
  scheduler and every scheduled route is Express-registered and GET-capable.
- Existing accounting-audit/backup/restore-drill wiring tests are reduced from
  “both runtimes” to “Express runtime”.

## 10. Rollback

Revert the `chore/arch-finalization` commits. `worker/`, `wrangler.toml`,
`deploy-cloudflare.yml` and the Worker dependencies are restored from git.
No production migration, environment change or deployment is performed by this
branch, so rollback is code-only.
