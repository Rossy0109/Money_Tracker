# Cloudflare Compatibility Audit

**Date:** 2026-09-27
**Branch:** `cloudflare-migration`
**Scope:** Full repository audit for Cloudflare Workers runtime compatibility

---

## 1. Executive Summary

The application is currently a Node.js/Express + Vite/React monorepo deployed on Vercel.
This audit identifies every Node.js-only API usage and proposes a Workers-compatible
replacement. The migration preserves all business logic, accounting integrity, RBAC,
audit logging, authentication, voucher lifecycle, financial reports, tests, and UI.

**Database strategy:** The existing MySQL/TiDB database is preserved. No data migration
is performed. The Worker connects via Cloudflare's `connect()` outbound TCP API with
mysql2 (no Hyperdrive). Local development and tests use direct mysql2 connections.

---

## 2. Current Architecture

| Layer | Technology | Key Files |
|---|---|---|
| Frontend | React 19, Vite 8, wouter, Tailwind 4, tRPC client | `client/` |
| Backend | Express 5, tRPC 11, helmet, pino, express-rate-limit | `server/_core/` |
| Database | Drizzle ORM + mysql2 → TiDB/MySQL | `server/_core/dbConnection.ts`, `drizzle/` |
| Auth | Custom JWT (jose) + scrypt + Google/GitHub OAuth + admin HMAC elevation | `server/_core/sdk.ts`, `passwordAuth.ts`, `oauth.ts` |
| RBAC | DB-backed roles/permissions, tRPC middleware | `server/_core/trpc.ts`, `rbac.ts` |
| Storage | Vercel Blob (private objects), S3/Supabase (backups) | `storageProxy.ts`, `cloudBackupService.ts` |
| Cron | Vercel Cron (2 jobs) | `vercel.json`, `scheduled*.ts` |
| Deploy | Vercel (`api/[...path].js`), Dockerfile | `vercel.json`, `build-vercel-api.mjs` |

---

## 3. Node-Only API Findings

### 3.1 Server Runtime

| File | Node-Only API | Why Incompatible | Proposed Replacement | Status |
|---|---|---|---|---|
| `server/_core/index.ts` | `node:http`, `node:net`, `process.on/exit`, `@sentry/node` | Workers have no port/process model | Removed (Worker entrypoint replaces) | Pending |
| `server/_core/app.ts` | express, helmet, pino-http, express-rate-limit, `@trpc/server/adapters/express` | No Express in Workers | Hono + `@trpc/server/adapters/fetch` | Pending |
| `server/_core/vite.ts` | express.static, `fs`, vite dev server | Dev-only; no FS in Workers | `env.ASSETS.fetch()` for static serving | Pending |
| `server/_core/logger.ts` | pino (Node streams) | No Node streams in Workers | Workers JSON logger (console.log) | Pending |
| `server/_core/rateLimiter.ts` | in-memory `Map` + `setInterval` | Per-isolate state; not distributed | KV-backed store | Pending |
| `server/_core/oauth.ts` | Express `Request/Response` | No Express req/res | HTTP shim from Fetch Request | Pending |
| `server/_core/storageProxy.ts` | `@vercel/blob`, `node:stream.Readable` | Vercel-only SDK | R2 binding | Pending |
| `server/cloudBackupService.ts` | `node:crypto.createCipheriv`, `node:fs/promises`, `node:path`, `@aws-sdk/client-s3` | No AES-GCM cipher in Workers; no FS | Web Crypto AES-GCM, R2 binding | Pending |
| `server/scheduledBackup.ts` | `node:crypto.createCipheriv/randomBytes` | Same as above | Web Crypto | Pending |
| `server/_core/passwordAuth.ts` | `node:crypto.scrypt` (callback) | No scrypt in Web Crypto | `@noble/hashes/scrypt` (Worker) / node:crypto (Node) | Pending |
| `server/_core/googleOAuth.ts` | `node:crypto.createHash/randomBytes/timingSafeEqual` | Web Crypto equivalents exist | Platform crypto abstraction | Pending |
| `server/_core/githubOAuth.ts` | Same as above | Same | Same | Pending |
| `server/_core/adminSession.ts` | `node:crypto.createHmac` | Web Crypto HMAC | Platform crypto abstraction | Pending |
| `server/_core/idempotency.ts` | `node:crypto.createHash` | Web Crypto SHA-256 | Platform crypto abstraction | Pending |
| `server/timingSafe.ts` | `node:crypto.createHash/timingSafeEqual` | Web Crypto + custom compare | Platform crypto abstraction | Pending |
| `server/db.ts` | `node:crypto.createHash/randomBytes` | Same | Platform crypto abstraction | Pending |
| `server/_core/auditContext.ts` | `node:crypto.randomUUID` | `crypto.randomUUID()` exists in Workers | Direct use | Pending |
| `server/_core/rbac-initializer.ts` | `node:crypto.createHash` | Web Crypto | Platform crypto abstraction | Pending |
| `server/healthChecks.ts` | `process.env.VERCEL_URL` | Vercel-specific | Remove Vercel branch for Worker | Pending |
| `server/vercel-handler.ts` | `node:http` (types only) | Preserved for Vercel coexistence | No change | N/A |

### 3.2 Database

| File | Node-Only API | Why Incompatible | Proposed Replacement | Status |
|---|---|---|---|---|
| `server/_core/dbConnection.ts` | `drizzle-orm/mysql2` (mysql2 pool) | No raw TCP in Workers | `connect()` outbound TCP API + mysql2 stream adapter | Pending |

### 3.3 Dependencies

| Package | Issue | Resolution |
|---|---|---|
| `express` | Node-only HTTP framework | Replaced by Hono in Worker path; preserved in Node path |
| `helmet` | Express middleware | Replaced by manual header middleware in Worker path |
| `pino` / `pino-http` | Node streams | Replaced by Workers JSON logger in Worker path |
| `express-rate-limit` | Express middleware + in-memory | Replaced by KV-backed Hono middleware in Worker path |
| `@vercel/blob` | Vercel-only SDK | Replaced by R2 binding in Worker path |
| `@aws-sdk/client-s3` | AWS SDK (works in Workers but unnecessary) | Replaced by R2 binding in Worker path |
| `@sentry/node` | Node SDK | Replaced by `@sentry/cloudflare` or Cloudflare built-in tracking |
| `google-auth-library` | Not imported in server code | Remove from package.json |
| `googleapis` | Not imported in server code | Remove from package.json |
| `mysql2` | Works in Workers via `connect()` stream adapter | Keep with adapter |

### 3.4 Positive Findings

- `@trpc/server/adapters/fetch` exists in installed tRPC 11 — provides `createFetchRequestHandler` with `{ req: Request, resHeaders: Headers }` context, ideal for cookie handling.
- `jose` (JWT/JWKS) works in Workers (pure JS/WASM).
- `superjson` transformer works in Workers.
- `cookie` package (parseCookie) works in Workers.
- `server/drive/*` is stubbed (returns null/empty) — no real Google Drive API dependency.
- `google-auth-library` / `googleapis` are in package.json but **not imported** — safe to remove.
- `mysql2` supports `createConnection({ stream })` — accepts a custom stream object, enabling `connect()` adapter.

---

## 4. Migration Strategy

### 4.1 Runtime Architecture

```
Browser → Cloudflare Worker (Hono)
            ├── /api/healthz, /api/* (Hono routes with Express shim)
            ├── /api/trpc/* (tRPC fetch adapter)
            ├── /api/auth/*, /api/oauth/* (OAuth routes with HTTP shim)
            ├── /api/storage/* (R2-backed)
            ├── /api/scheduled/* (HTTP cron compat)
            └── env.ASSETS.fetch() → SPA (dist/public, SPA fallback)

Worker → connect() outbound TCP → mysql2 stream → Drizzle → TiDB/MySQL
Worker → KV binding → rate limiting
Worker → R2 binding → private storage + encrypted backups
Worker → Cron triggers → scheduled jobs
```

### 4.2 Database Connection (No Hyperdrive)

The Worker uses Cloudflare's `connect()` outbound TCP API to create a socket to the
MySQL/TiDB server. This socket is wrapped in a stream adapter compatible with mysql2's
`createConnection({ stream })` option. Drizzle ORM is preserved.

**Production:** `connect()` → mysql2 stream → Drizzle → TiDB/MySQL
**Local dev/tests:** Direct mysql2 connection (DATABASE_URL)

The `setDbHandle()` injection pattern allows the Worker and tests to provide a
Drizzle instance without changing any business logic.

### 4.3 Crypto Abstraction

A platform crypto module (`shared/platform/crypto.ts`) provides async functions
that use `node:crypto` in Node and Web Crypto + `@noble/hashes` in Workers.
All existing call sites are updated to use the async API.

### 4.4 Express Compatibility

The Express app (`server/_core/app.ts`), Vercel handler (`server/vercel-handler.ts`),
and API route (`api/[...path].js`) are preserved unchanged. The Worker path is
additive. Both runtimes coexist until the Worker path is verified in production.

---

## 5. Risk Assessment

| Risk | Mitigation |
|---|---|
| `connect()` API not available in all Workers plans | Document requirement; fallback to HTTP bridge |
| mysql2 stream adapter complexity | Thoroughly tested in Node; production verification in Phase 12 |
| Crypto abstraction changes Node behavior | Node impl wraps existing node:crypto (identical output) |
| Existing tests break | All tests run against Node path; Worker tests added alongside |
| RBAC/accounting regression | No changes to business logic; all existing tests must pass |

---

## 6. Migration Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Read-only audit | Complete |
| 1 | Platform crypto abstraction | Pending |
| 2 | DB injection + connect() adapter | Pending |
| 3 | Rate limiter KV + storage R2 | Pending |
| 4 | Worker skeleton (Hono, shim, context) | Pending |
| 5 | Route wiring | Pending |
| 6 | Security headers, CORS, logger | Pending |
| 7 | Cron handlers | Pending |
| 8 | wrangler.toml + CI/CD | Pending |
| 9 | Tests | Pending |
| 10 | Documentation + verification | Pending |
