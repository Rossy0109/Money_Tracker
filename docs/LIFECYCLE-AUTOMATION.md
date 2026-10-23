# Lifecycle Automation

Status: implemented and locally validated on 2026-10-23. The new workflow has
**not** run on GitHub yet (nothing was pushed), so its first scheduled run is
still pending.

This document describes the automation that exists in this repository, what it
deliberately does not do, and the free-tier and approval boundaries around it.
It is an inventory of evidence, not a claim that every production capability is
verified.

## Safety boundary

Automation in this repository may:

- read the repository, run tests, build artifacts, and query public endpoints;
- run migrations **only** against a disposable, loopback MariaDB;
- read backup/restore/accounting status through cron-protected production
  endpoints using `CRON_SECRET`;
- open and close deduplicated GitHub issues.

Automation must never:

- apply a migration to production;
- connect to the production database from CI (the manual `DB Schema Reconcile`
  workflow is the single, owner-triggered exception);
- deploy without the required CI gates passing;
- print or artifact a secret, token, connection string, or financial row;
- restore over production or change retention without an owner.

## What already existed (verified in this audit)

| Workflow | File | Trigger / schedule | Purpose |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | PR + push to `main` | `verify` (typecheck, lint, workflow-hardening gate, build, Bengali font), `test` (unit + coverage gate on MariaDB), `worker`, `e2e` (migration rehearsal + isolated E2E), `browser-e2e` (Playwright) |
| Deploy to Vercel (CD) | `.github/workflows/deploy-vercel.yml` | `workflow_run` of CI + manual | Deploys the exact commit CI validated, only when CI concluded `success` and the branch is `main` |
| Daily Automated Finance Backup | `.github/workflows/daily-backup.yml` | `0 18 * * *` + manual | Verifies the Supabase bucket, triggers `/api/scheduled/finance-backup`, asserts stored/verified counts, reads the audit trail, prunes retention |
| Weekly Restore Drill | `.github/workflows/weekly-restore-drill.yml` | `0 5 * * 1` + manual | Downloads, decrypts, restores to a new project, verifies counts, rolls back |
| Daily Accounting Audit | `.github/workflows/accounting-audit.yml` | `30 5 * * *` + manual | Checks double-entry invariants and asserts `verified:true` |
| Production Health Watch | `.github/workflows/health-watch.yml` | `*/15 * * * *` + manual | Probes `healthz`, `auth.me`, and `/`; opens/closes one deduplicated issue |
| Verify dependency bumps | `.github/workflows/dependency-bump-check.yml` | PR/push touching dependency files + manual | `pnpm audit --audit-level=high`, dependency-policy gate, typecheck, build, tests |
| DB Schema Reconcile (manual) | `.github/workflows/db-reconcile.yml` | `workflow_dispatch` only | Dry-run by default; `apply` requires typing `APPLY-TO-PROD` |
| Prune Expired Backups | `.github/workflows/prune-backups.yml` | `workflow_dispatch` only | Dry-run by default; deletion requires `apply=true` |
| Deploy to Cloudflare | `.github/workflows/deploy-cloudflare.yml` | `workflow_dispatch` only | Manual Worker deployment; never runs on merge |
| Deploy GitHub Pages redirect | `.github/workflows/deploy-pages-redirect.yml` | push touching `pages-redirect/**` + manual | Static redirect only |
| Release Drafter | `.github/workflows/release-drafter.yml` | tag `v*` | Creates a GitHub release with generated notes |

The existing `CI` workflow already satisfies the pull-request requirements:
frozen lockfile install, typecheck, lint, full unit suite with coverage,
build, migration rehearsal, and browser E2E. No second CI pipeline was added.

## What was added

### `Automated Maintenance Report`

File: `.github/workflows/maintenance-report.yml`

Schedule: **weekly on Monday at 06:15 UTC** (`15 6 * * 1`, 12:15
Asia/Dhaka) and `workflow_dispatch`.
Concurrency group `automated-maintenance-report`, `cancel-in-progress: false`.

It does four things:

1. **Reads** the latest run of CI (on `main`) and of the backup, restore-drill,
   accounting-audit, and health-watch workflows through the GitHub API.
2. **Runs** `pnpm audit --json` against the committed lockfile. A non-zero exit
   is expected when advisories exist; the workflow records the counts instead
   of failing the run.
3. **Renders** two artifacts with `scripts/maintenance-report.mjs`:
   - `maintenance-report.md` — scheduled-check table, dependency counts, top
     advisories, repository state, production-migration UNKNOWN.
   - `lifecycle-report.md` — latest successful CI, failed checks, dependency
     alerts, backup/restore status, open issues/PRs, required owner decisions,
     and an explicit "unverified" section.
   Both are uploaded as the `automation-report` artifact for 14 days.
4. **Upserts one issue** titled `Automated maintenance report` when a check is
   actionable, and closes it when everything is green again. Health watch is
   excluded from that decision because it already owns its own outage issue, so
   a single outage never produces two alerts.

Actionable states are `FAIL`, `STALE`, `UNKNOWN`, and `BLOCKED`. A missing or
unparsable dependency audit is `BLOCKED`, never `PASS`. An in-progress run is
`RUNNING` and is not actionable on its own.

The generator is unit-tested in `scripts/maintenance-report.test.ts` (28 tests)
and its logic is deliberately kept out of the YAML so it can be tested without
GitHub or the network.

### Why no monthly restore drill was added

A **weekly** restore drill already exists and is stronger than the requested
monthly cadence. Adding a second drill would duplicate the download/decrypt/
restore/rollback work and double the external API usage for no extra coverage.
The weekly drill remains the recovery proof; the new report only reads its
latest verdict.

### Why no scheduled health probe was added

`health-watch.yml` already probes every 15 minutes and manages its own issue.
The maintenance report summarises that status instead of re-probing.

## Free-tier usage and plan restrictions

Evidence checked on 2026-10-23:

- The repository is **public** (`gh repo view`: `visibility: PUBLIC`). GitHub
  documents that standard GitHub-hosted runners are free for public
  repositories. Artifact storage still counts against the plan allowance, so
  every upload here is capped at 1–14 days.
- **GitHub Actions schedules are best-effort** and can be delayed, especially
  at the start of an hour. Freshness thresholds in the report allow for that
  (backup 30 h, accounting audit 30 h, health watch 3 h, restore drill 8 days).
- **Vercel Hobby** is free and restricted to **non-commercial, personal use**.
  Relevant limits: 100 deployments/day, 45-minute build limit, 300 s maximum
  function duration, 1 hour of runtime logs, 100 cron jobs/project (this
  project configures none). Instant Rollback on Hobby can only target the
  **immediately previous** production deployment.
- **TiDB Cloud Serverless** free quota is tracked in
  `docs/free-tier-checklist.md`; keep the spending limit set.
- **Supabase** hosts the private backup bucket. Its free-tier quota was not
  re-verified in this audit; check the dashboard before relying on a larger
  backup volume.
- **Cloudflare Worker** stays on the free 100k requests/day allowance and is
  manual-dispatch only.

Schedules added: one weekly job. No workflow was added at a sub-hour cadence.

## Secrets by name only

| Workflow | Secrets / variables |
| --- | --- |
| `maintenance-report.yml` | `GITHUB_TOKEN` (automatic) |
| `ci.yml` | `GITHUB_TOKEN` (automatic) only; test values are inline placeholders |
| `daily-backup.yml` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or legacy `SUPABASE_KEY`), `CRON_SECRET` (or legacy `BACKUP_CRON_SECRET`), optional `APP_URL`, optional variable `SUPABASE_BACKUP_BUCKET` |
| `weekly-restore-drill.yml` | `CRON_SECRET` (or `BACKUP_CRON_SECRET`), optional `APP_URL` |
| `accounting-audit.yml` | `CRON_SECRET` (or `BACKUP_CRON_SECRET`), optional `APP_URL` |
| `health-watch.yml` | `GITHUB_TOKEN` (automatic) |
| `deploy-vercel.yml` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `db-reconcile.yml` | `DATABASE_URL` (or `PROD_DATABASE_URL`) — manual dispatch only |
| `prune-backups.yml` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY`), optional variable `SUPABASE_BACKUP_BUCKET` |
| `deploy-cloudflare.yml` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Never paste a value into an issue, artifact, log, or this document.

## Verified vs unverified (2026-10-23)

Verified in this audit:

- Repository is public; `main` requires `verify`, `test`, `e2e`, `browser-e2e`,
  and `worker`; force-push and deletion are blocked; admins are enforced.
- Latest CI on `main`: success, run `39553363277`, commit `d549c1f`, all five
  jobs green.
- Latest daily backup: success, run `39856826691` (2026-10-22T21:23:13Z).
- Latest restore drill: success, run `39238713369` (2026-10-19T10:36:55Z).
- Latest accounting audit: success, run `39763020988` (2026-10-22T10:25:45Z).
- Latest health watch: success, run `39868722400` (2026-10-22T22:58:51Z).
- Open issues: 0. Open PRs: 5, all Dependabot.
- `pnpm audit` at 2026-10-23: 2 critical, 20 high, 30 moderate, 9 low.
  `Verify dependency bumps` fails on this pre-existing finding; it is not a
  required check.
- Migration journal head: `0022_drop_drive_connections`.

Unverified / blocked:

- **Production migration state**: `UNKNOWN`. No production connection was made.
  `0022` requires the owner preflight and explicit approval — see
  `docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md`.
- **The new workflow on GitHub**: not run yet. Local YAML parse, the
  workflow-hardening gate, and the generator's unit tests pass.
- **Preview deployments**: whether Vercel Git integration creates them for this
  project was not verified (no Vercel token in this environment).
- **Backup bucket quota**: not re-checked.
- **Restored data correctness beyond counts**: the weekly drill compares
  recorded table counts and rolls back; it is not a full accounting
  reconciliation of every restored row.

## Manual approval boundaries

1. **Production migrations** — owner-only, after the read-only preflight in
   `docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md`.
2. **Production deploys** — automatic only after all five required CI checks
   pass; a manual `workflow_dispatch` is the override and still deploys `main`.
3. **Cloudflare Worker** — manual only.
4. **Schema reconcile apply** — manual only, with `APPLY-TO-PROD`.
5. **Backup deletion** — manual only, `apply=true`; the daily job's automatic
   prune is bounded by the floor guard in `scripts/lib/backup-retention.mjs`.
6. **Dependency majors** — explicit approval under `DEPENDENCY-POLICY.md`.
7. **Paid services** — none may be added; Vercel Hobby is non-commercial.
