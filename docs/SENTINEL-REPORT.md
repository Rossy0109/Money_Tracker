# SENTINEL REPORT — Phase 2 (Security + Auth + RBAC)

**Agent:** SENTINEL (Big Pickle role)
**Model:** Big Pickle (currently available OpenCode model)
**Date:** 2026-10-09
**Branch:** `agent/sentinel/security`
**Scope:** Google/GitHub OAuth, password auth, sessions/JWTs/cookies, RBAC, admin elevation, ownership, rate limiting, input-only restrictions, secrets, self-approval prevention.

---

## 0. HANDOFF ACCEPTANCE (ATLAS → SENTINEL)

```
PREVIOUS_AGENT: ATLAS
COMMIT_VERIFIED: NOT_APPLICABLE (no commit — uncommitted in shared workspace)
FILES_VERIFIED: YES (docs/ATLAS-REPORT.md, 304 lines; read-only inspection)
TEST_RESULTS_VERIFIED: YES (174 DB-backed accounting tests; 27 migrations; FK restrict; cents-safe arithmetic; 8 idempotent mutations)
KNOWN_RISKS_REVIEWED: YES (A-01/A-02 optional idempotencyKeys documented)
HANDOFF_STATUS: ACCEPTED
REASON: Atlas verified schema/migration/accounting invariants with no new P0/P1; Sentinel scope independent.
```

---

## 1. COMPLETION REPORT (REQUIRED FORMAT)

```
AGENT: SENTINEL (Big Pickle)
MODEL: Big Pickle
ROLE: SECURITY AND AUTHENTICATION
TASK_SCOPE: OAuth, sessions, RBAC, rate limiting, admin elevation, input-only, secrets, self-approval
STATUS: COMPLETE

TASKS_ASSIGNED:
- Fix S-01: rate-limit auth.resetPassword (public tRPC proc had no per-endpoint throttle)
- Fix S-03: audit input-only deny path (requireCreatePermission emitted no permission_denied event)
- Fix S-04: fail-fast ADMIN_ACCESS_PASSWORD validation in production
- Fix S-05: setPassword must revoke other active sessions
- Document S-02 (internal self-reversal bypass) + S-06 (Express auth relies on app-level limiter)
- Verify Atlas handoff and preserve no-weakening-of-security rule

TASKS_COMPLETED:
- S-01 FIXED: auth.resetPassword now calls checkRateLimit (60m/5, IP-keyed, "auth-reset-password")
- S-03 FIXED: requireCreatePermission emits permission_denied audit before throwing FORBIDDEN
- S-04 FIXED: validateCriticalEnv requires ADMIN_ACCESS_PASSWORD when NODE_ENV=production
- S-05 FIXED: setPassword revokes all recorded sessions except the caller's live token
- S-02 DOCUMENTED: internal enforceSelfCheck:false / _internalPostedBy paths handed to FORGE/GUARDIAN
- S-06 DOCUMENTED: app-level authLimiter (50/15m) already covers raw Express auth routes
- New additive db helper revokeAllSessionsExcept (reviewed god-file patch)

FILES_CHANGED:
- server/_core/authz.ts           (export auditPermissionDenied for reuse)
- server/_core/trpc.ts            (audit input-only denials)
- server/_core/env.ts             (prod ADMIN_ACCESS_PASSWORD validation)
- server/routers/auth.ts          (resetPassword rate limit; setPassword revocation; extractSessionToken helper)
- server/db.ts                    (revokeAllSessionsExcept — additive, Atlas-owned god-file, diff reviewed)
- server/routers/auth.test.ts     (S-01/S-03/S-05 router tests)
- server/_core/env-auth-mode.test.ts (S-04 validateCriticalEnv tests)
- server/input-only-permissions.test.ts (added revokeAllSessionsExcept mock)
- server/db.hermetic.test.ts      (DB-backed revocation test)

TYPECHECK: PASS
LINT: PASS
BUILD: PASS
SECURITY_CHECK: PASS
ACCOUNTING_CHECK: NOT_APPLICABLE (no accounting logic changed)
REGRESSION_CHECK: PASS (full suite + coverage, see §4)

RISKS_FOUND:
- S-01 (P3): resetPassword public proc lacked per-endpoint rate limit
- S-02 (P3): db.ts internal self-reversal/self-posting bypasses on transaction update/delete + wallet-opening reconciliation
- S-03 (P3): input-only denials not audit-logged
- S-04 (P3): ADMIN_ACCESS_PASSWORD not fail-fast validated
- S-05 (P4): setPassword did not revoke other sessions
- S-06 (P4): raw Express auth routes rely only on app-level limiter

RISKS_FIXED:
- S-01, S-03, S-04, S-05

RISKS_REMAINING:
- S-02 (handed to FORGE/GUARDIAN — db.ts god-file, accounting domain)
- S-06 (acceptable: app-level limiter + DB lockout cover it; add per-route limiter as hardening)

ENVIRONMENTAL_LIMITATIONS:
- Termux: browser E2E unsupported (CI only); coverage verified with disposable MariaDB
- Node v26 vs pinned engine >=22 <25 (warnings only)

DEPENDENCIES:
- FORGE: inspect S-02 reachability (transaction update/delete reverse own voucher); wire KV rate-limit store for multi-instance if needed
- GUARDIAN: regression tests for S-01/S-03/S-04/S-05; adversarial review of admin inline-password fallback

BLOCKERS: none

NEXT_AGENT: FORGE (Backend and API)

RECOMMENDATION: PROCEED to Forge. No unresolved P0/P1. Two P3/P4 items documented for follow-up.
```

---

## 2. AUDIT FINDINGS (this phase, read-only audit → fixed)

| ID | Sev | Finding | File → Fix |
|---|---|---|---|
| S-01 | P3 | `auth.resetPassword` (public) had no tRPC `checkRateLimit`; only the app-level `authLimiter` (50/15m) throttled it | `server/routers/auth.ts` → added 60m/5 IP-keyed limit (mirrors `forgotPassword`) |
| S-03 | P3 | `requireCreatePermission` denied silently — no `permission_denied` audit event, unlike `authz.ts` helpers | `server/_core/trpc.ts` → calls `auditPermissionDenied(ctx, "input-only:create")` before FORBIDDEN |
| S-04 | P3 | `ADMIN_ACCESS_PASSWORD` is functionally required by `admin.verifyAccess`/`elevatedAdminProcedure` but not in `validateCriticalEnv` — a misconfigured prod deploy silently disabled elevated admin writes | `server/_core/env.ts` → `NODE_ENV=production` fail-fast |
| S-05 | P4 | `setPassword` changed the hash but left other devices' sessions live | `server/routers/auth.ts` + `server/db.ts` → revoke all sessions except caller's token |
| S-02 | P3 | Internal `reverseVoucherInTx(enforceSelfCheck:false)` (`db.ts:2754,5163,5805,5896`) lets a user reverse/rebuild their own voucher via transaction update/delete + wallet-opening reconciliation — bypasses the documented no-self-reversal contract; `self-approval-prevention.test.ts` does not cover these paths | **DOCUMENTED → FORGE/GUARDIAN.** Not changed: `db.ts` is Atlas-owned; disposal requires a reviewed, approved 4-eyes policy decision |
| S-06 | P4 | Raw Express `/api/auth/*` (`oauth.ts:50,114,279,...`) rely only on the app-level `authLimiter` | **DOCUMENTED (acceptable)** — login additionally has DB-backed lockout; `resetRateLimit` clears on success |

Stale prior-report findings re-checked:
- Old S-01 (settleDue no idempotency, P1): **RESOLVED** — Atlas confirmed `.use(idempotent)` on `settleDue` (`routers.ts:1573`).
- Old S-02 (CORS dev any origin): unchanged; dev-only permissive, prod allow-lists via `CORS_ALLOWED_ORIGINS`. HELIX should confirm prod var set.
- Old S-05 (mock OAuth provider): residual — mock activates only when zero providers configured; `AUTH_MODE=google` validation covers Google creds. Low risk.

---

## 3. CONFIRMED-STRONG CONTROLS (re-verified, no changes needed)

| Area | Verdict |
|---|---|
| Google OAuth | PKCE S256 + state + nonce, HttpOnly `__Host-` transaction cookie, discovery/issuer/audience/nonce validation, timing-safe bootstrap-email compare (`googleOAuth.ts`) |
| Password auth | scrypt (64-byte key, 16-byte salt), constant-time verify incl. dummy-hash timing uniformity, strength policy, DB lockout (5/15m) |
| Sessions | JWT HS256 HS256 + server-side `user_sessions` revocation table; liquidations on logout/password-reset; HttpOnly/Secure/SameSite=Lax cf. `cookies.ts` |
| Admin elevation | HMAC-SHA256 token, SameSite=Strict, 15m TTL, RBAC role bound, re-verify inline password constant-time (`adminSession.ts`, `elevatedAdminProcedure`) |
| RBAC | Single source `shared/rbac.ts`; INPUT_OPERATOR = exactly 6 create-only perms; enforcement on server (`protectedWithPermission`/`inputOnlyWithPermission`); UI hiding is not a control |
| Ownership | All finance queries scoped by server-derived `ctx.user!.id`; `assertOwnedProject` everywhere |
| Public surface | Only `health` + `auth.{me,register,login,logout,forgotPassword,resetPassword}` are `publicProcedure`; no finance data exposed publicly |
| Secrets | All from env; no hardcoded secrets; logger redacts (asserted in `security-hardening.test.ts`) |

---

## 4. TEST EVIDENCE

### Targeted (non-DB)
```
pnpm exec vitest run server/routers/auth.test.ts server/_core/env-auth-mode.test.ts \
  server/_core/authz.test.ts server/input-only-permissions.test.ts
→ 4 files, 130 tests passed

pnpm exec vitest run server/auth-rate-limit.test.ts server/input-operator-security.test.ts \
  server/security-hardening.test.ts server/self-approval-prevention.test.ts \
  server/auth.logout.test.ts server/session-jwt.test.ts
→ 6 files, 157 tests passed
```

### DB-backed (disposable MariaDB → torn down)
```
ISOLATED_E2E_DATABASE_URL=... pnpm exec vitest run server/db.hermetic.test.ts
→ 28 tests passed  (includes new revokeAllSessionsExcept test)
```

### Full gate (matches CI `test` job)
```
ISOLATED_E2E_DATABASE_URL=... pnpm test:coverage
→ Statements 70.57%  (≥70 ✅)    Branches 61.73%  (≥60 ✅)
  Functions   71.06%  (≥70 ✅)    Lines     71.93%  (≥70 ✅)   exit 0
```
Thresholds pass (improved from pre-phase 70.46/61.58/70.93/71.82 baseline).

### Static gates
```
pnpm check → PASS      pnpm lint → PASS      pnpm build → PASS   pnpm check:dep-policy → n/a (no deps changed)
```

---

## 5. HANDOFF TO FORGE

```
PREVIOUS_AGENT: SENTINEL
NEXT_AGENT: FORGE (Backend and API)
COMMITS: none (uncommitted in shared workspace on agent/sentinel/security)
HANDOFF_VERIFIED: YES
KNOWN_RISKS_REVIEWED: YES (S-02 needs explicit 4-eyes policy decision; S-06 hardening optional)
HANDOFF_STATUS: ACCEPTED
ACTION_FOR_FORGE:
- Inspect S-02 reachability: transaction update/delete + wallet-opening reconciliation reverse own voucher (db.ts:2754, 5163, 5805, 5896) and decide/document the approved exception under segregated duties
- Idempotency: verify claim/release/finalize wiring on all 8 idempotent mutations + settleDue already guarded
- Wire distributed rate-limit store (KV) if multi-instance scaling is expected
- Confirm ADMIN_ACCESS_PASSWORD present in Vercel/Cloudflare prod env (new fail-fast)
```

---

## 6. SECURITY POSTURE SUMMARY

No P0/P1. Four findings fixed (S-01, S-03, S-04, S-05), two documented for follow-up (S-02 → Forge/Guardian; S-06 → optional hardening). Security controls were only strengthened; no test was weakened or deleted to reach green coverage.