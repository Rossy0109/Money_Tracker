# SENTINEL REPORT — Phase 2 (Security + Auth + RBAC)

**Agent:** SENTINEL (Nemotron 3.5 Lightning Free role)
**Date:** 2026-10-06
**Scope:** Google OAuth, password auth, sessions, JWT, cookies, CORS, CSRF, RBAC, permissions, admin elevation, ownership, rate limiting, secrets, idempotency. Read-only.

---

## 1. Authentication

| Mechanism | Status | Notes |
|---|---|---|
| **Google OAuth** (OIDC) | ✅ Strong | PKCE (S256), state+nonce+verifier in HttpOnly cookie (`__Host-google_oauth`), discovery endpoint validation, issuer/audience/nonce verification, timing-safe email compare for admin bootstrap (`oauth.ts:360-365`), email_verified required (`googleOAuth.ts:241`) |
| **GitHub OAuth** | ✅ Strong | PKCE not used (GitHub doesn't support it), state in `__Host-github_oauth` cookie, user email fallback to primary verified email or noreply, admin bootstrap same pattern (`githubOAuth.ts:80-87, 183-185`) |
| **Password auth** | ✅ Strong | scrypt (N=16384, r=8, p=1), 64-byte key, 16-byte salt, constant-time verification via dummy hash (`passwordAuth.ts:127-147`), strength policy (≥8, upper/lower/digit/special, no repeats, common patterns), per-email+IP lockout after 5 failures (15 min) in DB (`oauth.ts:128-139`), login history + audit on success/fail |
| **Session** | ✅ Strong | JWT (HS256) in `__Host-` prefixed cookie, `HttpOnly`, `Secure`, `SameSite=Lax` (`cookies.ts:52-53`), 1-year TTL, dual verification: JWT signature + server-side `user_sessions` revocation table (`sdk.ts:262-271`), Bearer header fallback for Safari ITP (`sdk.ts:247-252`) |
| **Admin elevation** | ✅ Strong | Separate HMAC-SHA256 token (`ADMINBearer <token>` header or `__Host-admin_session` cookie, `SameSite=Strict`, 15 min TTL, constant-time verify, bound to RBAC admin role check (`adminSession.ts:40-113, 147-173`), re-verification password prompt for elevated mutations (`trpc.ts:215-236`) |
| **Password reset** | ✅ Adequate | Token with expiry (1h), generic response (no enumeration), email delivery via webhook/Resend, dev mode shows token, rate limited (5/hr) (`auth.ts:357-461`) |

---

## 2. Authorization (RBAC)

| Aspect | Status | Notes |
|---|---|---|
| **Model** | ✅ Sound | Single source of truth in `shared/rbac.ts` (server + client), 8 roles, 14 categories, 46 permissions, least-privilege matrix, `INPUT_OPERATOR` is input-only (6 permissions: `auth.login`, `auth.logout`, `accounting.create`, `budget.create`, `payroll.create`, `voucher.create`) |
| **Enforcement** | ✅ Comprehensive | tRPC middleware: `protectedProcedure` (auth + status), `inputOnlyProcedure` (any create perm), `adminProcedure`/`elevatedAdminProcedure` (RBAC admin roles only), `requirePermission` / `requireResourcePermission` family (`authz.ts`), audits denials (`authz.ts:11-30`) |
| **Maker≠checker** | ✅ Enforced | `voucher.submit` → `voucher.approve` → `voucher.post` → `voucher.reverse` blocked for same user (`db.ts:1380-1387, 1554-1555, 2764-2766`); self-approval/self-posting/self-reversal blocked at API and DB |
| **Ownership scoping** | ✅ Verified | Every finance mutation calls `assertOwnedProject(userId, projectId)`; router context passes only `ctx.user!.id`; all queries filter `userId`+`projectId` (`db.ts:1310,1540,2847` etc.) |
| **Legacy `users.role`** | ✅ Ignored | `adminProcedure` explicitly relies on RBAC only; legacy `user.role` is display/migration only (`trpc.ts:122-130`) |

---

## 3. Transport / Cookie Security

| Setting | Value | Assessment |
|---|---|---|
| Session cookie (`COOKIE_NAME`) | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, path `/` | ✅ Strong |
| OAuth transaction cookies | `__Host-google_oauth`, `__Host-github_oauth`, `SameSite=Lax`, `Secure`, 10 min TTL | ✅ Strong |
| Admin elevation cookie | `__Host-admin_session`, `SameSite=Strict`, `Secure`, 15 min TTL | ✅ Strong |
| Secure detection | `isSecureRequest` checks `req.protocol`, `x-forwarded-proto`, localhost exception for dev (`cookies.ts:5-29`) | ✅ Correct for Vercel/Cloudflare |
| CORS | Prod: allow-list (`APP_URL`, canonical host, `CORS_ALLOWED_ORIGINS`), `Vary: Origin`, credentials allowed. Dev: allow all (`app.ts:138-162`) | ⚠️ **Dev allows all origins with credentials** — acceptable for local dev only; ensure `CORS_ALLOWED_ORIGINS` set in prod |

---

## 4. Rate Limiting

| Layer | Status | Notes |
|---|---|---|
| **Express** (`express-rate-limit`) | Configured globally in `app.ts` (not read here) | |
| **tRPC / Auth endpoints** | ✅ Applied | IP-based (`rateLimiter.getClientIp` uses `x-forwarded-for`), per-endpoint windows: register 20/15m, login 15/15m, set-password 5/15m, forgot 5/1h (`auth.ts:64-70, 136-142, 340-346, 365-370`), disabled in tests/isolated E2E (`rateLimiter.ts:83-88`) |
| **Password lockout** | ✅ DB-backed | Per email+IP, 5 failures → 15 min lockout, cleared on success (`oauth.ts:128-139, 198-199`) |

---

## 5. Idempotency

| Scope | Status | Notes |
|---|---|---|
| **Framework** | ✅ Robust | INSERT-first claim on `(userId, idempotencyKey, route)` unique index, request body hash (stable deep stringify + SHA-256), outcomes: `claimed`/`replay`/`in_progress`/`conflict`, TTL 24h, release on handler error, finalize on success (`idempotency.ts:76-163`) |
| **Applied mutations** | ⚠️ Gap | `createVoucher` ✅, `postVoucher` ✅ (with rate limit), `createTransaction` (DB-level unique key `finance_transactions_idempotency_unique`), **`settleDue` missing** (ATLAS flagged P1) |
| **Worker/Cloudflare** | Unknown | KV-backed store pluggable via `setRateLimitStore` (`rateLimiter.ts:42`) — not verified |

---

## 6. Secrets / Configuration

| Secret | Enforcement | Notes |
|---|---|---|
| `SESSION_SECRET` / `JWT_SECRET` | Required at startup (`validateCriticalEnv`, `env.ts:78-86`), at least one must exist | ✅ |
| Google OAuth secrets | Required when `AUTH_MODE=google` (`env.ts:88-96`) | ✅ |
| Admin bootstrap email | Timing-safe compare against OAuth identity email (`oauth.ts:360-365, 480-487`) | ✅ |
| Admin access password (`ADMIN_ACCESS_PASSWORD`) | Checked at elevation time (`trpc.ts:222-228`) | ✅ |
| Backup encryption key | Required for backups (`env.ts`) | ✅ |
| Supabase keys | Worker path only (`SUPABASE_SERVICE_ROLE_KEY` or `ANON_KEY`) | ✅ |

---

## 7. Test Coverage (security-specific)

| Test | Status |
|---|---|
| `auth-rate-limit.test.ts` | ✅ |
| `auth.logout.test.ts` | ✅ |
| `authorization.test.ts` | ✅ |
| `oauth-login.timing-safe.test.ts` | ✅ |
| `oauth.google-route.test.ts` | ✅ |
| `passwordAuth.test.ts` | ✅ |
| `permissions.test.ts` | ✅ |
| `rbac-initializer.test.ts` | ✅ |
| `input-only-permissions.test.ts` | ✅ |
| `input-operator-security.test.ts` | ✅ |

---

## 8. Red Flags / Risks

| ID | Severity | Finding |
|---|---|---|
| S-01 | **P1** | `settleDue` mutation has **no idempotency middleware** and no DB-level idempotency key — client retry can double-settle a due while `outstandingAmount >= amount` (`routers.ts:1376-1389`). ATLAS also flagged. |
| S-02 | **P2** | CORS in development allows **any origin with credentials** (`app.ts:156-158`). Safe for localhost only; ensure prod `CORS_ALLOWED_ORIGINS` is set and no wildcard. |
| S-03 | **P2** | `googleOAuth` / `githubOAuth` callbacks return JSON errors (401/403) but also redirect on success; if client mishandles, OAuth state could leak in URL history. State is in HttpOnly cookie (good), but ensure no `state` in redirect URL (it isn't). |
| S-04 | **P3** | `adminSession.ts:27` falls back `SESSION_SECRET` → `JWT_SECRET`; if both rotate independently, elevation tokens signed with one may not verify with the other. Document that both must rotate together or use a dedicated `ADMIN_TOKEN_SECRET`. |
| S-05 | **P3** | `sdk.ts:82-88` creates a **mock OAuth provider** when no providers configured (test/dev). Ensure this path is never reachable in production (checked by `validateCriticalEnv` requiring `DATABASE_URL` + auth secrets, but `AUTH_MODE=google` without Google creds falls to mock — `env.ts` validates Google creds only when `AUTH_MODE=google`, so if misconfigured it could hit mock). |
| S-06 | **P3** | Rate limiter `MemoryRateLimitStore` is **per-process** — on multi-instance Vercel/Cloudflare, limits are not shared unless KV store is plugged in. `setRateLimitStore` hook exists but not verified wired in production. |
| S-07 | **P4** | `cookies.ts` localhost exception for `Secure` cookie is correct for dev but ensure `APP_URL` in prod is HTTPS so `isSecureRequest` returns true. |

---

## 9. Summary

| Area | Verdict |
|---|---|
| **Auth (OAuth + password)** | Strong — PKCE, constant-time, lockout, audit, revocation |
| **RBAC / Authorization** | Sound — single source of truth, enforced at tRPC middleware + DB, maker≠checker, ownership scoping |
| **Session / Cookies** | Strong — `__Host-`, HttpOnly, Secure, SameSite, short-lived elevation, revocation |
| **Rate limiting** | Adequate — per-endpoint auth limits, DB lockout, but per-process store needs KV for prod scale |
| **Idempotency** | Strong framework, **one P1 gap (`settleDue`)** |
| **Secrets / Config** | Enforced at startup, admin bootstrap timing-safe |
| **CORS** | Prod allow-list, dev permissive (acceptable) |

---

## 10. Recommendations for FORGE / GUARDIAN / HELIX

- **FORGE:** add `.use(idempotent)` + `idempotencyKey` input to `settleDue`; wire KV store for rate limiter if multi-instance; consider dedicated `ADMIN_TOKEN_SECRET`.
- **GUARDIAN:** add security regression tests for S-01 (double settle), S-02 (CORS origin reflection in dev), S-04 (token secret rotation), S-06 (multi-instance rate limit); verify `mock` provider never activates in prod.
- **HELIX:** confirm `CORS_ALLOWED_ORIGINS` set in Vercel/Cloudflare env; verify session secret rotation procedure.

---

## Unchanged-by-me constraint honored

- No source edits. No secret exposure. No weakening of security controls.
- Working tree dirty (`server/_core/app.ts`, `dbConnection.ts`, `db.ts`, `scheduledBackup.ts`, `package.json`, `pnpm-lock.yaml`, `rbac-initializer.test.ts`) — triage before any auth/RBAC edits.