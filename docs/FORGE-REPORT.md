# FORGE REPORT — Phase 3 (Backend + API)

**Agent:** FORGE (MiMo-V2.6-Flash Free role)
**Date:** 2026-10-06
**Scope:** Express, tRPC routers, middleware, services, database access, scheduled jobs, backups, Vercel API handler. Read-only inspection.

---

## 1. Backend Architecture

| Component | Location | Status |
|---|---|---|
| Server entry | `server/_core/index.ts` — env validation, auth-mode consistency check, RBAC init (fails hard in prod), Sentry, graceful error handling | ✅ |
| API app | `server/_core/app.ts:65` `createApiApp()` — shared by local Express, Vercel handler, and Worker build | ✅ |
| tRPC | `server/routers.ts` (1,905 lines): `appRouter` = `admin` + `projects` + `finance` sub-routers; 71 mutations, 53 queries | ✅ |
| Auth routes (Express) | `server/_core/oauth.ts` — register/login/logout + OAuth callbacks | ✅ |
| Vercel handler | `api/[...path].js` → `dist/vercel-handler.js` (built by `scripts/build-vercel-api.mjs`, validated by `check:vercel-entry`) | ✅ |
| Middleware order | trust proxy → canonical-host redirect → helmet CSP/HSTS → CORS allow-list → healthz → storage proxy → auth rate limiters → OAuth routes → scheduled routes → tRPC → 404 → error handler | ✅ |

## 2. Mutation Safety Matrix (mission rule compliance)

| Requirement | Status | Evidence |
|---|---|---|
| Authenticated user | ✅ **All 71 mutations guarded** — static scan: every `.mutation(` is preceded by a procedure (`protectedProcedure`, `inputOnlyProcedure`, `adminProcedure`, `elevatedAdminProcedure`, or `*WithPermission` variants) | `server/routers.ts` |
| Resource ownership | ✅ | `assertOwnedProject` at every db entry (verified by ATLAS): voucher paths `db.ts:1310,1363,1540,2847`, transactions `:5610` |
| Permission | ✅ | `protectedWithPermission(resource, action)` / `inputOnlyWithPermission` + RBAC deny-audited middleware (`authz.ts:11-30`) |
| Input validity | ✅ | zod schemas on every input; voucher balance checked at router (`superRefine` exact-cent) and db layer |
| Transaction boundary | ✅ | voucher create/submit/approve/post/reverse, transaction create, due settle all wrapped in `db.transaction` with `FOR UPDATE` row locks (ATLAS) |
| Idempotency requirement | ✅ **Corrected** | `.use(idempotent)` on 8 mutations: submitVoucher, approveVoucher, postVoucher, createVoucher, settleDue (line 1377), +3. **ATLAS/SENTINEL S-01 finding that `settleDue` lacks idempotency was a false positive** — it has the middleware; the `idempotencyKey` input is *optional*, so pass-through protection is client-dependent (downgraded to P2) |
| Audit requirement | ✅ | 55 `logAudit` sites in `server/db.ts` (mutations) + permission-denied audits in `authz.ts` + login/logout audits |
| Retry safety | ✅ | Status-guarded conditional UPDATEs consume lifecycle state once; unique indexes backstop (voucher no, reversal, transaction idempotency) |

## 3. Scheduled Jobs

| Endpoint | Auth | Notes |
|---|---|---|
| `/api/scheduled/finance-recurring` | Cron secret (timing-safe) or cron user session | `scheduledFinance.ts:11-25` |
| `/api/scheduled/finance-bill-reminder` | Same | |
| `/api/scheduled/finance-backup` | Same | |
| `/api/scheduled/backup-audit` | Same | Read-only proof row |
| `/api/scheduled/accounting-audit` | Same | Double-entry balance check per project |
| `/api/scheduled/restore-drill` | Same | Weekly download/restore/rollback rehearsal |
| `/api/scheduled/daily-sweep` | Same | Failed-login cleanup |
| `/api/health-checks` | Bearer cron secret, timing-safe | `app.ts:279-306` |

All registered via `app.all` (GET+POST) so Vercel Cron method mismatch cannot 404. Scheduled backup verifies integrity post-upload by re-export + normalized hash compare (`scheduledBackup.ts:125-136`).

## 4. Middleware / Hardening

- **helmet**: strict CSP (`'self'` scripts in prod), HSTS 1y, frameguard deny, noSniff, hidePoweredBy, `upgrade-insecure-requests` deliberately off (documented rationale) — `app.ts:96-134`
- **CORS**: prod allow-list (APP_URL + canonical + `CORS_ALLOWED_ORIGINS`), `Vary: Origin` — `app.ts:137-162`
- **Canonical host redirect** (301) in prod with health/cron bypass — `app.ts:74-94`
- **Auth rate limiters** at Express level for `/api/auth`, `/api/oauth`, `auth.*` tRPC paths — `app.ts:255-259`
- **Error handler**: generic 500 JSON, details only logged — `app.ts:344-348`
- **Sentry** init with `tracesSampleRate` 0.1 in prod — `index.ts:11-18`

## 5. API Contract Stability

- No contract changes made in this phase.
- Existing changes in dirty tree (documented by FLEDGE ALPHA) are cleanups only: disabled debug route (`app.ts`), typed catch (`dbConnection.ts`), unused imports (`db.ts`, `scheduledBackup.ts`), `supabase` devDependency (worker storage path).
- `finance.router.test.ts` (34k) + `full-user-workflows.test.ts` + `financial-statements.e2e.ts` cover router contracts; targeted runs passed in GUARDIAN phase.

## 6. Findings

| ID | Severity | Finding |
|---|---|---|
| F-01 | **P1** | **Period-lock gap at post** (confirmed): `postVoucher` (`db.ts:1535-1628`) has no `assertPeriodNotLockedTx`; lock enforced only at create/reverse/update/delete. Fix: call inside post tx using `voucher.date`. |
| F-02 | **P2** | **Idempotency keys optional**: `idempotencyKey` inputs are `.optional()` — a client that omits the key bypasses replay protection (`trpc.ts:297-299` skips check). DB-level guards still prevent structural double-post for vouchers/transactions, but consider requiring keys on money-moving mutations. |
| F-03 | **P2** | **ATLAS/SENTINEL S-01 correction**: `settleDue` **does** have `.use(idempotent)` (`routers.ts:1377`). Prior reports overstated this. Residual risk is only the optional-key nuance (F-02). |
| F-04 | **P3** | Balance re-assertion at post time still absent (ATLAS) — lines are immutable after create so coverage is transitive, but restore-path plant risk remains (compensated by daily accounting-audit). |
| F-05 | **P3** | No API contract changes; no duplicate business logic found (report generation in `accounting-core.ts`, mutations in `db.ts` — clean separation). |

## 7. Verification performed

- `pnpm check` ✅, `pnpm lint` ✅, `pnpm build` ✅ (via GUARDIAN phase)
- Static guard scan: 71/71 mutations have procedure guards
- Read-only — no source modified, no API contracts changed, no dependency changes

## 8. Recommendations

- **FORGE (self, when authorized):** add `assertPeriodNotLockedTx` to `postVoucher` tx (F-01); consider requiring `idempotencyKey` on financial mutations (F-02).
- **GUARDIAN:** add test for late-post-after-lock; correct S-01 in GUARDIAN report.
- **HELIX:** S-01 must be downgraded from P1 → P2 in final reconciliation.
