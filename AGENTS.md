# AGENTS.md

Money Tracker (আমার হিসাব) — personal/business finance app in BDT (৳). React 19 + Vite client, Express 5 + tRPC 11 server, Drizzle ORM on MySQL/MariaDB, plus a Cloudflare Worker runtime. pnpm 9.15.4 pinned, Node 22–24.

## Agent pipeline (active workflow)

This repo is worked on by a staged multi-agent pipeline — full ownership matrix in `docs/AGENT-TASK-MATRIX.md`:

1. **Fledge Alpha** = Brain (architecture, task matrix; no source edits)
2. **Nemotron (ATLAS)** = Accounting (`drizzle/`, `server/db.ts`, `accounting-core.ts`, migrations, invariants, idempotency)
3. **Nemotron Lightning (SENTINEL)** = Security (auth, sessions, RBAC, rate limits, secrets)
4. **MiMo 2.6 (FORGE)** = Backend (Express, tRPC routers, middleware, jobs, backups, Vercel api)
5. **Ling 3.1 (PRISM)** = Frontend (`client/`, React, wouter, TanStack Query, Tailwind)
6. **Big Pickle (GUARDIAN)** = Breaker/QA (full test gates, migration rehearsal, adversarial review)
7. **Space Bunny (HELIX)** = Final Boss (integration authority; may not approve with P0/P1 open)
- **Muse + LongCat + MiMo 2.5** = independent reviewers, no code ownership

Pipeline rules: one agent per branch/PR; read reports + `git status` before editing shared code; god-files `server/db.ts` (~9.4k LOC), `drizzle/schema.ts`, `package.json` are ATLAS-led — propose patches, inspect diffs first. Each agent writes `docs/<AGENT>-REPORT.md`.

## Commands

```bash
pnpm dev                 # dev server (tsx watch server/_core/index.ts)
pnpm check               # tsc --noEmit
pnpm lint                # eslint .
pnpm test                # vitest run (unit; server/, client/src/, scripts/)
pnpm build               # vite build + esbuild server bundle -> dist/
```

Verification order before opening a PR: `pnpm check && pnpm lint && pnpm test && pnpm build`.

- Single test: `pnpm exec vitest run server/<file>.test.ts`
- Coverage thresholds enforced: 70% stmts/funcs/lines, 60% branches.
- DB-backed suites need a **disposable** DB: `ISOLATED_E2E_DATABASE_URL='mysql://root:password@127.0.0.1:3306/money_tracker'` then `pnpm test:migrations`, `pnpm test:e2e:isolated`, or the hermetic suite. Some unit tests self-skip without a reachable DB.
- `pnpm test:worker` needs schema applied first: `node scripts/reconcile-migrations.mjs --url "$ISOLATED_E2E_DATABASE_URL"`.
- `pnpm test:browser:e2e` (Playwright) is unsupported on Android/Termux — CI only.
- `pnpm db:push` = `drizzle-kit generate && migrate` (requires `DATABASE_URL`). Never rewrite or delete existing migration files in `drizzle/`.

**Termux:** no `/usr/bin/env`, so `npm`/`npx` launchers may fail — always use `pnpm` and call scripts via `node scripts/...`. Do not create a `/usr/bin/env` symlink.

## Hard rules (test-enforced or ops-critical)

- `AUTH_MODE` (server) and `VITE_AUTH_MODE` (client) must match; `predev`/`prebuild` enforce it via `scripts/check-auth-mode.mjs`.
- Production DB is **read-only** for agents. Migration/schema rehearsals only on disposable DBs. No DROP/TRUNCATE, no prod data edits.
- All finance queries are scoped by the **server-derived** `userId`; never accept a user ID from the client. AuthZ lives on the server — do not move authorization authority into the frontend.
- Expense/income categories are a **fixed contract** (see README table; Bengali names are intentional). Tests verify them — don't make categories dynamic.
- Never weaken security or tests to make a suite green.
- Dependency changes follow `DEPENDENCY-POLICY.md`: no upgrade "because it's newer"; `jose` is pinned exactly; React 19 / Express 5 / Tailwind 4 / Vite 8 / Vitest 5 majors are already absorbed and need explicit approval to move. CI enforces this: the dependency-bump workflow fails on `pnpm audit --audit-level=high` and on any semver-major bump (`scripts/check-dependency-policy.mjs`; local check via `pnpm check:dep-policy`).
- `.env*` files are never committed. Secrets go through the hosting provider.

## Architecture map

- Three deploy targets from one tree: standalone Express (`server/_core/index.ts` → `dist/`), Vercel serverless (`api/[...path].js` via `pnpm build:vercel`), Cloudflare Worker (`worker/index.ts`, Hono shim, `wrangler deploy`; `cloudflare:sockets` is aliased to `worker/cloudflareSocketsStub.ts` in tests).
- Client root is `client/` (Vite `root`), aliases: `@/` → `client/src`, `@shared/` → `shared/`. Server entry: `server/_core/index.ts`; tRPC routers in `server/routers.ts` + `server/routers/`; schema in `drizzle/schema.ts`.
- Env layering mirrors Vite: `.env` → `.env.local` → `.env.<mode>` → `.env.<mode>.local` (later wins). On Vercel/Cloudflare, env files are NOT loaded (dashboard vars / `wrangler.toml [vars]` + secrets).
- Private object storage: Supabase Storage on Cloudflare (R2 disabled, see `wrangler.toml` comment), Vercel Blob on Vercel — selected by `server/_core/storageBackend.ts`.

## Repo hygiene notes

- Stray-file cleanup complete (2026-10-07): `fix_rbac.py`, `fix_rbac_test.py`, `fix_test.py`, `server/rbac-initializer.test.ts.orig/.bak` all deleted; tree clean. Flag any new untracked strays in agent reports before committing.
- `main` is protected: green CI required — `verify` → `test`, then `worker` / `e2e` / `browser-e2e` (all five are required status checks); force-push and branch deletion are blocked; `enforce_admins` is on, so no one bypasses it. CD deploys to Vercel after CI passes. **No approving-review requirement is configured** — the sole active committer is `@Rossy0109`, so requiring one would make every PR unmergeable. `.github/CODEOWNERS` routes review requests by pipeline domain but is advisory: `require_code_owner_reviews` is deliberately **off** for the same reason. Raise both only after a second owner with write access is active.
