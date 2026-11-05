# 03 — Security & Authorization Audit

Read-only security audit of Money_Tracker at commit `4f8e76c979acc0a79e8153d785f632c5a8211ad7` (2026-10-30). Companion to `01-CURRENT-SYSTEM-INVENTORY.md` (architecture/ops facts) and `02-FUNCTIONAL-ALGORITHM-AUDIT.md` (accounting logic). Every observation was verified by direct file reads; no tests were executed and no configuration was changed.

Severities: **Critical / High / Medium / Low / Info**. No Critical or High findings were found; the items below are hardening gaps and design review points.

## 1. Authentication

| Area | Verdict | Evidence & notes |
|---|---|---|
| Session token | OK | HS256 JWT (`jose`) signed with `SESSION_SECRET`; cookie-first, `Authorization: Bearer` fallback; DB-backed revocation checked on every request (`server/_core/sdk.ts:239-281` — a stolen JWT stops working once `users_sessions` is revoked). |
| Session lifetime | **Medium (design review)** | Sessions are 1-year cookies by explicit decision (`sdk.ts:149-152` rationale). Revocation covers logout/password-change, but a year is long for a finance app; no idle timeout. Recommend owner-approved TTL reduction (~30–90 days) or sliding refresh. |
| Cookie flags | OK | Session + OAuth transaction cookies: `httpOnly`, `sameSite=lax`, `secure` (incl. loopback for dev OAuth), path `/` (`server/_core/cookies.ts:31-70`). **Admin elevation cookie is `sameSite=strict`** (`:76-85`) — deliberately harder privilege. |
| Password storage | OK | scrypt with per-hash salt, `scrypt:<salt>:<key>` format, constant-time verify, dummy verify keeps timing uniform (`server/_core/passwordAuth.ts:89-122`, `shared/platform/crypto.ts:200+`). |
| Login defenses | OK | Express `authLimiter` on `/api/auth`, `/api/oauth`, all `/api/trpc/auth.*` (`server/_core/app.ts:259-265`); per-IP 15/15min + per-email lockout (`failed_login_attempts`), constant-time compare, pending/suspended gates, audit on failure (`server/routers/auth.ts:145-306`). |
| Password reset | OK | 256-bit base64url token, 60-min TTL, no email enumeration (`server/db.ts:515-544`); `resetPassword` revokes other sessions. Detail (Low): reset tokens stored cleartext in `users.resetToken` — hashing them at rest would blunt DB-read attacks. |
| OAuth | OK | Google + GitHub flows verify a state/transaction cookie before token exchange (`oauth.ts:369`); id-token verification at callback; redirect URI from a fixed env var (no open-redirect surface: redirect target is the configured callback, not a client-supplied URL). |
| AUTH_MODE coupling | OK | Server `AUTH_MODE` vs client `VITE_AUTH_MODE` mismatch fails fast (`scripts/check-auth-mode.mjs` at predev/prebuild; `env.ts:98-108`). |
| 2FA/admin elevation | OK (scoped) | Role-assigning and destructive admin routes require `elevatedAdminProcedure`: a live elevation cookie **or** inline password compared timing-safe, rate-limited 5/15min (`trpc.ts:163-248`, `routers.ts:444-490`). |

## 2. Authorization (RBAC)

| Area | Verdict | Evidence & notes |
|---|---|---|
| Identity source | OK | `ctx.user` derived **only** in `createContext` from the request (`server/_core/context.ts`); no procedure accepts a userId. Finance DB calls all go through `assertOwnedProject(userId, projectId)` (`db.ts:3463-3474`, 90+ call sites) plus object-level `assertOwnedAccount/Category/CanonicalAccountTx`. |
| Procedure guards | OK (verified sampling + BR-1 note) | Finance mutations use typed guards (`inputOnlyWithPermission(resource, action)` / `protectedWithPermission`) — compose `protected`/`inputOnly` with `requireResourcePermission`; exceptions audited (`authz.ts:11-30`). Role matrix: `voucher.approve/post/reverse` only for `ACCOUNTING_ADMIN`/`SUPER_ADMIN`; `SYSTEM_ADMIN` has no finance-write (`_core/rbac.ts:222-231`); INPUT_OPERATOR is strictly create-only (6 perms). Kitchen checks: admin/role routes via `elevatedAdminProcedure`; user/role pages via `adminProcedure`. |
| **BR-1** Guard coverage by name convention | **Low (hardening)** | Permission composition is applied per procedure by hand (`server/routers.ts`, ~90 procedures). Reviews rely on tRPC-type errors for a missing guard? No — a finance **query** registered with plain `protectedProcedure` would leak to any authenticated user; row-level `assertOwnedProject` still holds in the DB layer for the vast majority, but project-clearance consistency is enforced procedurally, not by a router-wide interceptor. A lint/test that scans every mutation procedure for one of the five guard factories would make regression impossible (analogous to the existing workflow-hardening gate). |
| F-09 regression | Locked | Sequentially-awaited role checks (no `Promise \|\| Promise`) — test-pinned. |

## 3. CSRF / Headers / CORS

| Area | Verdict | Evidence & notes |
|---|---|---|
| CSRF | OK (cookie=lax + same-origin CSP) | State-changing endpoints are tRPC POSTs with `sameSite=lax` cookies (cross-site POSTs don't send cookies); Bearer-only fallback does not auto-send; admin elevation cookie is `strict`. |
| CSP | OK | Prod: `scriptSrc 'self'` only; `objectSrc 'none'`, `frameAncestors 'none'`, `formAction 'self'`, `baseUri 'self'`; dev permits `unsafe-inline` scripts for Vite HMR (documented rationale `app.ts:96-130`). HSTS preload, nosniff, frameguard deny, Permissions-Policy restrictive (`app.ts:181-196`). |
| CORS | OK | Prod reflects Origin only for `APP_URL`/`CANONICAL_HOST`/`CORS_ALLOWED_ORIGINS` allowlist (no `*.vercel.app` wildcard `app.ts:137-171`); `Access-Control-Allow-Credentials` true but paired with allowlist. **Low**: dev reflects any origin with credentials — acceptable for localhost dev only. |
| Canonical-host redirect | OK | Non-canonical prod hosts 301→canonical (prevents cookie-scope confusion); health/scheduled paths bypass. |
| Body limits | OK | Path-aware: 2 MB default, 25 MB only on backup restore/preview paths (`app.ts:225-247`). |

## 4. Rate limiting / abuse

| Area | Verdict | Evidence & notes |
|---|---|---|
| Store | **Medium** | `MemoryRateLimitStore` is per-process. On Vercel serverless, each lambda instance keeps its own counters, so per-user limits (e.g., 30 voucher posts/15min) are multiplied by instance count; a burst can evade them. Worker target solves this with KV (`RATE_LIMIT_KV`). A DB- or edge-based store for the standalone/Vercel path is the owner-approved fix. |
| Coverage | OK | Every sensitive mutation has its own bucket (login IP/email, voucher create 50/15m, post 30/15m, reverse 20/15m, transactions 100/15m, CoA/bankrec/due/account/category, offline sync, elevation 5/15m) — `routers.ts` 11 `checkRateLimit` sites + Express-level auth limiter (`app.ts:259-265`). |
| KV swap | OK | `setRateLimitStore(KV)` wired in Worker boot (`worker/index.ts`); no-op elsewhere. |

## 5. Secrets & data exposure

| Area | Verdict | Evidence & notes |
|---|---|---|
| Secrets hygiene | OK | No secrets in code; `.env` never committed; `validateCriticalEnv` fails fast on missing DB/auth secrets and requires `ADMIN_ACCESS_PASSWORD` in prod (`env.ts:44-88`). CI uses placeholder secrets in isolated env. |
| Logging | OK | pino redact list covers password/passwordHash/headers tokens/cron secrets + regex scrub of query params (`_core/logger.ts:12-58`); slow-request logs omit query strings. |
| Client storage | OK (1 note) | Only cached display info in `localStorage` (`auth-runtime-user-info`); no tokens. **Low**: Preview-mode auto-login token is mirrored into `sessionStorage` for Safari/WebView header sessions (`client/src/_core/hooks/useAuth.ts:40-47`) — preview-scope session material in JS-readable storage; acceptable if preview logins are ephemeral, document + optionally gate to preview hosts. |
| Storage proxy | OK | `/api/storage/objects/:objectId` requires session auth, denies cron users, resolves ownership via `getPrivateStorageObjectForDownload(user.id, objectId)` — integer key only (no path traversal), streams from backend; `X-Download-Options: noopen` (`_core/storageProxy.ts:184-226`). |
| SQL injection | OK | Drizzle parameterizes `${...}` inside `sql` templates. The only raw-list interpolation, `IN (${voucherIds.join(",")})` (`db.ts:9367`), values are DB-derived integers from an already user+project-scoped select — not attacker-controlled. **Low (hardening)**: replace with `inArray()` to eliminate the pattern class. |
| Scheduled endpoints | OK | All `/api/scheduled/*` require timing-safe `CRON_SECRET`/`BACKUP_CRON_SECRET` (`scheduledBackup.ts:43-51`); `ADMIN_ACCESS_PASSWORD` explicitly never accepted; single GET+POST coverage prevents 404 method mismatch. |

## 6. Infrastructure posture (verified earlier phases)

- Branch protection: 5 required CI checks (strict, enforce_admins), no force-push/delete — GitHub-level enforcement of "never bypass CI" (`git gh api branches/main/protection`, verified Oct 30).
- Workflow hardening gate: SHA-pinned actions, `persist-credentials: false` (allowlisted exception documented), top-level permissions/concurrency/timeout — enforced by `scripts/check-workflow-hardening.mjs` in CI `verify`.
- Dependency policy: `jose` pinned exactly; semver-major + audit-high failures block (`scripts/check-dependency-policy.mjs`).
- Production DB access from CI: only the manual `db-reconcile` workflow holds `DATABASE_URL`, and it requires the literal `APPLY-TO-PROD` confirmation.

## 7. Security verdict

**No Critical/High findings.** The authn/authz stack is coherent (server-derived identity, DB-enforced ownership, role matrix mirrored in code+DB, escalation-gated admin writes). Highest-value owner-approved improvements, in order:

1. **S-1 (Medium)** Serverless rate-limit store: per-process memory counters undercount on scale-to-zero lambdas — adopt KV/DB-backed store on the Vercel target.
2. **S-2 (Medium)** Session TTL: 1-year cookie → shorter TTL with sliding refresh (needs owner product decision).
3. **BR-1 (Low)** Router-wide guard-coverage test (every mutation must carry a named guard factory).
4. **S-3 (Low)** Hash password-reset tokens at rest.
5. **S-4 (Low)** Replace the `IN (${ids.join(",")})` raw interpolation with `inArray` (`db.ts:9367`).
6. **S-5 (Info)** Preview-mode session mirror in `sessionStorage`; document or restrict to preview hosts.

All items require owner approval before implementation (Phase-00 safety gate).
