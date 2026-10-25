# Maintenance Runbook

This runbook is for the repository owner. It covers the weekly automated
maintenance report, the existing scheduled jobs, and the safe response to each
failure. It never asks you to put a credential in a command line that is logged.

## Weekly triage (5 minutes)

1. Open **Actions → Automated Maintenance Report** (Monday 06:15 UTC / 12:15
   Asia/Dhaka) and download the `automation-report` artifact, or open the
   `Automated maintenance report` issue if one exists.
2. Read the two reports:
   - `maintenance-report.md` — scheduled-check states and dependency counts.
   - `lifecycle-report.md` — CI, backup/restore, open items, owner decisions.
3. Treat `UNKNOWN`, `BLOCKED`, and `STALE` as not-passing. Only `PASS` is a pass.
4. If an issue was opened, work the **ACTION REQUIRED** rows first.

Useful read-only commands:

```bash
gh run list --limit 20
gh run view <run-id> --log-failed
gh issue list --state open
gh pr list --state open
```

## Failure playbook

### CI failed on `main`

- A failed required check blocks merge and blocks CD (`deploy-vercel.yml` only
  deploys a successful CI run).
- Inspect the failed job; do not lower coverage thresholds, skip tests, or
  weaken assertions. Fix the code or revert.
- Required checks: `verify`, `test`, `e2e`, `browser-e2e`, `worker`.

### Daily backup failed or is stale (> 30 h)

1. Open **Actions → Daily Automated Finance Backup** and read the failing step.
2. Common causes, in order:
   - `CRON_SECRET` missing/rotated → set the secret (name only, in GitHub
     Settings).
   - Supabase bucket missing → the workflow tries to create it; if creation is
     denied, create `amar-hisab-backups` in the Supabase dashboard.
   - `stored != projects` or `verified != projects` → storage or integrity
     failure; do not call the backup recoverable.
3. Re-run the workflow. Do not trigger the endpoint manually with a different
   secret.
4. A backup is only recoverable after the weekly restore drill passes.

### Weekly restore drill failed or is stale (> 8 days)

1. Open **Actions → Weekly Restore Drill** and read `drill.json`.
2. `verified:false` means recovery is **not** proven. Do not mark it as working.
3. Check, in order: backup object exists, `BACKUP_ENCRYPTION_KEYS` still
   contains the key named by the envelope's `keyId`, checksum matches, table
   counts match.
4. Never restore over production. The drill restores to a new project and rolls
   back inside a transaction; keep it that way.

### Accounting audit failed

- This means double-entry invariants disagree (voucher lines, cached totals,
  ledger, journal, or trial balance).
- Read `violations` and `samples` in the workflow output.
- Do not "fix" the audit by changing thresholds. Find the voucher that broke
  the invariant; use the audit trail.
- Escalate before any data correction; production data is owner-only.

### Production health watch failed

- The probe retries three times, so a single blip does not alert.
- Check the Vercel deployment for `main` and the runtime logs (Hobby retains
  one hour).
- The workflow opens one issue and closes it automatically on recovery.

### Dependency audit reports critical/high

- `pnpm audit` is informational in the maintenance report and blocking only in
  the non-required `Verify dependency bumps` workflow.
- Follow `DEPENDENCY-POLICY.md`: no upgrade "because it is newer"; majors need
  explicit approval.
- Prefer a patched transitive version via a pnpm override, or a Dependabot PR
  that keeps the lockfile frozen. Do not remove the audit gate.
- Current known findings (2026-10-23): `dompurify` (critical), `tar` via
  `vercel` (critical), plus high findings in `@fastify/busboy`, `braces`,
  `undici`, `path-to-regexp`, `js-yaml`, and related transitive packages.

## Backup and recovery verification

- Backup destination: private Supabase bucket `amar-hisab-backups`
  (override with the `SUPABASE_BACKUP_BUCKET` repository variable).
- Encryption: AES-256-GCM; keyring `BACKUP_ENCRYPTION_KEYS` (first key
  encrypts, all keys decrypt). Never remove an old key while objects sealed
  with it are still inside the retention window.
- Retention: 90 days globally, minimum 7 per project. Deletion only matches
  `*-backup-YYYY-MM-DD-<checksum>.enc.json`.
- Manual restore procedure and key rotation: `docs/DISASTER-RECOVERY.md`.
- Only the weekly drill proves recoverability. Counts matching is necessary,
  not sufficient for full accounting correctness.

## Pending production migration (`0022_drop_drive_connections`)

1. Do **not** run `pnpm db:push`, `drizzle-kit migrate`, or the
   `DB Schema Reconcile` workflow in `apply` mode against production.
2. Run the read-only preflight from
   `docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md` with the production
   `DATABASE_URL` set locally (never in a shell that records history).
3. Confirm the migration-history table structure, the pending set, the
   `drive_connections` existence, and the finance/FK baselines.
4. Obtain explicit owner approval, then run `pnpm exec drizzle-kit migrate`.
5. Verify post-migration counts and the health endpoints, then update the
   report.

## Secret rotation

- `CRON_SECRET`: rotate in Vercel and GitHub together. All scheduled workflows
  fail loudly if it is missing — that is intentional.
- `BACKUP_ENCRYPTION_KEYS`: prepend the new key, keep the old one until all
  objects it sealed age out.
- `VERCEL_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN`,
  `DATABASE_URL`: owner-only, rotate in the provider dashboard and update the
  repository/environment secret. Never print the value.

## Disabling automation safely

- Pause a schedule: **Actions → workflow → ⋯ → Disable workflow**. This is
  reversible and does not delete code.
- Do not delete workflow files to silence a failure; that hides the signal and
  breaks the hardening gate's inventory assumptions.
- Do not add a second scheduler (Vercel cron, Cloudflare triggers, or another
  Actions cron) for the same job.

## Do-not-do list

- Do not run migrations, restores, or retention changes from a pull request,
  preview deployment, build, or test.
- Do not add a production `DATABASE_URL` to a scheduled workflow.
- Do not lower coverage thresholds or remove a required check.
- Do not commit `.env*`, tokens, or financial records.
- Do not assume a free-tier limit; re-check the provider page before changing a
  schedule or retention.
