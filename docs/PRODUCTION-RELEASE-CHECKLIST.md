# Production Release Checklist

Owner-facing checklist for releasing `main` to production. It separates what is
automatic from what always needs a human. Nothing here authorizes a database
migration; that has its own gate.

## 0. Scope and safety

- Production host: Vercel project `money-tracker-blond-pi`
  (`https://money-tracker-blond-pi.vercel.app`), region `sin1`.
- Database: TiDB Cloud Serverless (MySQL-compatible). Production credentials
  live only in the Vercel dashboard.
- The repository is public and `main` is protected. Required checks:
  `verify`, `test`, `e2e`, `browser-e2e`, `worker`. Force-push and branch
  deletion are blocked; admins are enforced.
- A release must not change authentication, accounting rules, backup
  destination, or the database schema without an explicit owner decision.

## 1. Before opening the pull request

- [ ] `pnpm check` passes locally.
- [ ] `pnpm lint` passes locally.
- [ ] `pnpm test` passes; coverage is not lowered.
- [ ] `pnpm build` succeeds.
- [ ] If migrations changed: a disposable MariaDB rehearsal passed
      (`ISOLATED_E2E_DATABASE_URL=... pnpm test:migrations`).
- [ ] No `.env*`, secret, token, or financial record is staged.
- [ ] Dependency changes follow `DEPENDENCY-POLICY.md`; majors are called out
      for approval.

## 2. Pull request gates (automatic)

- [ ] `verify` — frozen-lockfile install, typecheck, lint, workflow-hardening
      gate, build, Bengali font check.
- [ ] `test` — full unit suite with the enforced coverage thresholds on
      MariaDB.
- [ ] `e2e` — migration rehearsal, hermetic DB suite, isolated server E2E.
- [ ] `browser-e2e` — Playwright against a disposable database.
- [ ] `worker` — Worker runtime tests and a `wrangler` dry-run build.
- [ ] `Verify dependency bumps` may be red because of pre-existing advisories;
      it is **not** a required check. Record it, do not hide it.

Do not merge with a failing required check. Do not weaken a check to merge.

## 3. Merge and deploy (automatic)

- [ ] Merge to `main`.
- [ ] `CI` runs on `main`.
- [ ] `Deploy to Vercel (CD)` triggers from `workflow_run` only when CI
      concluded `success` and `head_branch == main`.
- [ ] The CD checkout pins the validated `head_sha`, so a fast follow-up push
      cannot change what is deployed.
- [ ] If `VERCEL_TOKEN` is unset, CD warns and does nothing; production is not
      silently updated.

## 4. Post-deploy verification

- [ ] `GET /api/healthz` returns 200.
- [ ] `GET /api/trpc/auth.me` returns 200 with a JSON body (or 401/403/429 —
      not 500).
- [ ] `GET /` returns 200.
- [ ] The new deployment is the one aliased to the production domain.
- [ ] `Production Health Watch` stays green for the next 15-minute cycle.
- [ ] If a migration was approved and applied, re-check the finance table and
      foreign-key counts from
      `docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md`.

## 5. Database migration gate (separate, owner-only)

This is **never** part of a normal release.

- [ ] Run the read-only preflight in
      `docs/PRODUCTION-MIGRATION-0022-SAFETY-GATE.md`.
- [ ] Confirm the migration-history table structure and the complete pending
      set; do not assume the latest journal entry is pending.
- [ ] Confirm the latest backup is fresh and the weekly restore drill passed.
- [ ] Obtain explicit written owner approval.
- [ ] Apply with `pnpm exec drizzle-kit migrate` (never `pnpm db:push`).
- [ ] Verify post-migration counts and health; record the result.

Automation never applies production migrations. A migration is not "done"
because CI is green.

## 6. Rollback

### Application

Vercel **Instant Rollback** exists and was verified against the current Vercel
documentation:

- On the **Hobby** plan it can only target the **immediately previous**
  production deployment.
- After a rollback, Vercel turns off auto-assignment of production domains, so
  new pushes will not replace the rolled-back deployment. Use **Undo Rollback**
  (dashboard) or `vercel promote <deployment>` (CLI) to restore normal
  behaviour.
- Rollback restores the previous build and its environment-variable snapshot;
  it does not revert database changes.

If Instant Rollback is unavailable or insufficient, re-deploy the last known
good commit through **Actions → Deploy to Vercel (CD) → Run workflow** after
checking out that commit on `main` (manual dispatch deploys the current `main`
SHA, so confirm the SHA first).

### Database

- There is no automatic schema rollback. `DROP TABLE` is irreversible.
- Recovery is a restore from the encrypted Supabase backup to a **new**
  database, followed by verification and an explicit connection switch. See
  `docs/DISASTER-RECOVERY.md`.
- The weekly restore drill is the only automated proof that a backup can be
  restored. A backup that has not passed a drill is not labelled recoverable.

### Worker / Pages

- Cloudflare Worker: manual dispatch only; redeploy the previous commit.
- GitHub Pages redirect: static; revert the commit.

## 7. Free-tier guardrails

- Vercel Hobby is for **non-commercial, personal use**. Confirm the use case
  before treating this as a production plan for a business.
- Hobby limits: 100 deployments/day, 45-minute build, 300 s maximum function
  duration, 1 hour of runtime logs.
- GitHub Actions: public repository, standard runners free; keep artifact
  retention short (7–14 days).
- Do not add paid monitoring, analytics, or backup services. The existing
  backup destination and health checks are sufficient.

## 8. After the release

- [ ] Confirm `Automated Maintenance Report` reflects the new CI run and a
      green backup/restore status.
- [ ] Close or update any owner-decision items in
      `lifecycle-report.md`.
- [ ] If a rollback happened, record the reason and the restored deployment in
      the next report.
