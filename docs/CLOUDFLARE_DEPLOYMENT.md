# Cloudflare Workers Deployment

**Branch:** `cloudflare-migration`
**Runtime:** Cloudflare Workers (Hono + tRPC fetch adapter + R2 + KV + Cron)
**Database:** existing MySQL/TiDB over `connect()` outbound TCP (no Hyperdrive)

The Vercel path (`vercel.json`, `server/vercel-handler.ts`, `api/[...path].js`) is
untouched and stays deployable until the Worker path is verified in production.

---

## 1. Prerequisites

| Requirement | Why |
|---|---|
| `compatibility_flags = ["nodejs_compat"]` | Already set in `wrangler.toml`. Required for `process.env.*` access and for the `node:fs` / `node:path` / `@aws-sdk/client-s3` imports pulled in by `server/cloudBackupService.ts`. **Do not remove it** — without it the Worker fails at boot. |
| `compatibility_date = "2025-09-01"` | ≥ 2025-04-01, so `nodejs_compat` also populates `process.env` from bindings/secrets (`nodejs_compat_populate_process_env`). |
| R2 bucket `money-tracker-storage` | Private object storage (replaces Vercel Blob). |
| KV namespace | Rate limiting (`RATE_LIMIT_KV`). |
| Outbound TCP to MySQL/TiDB | Worker uses `connect()` from `cloudflare:sockets`; the DB host must be reachable from Cloudflare's network (public TiDB/MySQL endpoint). |
| Workers Paid plan for `connect()` | `connect()` (outbound TCP) requires a paid Workers plan. |

---

## 2. One-time setup

```bash
pnpm install

# R2 bucket (matches wrangler.toml [[r2_buckets]])
npx wrangler r2 bucket create money-tracker-storage

# KV namespace for rate limiting — paste the returned id into wrangler.toml
npx wrangler kv namespace create RATE_LIMIT_KV
```

Edit `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "<id printed by wrangler kv namespace create>"

[vars]
APP_URL = "https://your-domain.com"   # your real origin for OAuth redirects
```

### Secrets

Secrets are read through `process.env`, so they are set with `wrangler secret put`:

```bash
npx wrangler secret put DATABASE_URL            # mysql://user:pass@host:3306/money_tracker
npx wrangler secret put SESSION_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_BOOTSTRAP_EMAIL
npx wrangler secret put ADMIN_ACCESS_PASSWORD
npx wrangler secret put OWNER_OPEN_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put GOOGLE_OAUTH_REDIRECT_URI
npx wrangler secret put GITHUB_CLIENT_ID        # optional
npx wrangler secret put GITHUB_CLIENT_SECRET    # optional
npx wrangler secret put CRON_SECRET
npx wrangler secret put BACKUP_ENCRYPTION_KEY
npx wrangler secret put BACKUP_RETENTION_DAYS
# optional email / S3 backup integrations
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_WEBHOOK_URL
```

`AUTH_MODE` / `VITE_AUTH_MODE` are plain `[vars]` in `wrangler.toml` and must stay
identical (enforced by `scripts/check-auth-mode.mjs` at build time).

---

## 3. Build & verify locally

```bash
pnpm check            # tsc --noEmit
pnpm lint             # eslint
pnpm test             # main suite (no MySQL required)
pnpm test:worker      # worker suite (needs a local MySQL/MariaDB)
pnpm build            # vite build → dist/public
pnpm build:worker     # wrangler deploy --dry-run --outdir dist-worker
```

`wrangler deploy --dry-run` is the authoritative bundle check: it uses wrangler's
own esbuild config (conditions `workerd`/`worker`/`browser`, `nodejs_compat`
unenv polyfills). A plain `npx esbuild --platform=browser` run is **not** a valid
check for this Worker and will report false errors.

> **Note on Termux/Android:** `workerd` has no Android build, so `wrangler dev`
> and local proxying do not work on this machine. `--dry-run` (bundling only)
> works. Run real verification on CI/Linux or in the Cloudflare dashboard.

---

## 4. Deploy

### Via CI (recommended)

`.github/workflows/deploy-cloudflare.yml` runs on push to `main`:

1. `verify` — typecheck, lint, main test suite
2. `worker-tests` — worker suite against a MariaDB service container
3. `build` — `pnpm build` + `wrangler deploy --dry-run`
4. `deploy` — `pnpm build` + `pnpm exec wrangler deploy`

Required repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Manually

```bash
pnpm build
npx wrangler deploy
```

---

## 5. Architecture mapping

```
Browser → Cloudflare Worker (Hono)
            ├── /api/healthz
            ├── /api/*          Express route capture + HTTP shim
            ├── /api/trpc/*     @trpc/server/adapters/fetch
            ├── /api/auth/*     rate-limited (50 / 15 min, KV store)
            ├── /api/storage/*  R2-backed private downloads
            ├── /api/scheduled/* cron compat handlers
            └── env.ASSETS.fetch() → SPA (dist/public, single-page fallback)

Worker → connect() → mysql2 stream adapter → Drizzle → MySQL/TiDB
Worker → RATE_LIMIT_KV  → distributed rate limiting
Worker → R2_BUCKET      → private objects + encrypted backups
Worker → crons          → recurring/bill-reminder/daily-sweep/backup jobs
```

Key injection points (business logic stays unchanged):

| Injection | File | Used by |
|---|---|---|
| `setDbHandle()` | `server/_core/dbConnection.ts` | all `server/db.ts` queries |
| `setRateLimitStore()` | `server/_core/rateLimiter.ts` | login/OAuth rate limits |
| `setR2Bucket()` | `server/_core/storageBackend.ts` | `storageProxy.ts` downloads |
| `createShimRequest/Response` | `worker/httpShim.ts` | OAuth + storage routes |

---

## 6. Verification checklist after deploy

1. `GET /api/healthz` → `200 {"ok":true,...}` with CSP / nosniff / frame headers.
2. Login (password or Google) → session cookie set, no rate-limit false positive.
3. tRPC call from the SPA (`/api/trpc/system.health`) → 200 superjson.
4. `GET /api/storage/objects/<id>` as an authenticated user → file streams with
   `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, correct
   `Content-Disposition`.
5. Cron: `wrangler tail` while a trigger fires (18:00 UTC recurring, 01:00 UTC
   daily sweep) — or invoke with `POST /api/scheduled/...` + `CRON_SECRET`.
6. DB: confirm the Worker actually reaches MySQL (a failing `connect()` shows up
   as 500s on any DB-backed route; `wrangler tail` shows the socket error).
7. Vercel deployment still healthy (rollback path must stay valid).

**Known unverifiable locally:** the `connect()` DB path cannot be exercised on
Android/Termux (no `workerd` binary) — production/CI verification is required.

---

## 7. Coexistence with Vercel

- Keep `vercel.json`, `server/vercel-handler.ts`, `api/[...path].js`, and the
  `build:vercel` script until the Worker is verified.
- The Express app (`server/_core/app.ts`) and its tests are the Node-path source
  of truth; Worker changes are additive on top of the same business logic.
- Do not delete Vercel config or force-push while both paths are live.
