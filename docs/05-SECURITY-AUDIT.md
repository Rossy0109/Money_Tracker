# 05 — Security Audit (PHASE 04) — Deep, Evidence-Based

Scope commit `4f8e76c979acc0a79e8153d785f632c5a8211ad7`, audited 2026-10-30. This phase goes field-by-field through the security checklist and verifies **server-side enforcement** (what a raw curl/tRPC call can achieve), not UI behavior. Complements `03-SECURITY-AUTHORIZATION-AUDIT.md`.

Evidence classes used:
- **S** — static trace: file:line showing the enforcement; reproducible by reading the code.
- **C** — command reproduction: exact request an attacker/agent would send and the expected server response (server-level effect, no UI).
- **T** — test pin: named test in the repo that fails if regressed (executable in CI; NOTE blocked locally — see §12).
- **R** — runtime scan executed in this session.

No Critical/High vulnerabilities were confirmed. Each checklist item below carries its verdict + evidence.

## 1. OAuth authentication — VERDICT: STRONG

- Login start (`/api/google-login`) is gated by `ENV.authMode !== "google"`; callback validates **state + signed transaction cookie**: mismatch → `403 {"error":"invalid google oauth state"}` before any token exchange (`server/_core/oauth.ts:365-372`, **C**: `curl 'https://<host>/api/google-callback?code=x'` → 403 without the provider-set cookie).
- Id-token verification is layered: discovery fetched from the constant `GOOGLE_DISCOVERY_URL` with a 10s timeout; **every discovery endpoint is allowlisted to https google/googleapis hosts** (`assertGoogleEndpoint`, `server/_core/googleOAuth.ts:268-281`); token verified via remote JWKS with `issuer` and `audience` pinned (`:266-269`), then claims (incl. `nonce` from the transaction cookie) re-validated. **No open-redirect surface**: redirect URI is a fixed env var, never client-supplied.
- GitHub flow mirrors the same transaction-cookie pattern (`server/_core/oauth.ts:450-530`).
- Cookie flags for transaction cookies: `httpOnly`, `sameSite=lax`, secure; cleared with maxAge -1 on completion (`cookies.ts:61`).

## 2. AUTH_MODE configuration — VERDICT: ENFORCED

- Server `AUTH_MODE` and compiled `VITE_AUTH_MODE` must agree; `predev`/`prebuild` fail the build otherwise (`scripts/check-auth-mode.mjs`, **T**: referenced in package.json hooks). Password-mode-only procedures reject google sessions and vice versa (`shared/` schemas mirrored). Discovery, account creation defaults (pending status) enforce least privilege at registration (`routers/auth.ts:70-144`).

## 3. Session & cookie security — VERDICT: OK, one design review item

- HS256 JWT + **DB revocation check on every request** (`sdk.ts:260-271`) — a stolen token dies with logout/password change (**C**: login → logout → reuse JWT in `Authorization: Bearer` → 401 UNAUTHORIZED).
- Flags: `httpOnly`, `path=/`, `sameSite=lax`, `secure` (auto for https/loopback); **admin elevation cookie `sameSite=strict`** (`cookies.ts:76-85`).
- **Session TTL 1 year** (`sdk.ts:149-152`) — design-review item (S-2 in 03), Medium. Evidence: `maxAge: ONE_YEAR_MS`.

## 4. RBAC implementation — VERDICT: STRONG

- Roles in DB (`roles/permissions/user_roles/role_permissions`, migration 0014) checked **per request** (`_core/rbac.ts:36-50`); F-09 regression (Promise `\|\|`) test-pinned (`rbac.test.ts` + client mirror).
- Contract the audit brief cares about: `isFinanceAdmin` = SUPER_ADMIN∥ACCOUNTING_ADMIN; **`SYSTEM_ADMIN` deliberately has no financial write authority** (`_core/rbac.ts:222-231`); INPUT_OPERATOR holds exactly 6 create-only perms (`shared/rbac.ts:311-319`).

## 5. Permission enforcement at the SERVER level (direct API calls) — VERDICT: COMPLETE

Full procedure census of `server/routers.ts` (**S**, reproducible by the grep recipe in §11):
- **124 procedures, 0 unguarded**: 88 `protectedWithPermission(resource, action)`, 26 `inputOnlyWithPermission`, 3 `adminProcedure`, 7 `elevatedAdminProcedure`. Zero plain `protectedProcedure`/`publicProcedure` in the finance/admin/projects routers; the only public procedures are `system.health`/`healthReport` and auth `me/login/register…` (by design, rate-limited).
- Guard chain on a restricted call (**C** for `voucher.approve/proVoucher`-type operation, `curl -X POST /api/trpc/finance.approveVoucher` with an INPUT_OPERATOR cookie → `FORBIDDEN`; unauthenticated → `UNAUTHORIZED`); enforcement points: `requireUser` rejects unauth + pending + suspended **before** any handler (`_core/trpc.ts:37-68`), `requireResourcePermission` → DB-backed `hasPermission` → denial audited via `auditPermissionDenied` (`authz.ts:11-59`).
- Second factors: `admin.assignRole`/`updateUserStatus`/audit queries require **elevation cookie or inline password** compared timing-safe at 5/15min rate limit (`trpc.ts:163-248`, `routers.ts:444-490`) — role self-upgrade via direct API is not possible for a plain admin cookie. Backup restore additionally requires the literal `"RESTORE_NEW_PROJECT"` confirmation value in the payload (`routers.ts:864`), verified by `inputOnlyWithPermission("backup","restore")`.
- **Privilege-escalation paths checked and closed**: no procedure mutates the caller's own roles; role assignment only via `admin.assignRole` (elevated + audit); INPUT_OPERATOR has no user-management permission; finance-write attempt by `MANAGER`/`SYSTEM_ADMIN` rejected at `hasPermission` (role matrix `shared/rbac.ts:225-290`), and again at row level (creator/submitter checks).

## 6. Unauthorized API access — VERDICT: REJECTED (server-side)

- Unauthenticated finance/admin calls fail at tRPC middleware — 401 `UNAUTHORIZED` (`trpc.ts:37-68`); suspended/pending users also rejected. **C**: `curl -s -X POST https://<host>/api/trpc/finance.trialBalance -d '{"projectId":1}'` → 401 (no session).
- Cross-tenant (IDOR): every finance DB call re-checks ownership (`assertOwnedProject`, `db.ts:3463-3474`, ±90 sites + `assertOwnedAccount/Category`); a valid user calling with another user's `projectId` gets "Project not found or access denied" — tested in `accounting-core.test.ts:899-936` (**T**).

## 7. Input validation — VERDICT: STRONG

- Zod schema at every procedure boundary (124/124; `.input()` required); money: `finite().positive().max(999999999999.99)`, future-date guard ≤30d (`routers.ts:40-75`); voucher double-entry in exact cents via `superRefine` (`:104-113`).
- Request-body caps: 2 MB default / 25 MB only on restore/preview paths (`app.ts:225-247`).

## 8. SQL injection — VERDICT: NO confirmed vulnerability

- All SQL via Drizzle parameterization. Raw `sql`` usages enumerated (18 total) interpolate **column references or drizzle-bound values only**. The single string-interpolated list, `IN (${voucherIds.join(",")})` (`db.ts:9367`), contains integers selected from the caller-scoped `finance_vouchers` rows one statement earlier — not attacker-controlled (**S** trace; **recommend replacing with `inArray()`**, S-4).
- ORDER BY/identifiers: no user-controlled identifier or fragment reaches `sql.raw`/`orderBy` (grep `sql.raw` → 0).

## 9. XSS & CSRF exposure — VERDICT: NO confirmed vulnerability

- XSS: prod CSP `scriptSrc 'self'`, `objectSrc none`, `frameAncestors none` (`app.ts:102-130`); React auto-escaping; the only `dangerouslySetInnerHTML` builds a `<style>` blob from developer-controlled `chartConfig` colors (`client/src/components/ui/chart.tsx:70-95`) — no user-data path found (grep over `client/src`). F-01 evidence: Bengali fonts delivered from `'self'` in dist (CI-verified), so no inline-script/polyfill holes.
- CSRF: tRPC mutations are POST with `sameSite=lax` cookie (cross-site POSTs omit cookies) + Bearer-only fallback; elevation cookie `strict`. Prod CORS reflects Origin only for the allowlist (`app.ts:137-171`) — no wildcard-with-credentials. **C**: a cross-site form posting to `/api/trpc/finance.postVoucher` from another origin sends no session cookie → 401.

## 10. Secret leakage & infrastructure — VERDICT: OK

- `validateCriticalEnv` fails fast without DB/auth secrets and **requires `ADMIN_ACCESS_PASSWORD` in prod** (`env.ts:44-88`) — no silent default-password mode; no hardcoded secrets (grep: plaintext creds only in concrete CI test env — placeholders).
- Client bundle receives `VITE_AUTH_MODE` only (mode flag, not a secret); session material stays in an `httpOnly` cookie (one preview-only `sessionStorage` mirror, S-5 Low).
- Logs redact passwords/tokens/cron secrets + scrub query strings (`_core/logger.ts:12-58`).
- `.env` never committed; provider-managed vars; branch protection + workflow hardening + dependency gates documented in §03 (verified against the live GitHub branch-protection API).

## 11. Financial audit-trail integrity — VERDICT: STRONG

- Per-voucher trail `finance_voucher_audit`: rows written **inside** each transition transaction with `{from,to}` snapshots; FK `onDelete: "restrict"` so it cannot be cascade-deleted (`drizzle/schema.ts:641-667`).
- Application `audit_logs`: FK `restrict` on actor; runtime mutating API deliberately absent — `deleteAuditLogs()` **throws by design** ("Audit logs are append-only", `server/audit.ts:99-107`) and no procedure calls an audit mutation beyond `logAudit`.
- Reproducible (**C**): search tRPC router for any procedure exposing audit deletion → none; only `admin.auditLogs/auditLogExport/auditActivity`, all `elevatedAdminProcedure` **queries** (`routers.ts:590-619`).
- 5-level numeric audit runs nightly (`accountingAudit.ts:44-51`) → invariant violations are surfaced (`accounting_invariants_failed` row + workflow assertion), not deleted.

## 12. Dependency vulnerabilities — VERDICT: CLEAN (runtime scan)

- **R**: `pnpm audit --audit-level=high` in this session → `No known vulnerabilities found` (exit 0). Reproducible command above.
- CI enforcement (**T**): `dependency-bump-check.yml` fails on `audit --audit-level=high` and any semver-major bump; `jose` pinned exactly (`6.2.12`); React 19/Express 5/Vite 8/Vitest 5 majors accounted in `DEPENDENCY-POLICY.md`.

## 13. Backup encryption — VERDICT: STRONG

- AES-256-GCM (`shared/platform/crypto.ts`), envelope `finance-encrypted-cloud-backup-v1` = `IV(12B)+ciphertext+GCM tag+keyId` + sha256 checksum.
- Keyring (`BACKUP_ENCRYPTION_KEYS`): first key encrypts, all decrypt; `keyId=sha256(secret)[:16]` stamped; **restore path rejects an envelope whose keyId matches no configured key** (`backupIntegrity.ts:241-266`) and refuses checksum mismatch; offline decrypt script same refusal (`scripts/decrypt-cloud-backup.mjs:162-167`).
- Retention deletion matches only `<project>-backup-YYYY-MM-DD-<hash>.enc.json` names with a per-project floor of 7 newest (`scripts/lib/backup-retention.mjs:17-114`) — no wildcard deletes.

## 14. Blocked runtime verification (disclosed, per Phase-00)

- Local execution of the pinned security suites (`rbac.test.ts`, `auth.test.ts`, `vercelRouting.test.ts`, `idempotency.test.ts`) is **blocked in this environment**: vitest cannot start — rolldown native binding for `android-arm64` loads but the `wasm32-wasi` fallback module is absent in `node_modules` (startup error: "Cannot find native binding… @rolldown/binding-wasm32-wasi"). Fixing by reinstalling dependencies is **forbidden** by the Phase-00 safety policy; these suites run green in CI on every PR (jobs `verify`/`test`).
- No live instance was probed beyond the described request shapes (no production DB access; read-only policy).

## 15. Reproduction recipes summary (all server-side)

```bash
# 1. Unauthenticated restricted call → 401 (middleware, not UI)
curl -s -X POST https://<prod>/api/trpc/finance.trialBalance \
  -H 'content-type: application/json' -d '{"projectId":1}'           # UNAUTHORIZED

# 2. Low-privilege authenticated call → FORBIDDEN (RBAC DB check)
#    (requires a session belonging to INPUT_OPERATOR/VIEWER)
curl -s -X POST https://<prod>/api/trpc/finance.approveVoucher \
  -b 'session=<requested-cookie>' -H 'content-type: application/json' \
  -d '{"projectId":1,"voucherId":1,"action":"approve"}'              # FORBIDDEN + audit row

# 3. Role self-upgrade impossible without elevation
#    (assignRole = elevatedAdminProcedure; needs elevation cookie or ADMIN_ACCESS_PASSWORD)
curl -s -X POST https://<prod>/api/trpc/admin.assignRole -b 'session=<admin-cookie>' …  # FORBIDDEN

# 4. OAuth callback without provider transaction cookie → 403
curl -s 'https://<prod>/api/google-callback?code=anything'           # 403 invalid state

# 5. Dependency gate (reproducible)
pnpm audit --audit-level=high                                        # → No known vulnerabilities

# 6. Guard coverage census (reproducible)
grep -cE '^\s+\w+: (protectedWithPermission|inputOnlyWithPermission|adminProcedure|elevatedAdminProcedure)' server/routers.ts   # 124
grep -cE '^\s+\w+: (publicProcedure|protectedProcedure)' server/routers.ts                                                     # 0
```

## Verdict

Every restricted operation is enforced server-side at the middleware + DB-ownership layers; the 124/124 guard coverage, append-only audit trail, Google-endpoint-allowlisted OAuth, keyring-bound backup crypto, and a clean dependency scan show **no confirmed privilege-escalation, injection, CSRF, XSS, or secret-leakage vulnerability**. Open security items remain the design-review/hardening ones from `03` (S-1 rate-limit store, S-2 session TTL, S-3/S-4/S-5, BR-1). Owner approval required before any change.
