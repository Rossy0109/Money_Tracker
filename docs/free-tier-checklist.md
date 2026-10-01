# Free-tier checklist — $0/month operating cost

Verified 2026-09-30. Every integration in this project is either on a free
tier or optional-off. Keep it that way with the guardrails below.

## What we use (all free)
| Service | Tier | Notes |
|---|---|---|
| Vercel hosting | Hobby (free) | Project `money-tracker-blond-pi`, region `sin1` (close to users, lower latency) |
| TiDB Cloud | Serverless free tier | Cluster `356891`, `ap-southeast-1`, state ACTIVE, public endpoint open to all (required for Vercel) |
| Google OAuth | Free | Client ID/secret in Vercel env; redirect URI must exactly match production URL |
| GitHub OAuth | Free, optional | Blank = login button hidden, app still works |
| Sentry | Optional-off | Code only inits when `SENTRY_DSN` is set — no DSN = $0 and zero overhead; still unprovisioned (needs a Sentry account/DSN) |
| Vercel Blob / S3 / Supabase / Drive backups | Optional-off | All env-gated in `cloudBackupService.ts`; unset = local-only backups, $0 |
| Umami analytics | Optional-off | Both `VITE_ANALYTICS_*` blank = no script injected |
| GitHub Actions CI | Free | Public repo = unlimited minutes |
| GitHub Actions health watch + backup verification | Free | 15-min probe (`health-watch.yml`) opens a repo issue on outage; the daily backup job asserts response counts **and** re-reads the `audit_logs` row via the cron-protected `/api/scheduled/backup-audit` endpoint (no prod DB credentials in Actions) |
| Cloudflare worker | Free tier | Only billed if used; `wrangler deploy` stays within 100k req/day free allowance |

## Guardrails (do not break these)
1. **Vercel Hobby allows max 2 cron jobs** — `vercel.json` already uses both
   (`finance-backup`, `daily-sweep`). Never add a third without upgrading.
2. **TiDB Serverless free quota** — monitor RU/storage in TiDB Cloud dashboard
   (or `ticloud serverless list -p <project-id> -o json`). Set a spending
   limit in TiDB Cloud so an accident can never bill.
3. **DB pool is 10 connections per serverless instance**
   (`server/_core/dbConnection.ts`). Fine at current traffic; if concurrent
   cold starts grow, lower it instead of raising TiDB limits.
4. **Never commit secrets** — `.env*` is gitignored; production values live
   only in Vercel dashboard (`vercel env ls` to audit names).
5. **OAuth redirect URIs** — Google Cloud Console + GitHub OAuth app must list
   exactly `https://money-tracker-blond-pi.vercel.app/api/auth/*/callback`.
   A mismatch shows a provider error page, not an app bug.

## Known outage class (fixed 2026-09-30)
`server/_core/rbac-initializer.ts` passed the raw `DATABASE_URL` string to
mysql2, whose legacy parser mangled TiDB's `?ssl={...}` param and silently
connected to `127.0.0.1:3306` → every cold start logged
"RBAC initialization failed" and authenticated pages (projects.list, …)
returned 500 → "page not loading". Fixed by parsing with WHATWG URL
(`parseDatabaseUrl`) and passing explicit options; regression-covered in
`server/_core/rbac-initializer.test.ts`. If "page not loading" ever returns,
check first: `vercel logs --environment production --level error -n 30`.
