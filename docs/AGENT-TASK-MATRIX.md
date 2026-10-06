# AGENT TASK MATRIX

**Prepared by:** FLEDGE ALPHA (Master Architect)
**Date:** 2026-10-06
**Rule:** One organization. Read reports + git status + tests before editing shared code. No rewrites.

| Agent | Model | Phase | Ownership | Must NOT | Deliverable |
|---|---|---|---|---|---|
| FLEDGE ALPHA | Fledge Alpha Free | 0 | Architecture, drift, task matrix | Edit source code, run destructive DB ops | AGENT-ARCHITECTURE-REPORT.md, AGENT-TASK-MATRIX.md |
| ATLAS | Nemotron 3 Ultra Free | 1 | `drizzle/`, `server/db.ts`, `accounting-core.ts`, migrations, invariants, idempotency | DROP/TRUNCATE/rewrite migrations, modify prod data | ATLAS-REPORT.md |
| SENTINEL | Nemotron 3.5 Lightning Free | 2 | Auth (`oauth.ts`, `passwordAuth.ts`), sessions, cookies, RBAC (`rbac*.ts`, `permissions.ts`), rate limits, secrets | Weaken security to pass tests | SENTINEL-REPORT.md |
| FORGE | MiMo-V2.6-Flash Free | 3 | Backend: Express, tRPC routers, middleware, services, jobs, backups, Vercel api | Change API contracts silently, duplicate business logic | FORGE-REPORT.md |
| PRISM | Ling 3.1 Flash Free | 4 | Frontend: React, Vite, wouter, TanStack Query, Tailwind, `client/` | Move authorization into frontend as authority | PRISM-REPORT.md |
| GUARDIAN | Big Pickle | 5 | Adversarial QA: lint, typecheck, unit/integration, migration rehearsal, auth/RBAC/accounting tests, build, Playwright, security regressions | Weaken tests to go green | GUARDIAN-REPORT.md |
| Secondary reviewers (no code ownership) | Muse Spark 1.3, MiMo-V2.5, LongCat 2.5, Ling 3.0 Flash Fin | 6 | Independent defect review of integrated candidate | Make uncontrolled production edits | Review notes → HELIX |
| HELIX | Space Bunny Free | 7 | Final integration authority: git diff, reports, tests, configs | Approve P0/P1 remaining | HELIX final report |

## Coordination rules

- **Branching:** one agent per branch or PR; never blind-overwrite another agent's file; inspect diff before editing a touched file.
- **Shared god-files:** `server/db.ts` (9.4k LOC), `drizzle/schema.ts`, `package.json` — ATLAS leads, others propose patches.
- **Git status at handoff:** dirty tree currently (uncommitted `app.ts`, `dbConnection.ts`, `db.ts`, `scheduledBackup.ts`, `package.json`, `pnpm-lock.yaml`, `rbac-initializer.test.ts` + stray `fix_*.py`, `.orig`). First action of ATLAS/SENTINEL: triage these (keep / revert / PR) before new edits.
- **Reports:** each agent writes `docs/<AGENT>-REPORT.md` and appends a handoff block in the format defined in the mission brief.
- **Secrets:** nothing echoed; `.env*` never committed.
- **DB:** production READ-ONLY; rehearsals only on disposable DBs (`ISOLATED_E2E_DATABASE_URL`).

## Immediate triage queue (from Phase 0)

1. Triage uncommitted diff in `server/db.ts`, `server/_core/app.ts`, `dbConnection.ts`, `scheduledBackup.ts` (ATLAS+SENTINEL+FORGE joint review).
2. Decide fate of `fix_rbac.py`, `fix_rbac_test.py`, `fix_test.py`, `*.orig` (apply or delete).
3. ATLAS: verify voucher invariants against current schema `drizzle/schema.ts` vs `server/db.ts`.
4. SENTINEL: RBAC + `AUTH_MODE` enforcement check.
5. GUARDIAN: run full suite + migration rehearsal; classify P0–P4.
