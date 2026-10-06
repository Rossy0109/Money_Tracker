# AGENT ARCHITECTURE REPORT

**Agent:** FLEDGE ALPHA (Master Architect)
**Date:** 2026-10-06
**Scope:** Phase 0 read-only inspection of the Money_Tracker repository.

---

## 1. System Overview

| Layer | Technology | Location |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind 4, Wouter, TanStack Query | `client/` |
| API | tRPC v11 over Express 5 | `server/_core/trpc.ts`, `server/routers/` |
| Server entry | Express app (local) + Vercel handler | `server/_core/index.ts`, `server/_core/app.ts`, `api/[...path].js` |
| Worker | Cloudflare Worker (Hono) deploy target | `worker/`, `wrangler.toml` |
| DB access | Drizzle ORM + mysql2 | `server/db.ts` (9,377 LOC), `drizzle/schema.ts` (1,701 LOC) |
| Migrations | drizzle-kit, 20 migrations `drizzle/0000..0019` | `drizzle/` |
| Auth | Google OAuth + email/password, JWT (jose), HttpOnly cookies, `AUTH_MODE` gate | `server/_core/oauth.ts`, `passwordAuth.ts`, `adminSession.ts` |
| RBAC | permissions, seed/migrate scripts, procedures | `shared/rbac.ts`, `server/_core/rbac*.ts`, `permissions.ts` |
| Audit/accounting | double-entry vouchers, invariants, audit trail, statements | `server/accounting*.ts`, `server/audit*.ts` |
| Backups | cloud backup (S3/Vercel Blob), encryption, restore drill | `server/backupDb.ts`, `cloudBackupService.ts`, `backupIntegrity.ts` |
| Tests | Vitest (unit/integration), Playwright E2E, isolated E2E | `vitest*.config.ts`, `tests/`, `scripts/run-*` |
| CI/CD | GitHub Actions: ci, vercel deploy, cloudflare deploy, daily-backup, restore drill | `.github/workflows/` |
| Infra | Vercel primary, Cloudflare worker secondary, Termux-compatible dev | `vercel.json`, `wrangler.toml` |

**Pattern:** single-package monorepo, `client` / `server` / `shared` / `worker`, tRPC for end-to-end type safety, superjson transformer, `userId`-scoped every finance row.

## 2. Documentation vs Reality (drift found)

| Claim in docs | Reality | Assessment |
|---|---|---|
| `docs/ARCHITECTURE-AUDIT.md` branch `feat/input-only-user-permissions`, dated 2025-09-17 | Repo is on `main`, newer migrations 0014–0019 added | Audit partially stale; use as supplement, not authority |
| README: deploys to Vercel via `api/[...path].js` | Also has Cloudflare Worker path (`worker/`, `wrangler.toml`) and `pages-redirect/` | Dual deploy targets; compatibility audit exists (`docs/CLOUDFLARE_COMPATIBILITY_AUDIT.md`) |
| Supabase policy docs (bn) | Runtime is TiDB/MySQL; Supabase used as compat/storage | No live Postgres migration evident — policy consistent |
| `package.json` engines `node >=22 <25` | Termux guidance documented in README | Consistent |

## 3. Risks / Findings (Phase 0)

1. **P1 — Dirty working tree.** Uncommitted edits in `server/_core/app.ts`, `dbConnection.ts`, `db.ts`, `scheduledBackup.ts`, `package.json`, `pnpm-lock.yaml` + stray `fix_rbac.py`, `fix_rbac_test.py`, `fix_test.py`, `server/rbac-initializer.test.ts.orig`. Any agent must branch or stash/inspect before touching shared files. (Git policy violation in progress.)
2. **P1 — `server/db.ts` is a 9.4k-line god file.** High merge-conflict surface; all other agents must avoid broad rewrites here; isolate edits.
3. **P2 — Test-only `.orig` and ad-hoc fix scripts** suggest past manual patches; audit `fix_*.py` for whether fixes were applied to the real files.
4. **P2 — Dual deployment targets** (Vercel + Cloudflare Worker) with divergent routing risk; `check:vercel-entry` script and `CLOUDFLARE_COMPATIBILITY_AUDIT.md` exist but E2E for both is limited on Termux.
5. **P3 — Docs are a mix of English and Bengali**, many dated reports; some may lag implementation. AGENT-* reports should supersede ad-hoc notes.
6. **P2 — Migration safety:** `db:push` runs `drizzle-kit generate && migrate`; verify-migrations script exists. All future migrations must be rehearsed on disposable DB first.
7. **P3 — No explicit dead-code sweep done yet**; `pages-redirect/`, `dist/`, `dist-worker/` committed artifacts should be reviewed for hygiene.

## 4. What NOT to touch without approval

- Migration files under `drizzle/` (never rewrite history).
- `docs/` historical reports (append, don't rewrite).
- Accounting invariants in `server/accounting-core.ts` without ATLAS sign-off.
- Auth/RBAC core in `server/_core/{oauth,passwordAuth,rbac,permissions}.ts` without SENTINEL sign-off.
- Supabase/Vercel/Cloudflare configs without HELIX sign-off.

## 5. Constraints for next agents

- TiDB/MySQL is the live DB; no automatic Postgres/Supabase migration.
- Financial invariants: `SUM(DEBIT) == SUM(CREDIT)`; DRAFT→SUBMITTED→APPROVED→POSTED→REVERSED; POSTED rows immutable; reversals preserve history.
- No destructive DB operations against production.
- Termux limitation ≠ app defect for browser E2E.

## 6. Test commands to reuse

```
pnpm check        # tsc
pnpm lint         # eslint
pnpm test         # vitest run
pnpm test:migrations   # migration rehearsal (disposable DB)
pnpm test:worker  # worker vitest config
pnpm build        # vite + esbuild
```
