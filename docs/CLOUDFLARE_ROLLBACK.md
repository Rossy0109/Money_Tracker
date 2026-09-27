# Cloudflare Rollback

Use this when the Worker path misbehaves in production. The Vercel deployment is
kept intact precisely so rollback is a config switch, not a code change.

---

## 1. Immediate rollback (traffic back to Vercel)

Nothing in the repo needs to change — the Vercel path is untouched:

1. Point the custom domain / DNS back at Vercel:
   - Cloudflare DNS: set the `A`/`CNAME` record for the app host back to Vercel's
     target (or disable the Worker route binding for that host).
   - Alternatively remove the route from the Worker: `npx wrangler triggers
     deploy` after editing `wrangler.toml`, or in the dashboard under
     **Workers & Pages → money-tracker → Triggers**.
2. Confirm Vercel is still building: `vercel.json` + `api/[...path].js` +
   `server/vercel-handler.ts` were never removed.
3. Verify: `GET https://<your-domain>/api/healthz`.

Estimated recovery: DNS propagation only (minutes).

---

## 2. Roll back Worker code

```bash
# List recent versions
npx wrangler versions list

# Deploy a previously known-good version
npx wrangler versions deploy

# Or redeploy the last git good state
git log --oneline            # find the SHA before the regression
git checkout <good-sha> -- worker/ server/ wrangler.toml
npx wrangler deploy
git checkout cloudflare-migration   # restore working tree
```

Deployment is immutable per upload, so a bad deploy never destroys a prior
version — `wrangler versions` always retains it.

---

## 3. What to check first when the Worker breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker fails to boot / "process is not defined" | `compatibility_flags = ["nodejs_compat"]` removed | Restore it in `wrangler.toml` |
| 500 on every DB-backed route | `connect()` unreachable (DB not public, wrong `DATABASE_URL`, or plan lacks outbound TCP) | Check `wrangler tail`; verify host:port is publicly reachable |
| 500 at boot only in Worker | Runtime detection (`isWorkersRuntime`) or missing binding | `wrangler tail` on a fresh deploy |
| 503 on `/api/storage/objects/*` | `R2_BUCKET` binding missing or bucket empty | Re-add binding / confirm object keys migrated |
| 429 on logins | KV namespace id placeholder left in `wrangler.toml` | Create KV namespace and set `id` |
| Login works, SPA assets 404 | `dist/public` not built before deploy | `pnpm build` then `wrangler deploy` |

---

## 4. Data safety during rollback

- No schema migration is exclusive to the Worker: `drizzle/` migrations are the
  same for both paths, and `pnpm test:migrations` rehearses them against an
  isolated database.
- No data is written only by the Worker. Rolling back DNS/code never orphans
  rows.
- Backups continue on whichever runtime is live (Vercel cron or Worker
  `triggers.crons`); verify at least one ran after the rollback.

---

## 5. Verify after rollback

1. `GET /api/healthz` → 200.
2. Login + one ledger write (create a voucher) → accounting totals unchanged.
3. RBAC: non-owner user still denied an owner-only mutation.
4. Audit trail: the action above appears in the audit log.
5. Scheduled jobs: confirm the active runtime still fires (Vercel dashboard cron
   or `wrangler tail`).
