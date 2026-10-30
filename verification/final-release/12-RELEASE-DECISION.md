# Final Release Decision — Money Tracker

**Verified Commit:** `d549c1f` (PR #269 merge)
**Date:** 2026-10-21
**Reviewer:** Controlled Senior Engineer / Independent Release Reviewer

---

## Executive Summary

**DECISION: CONDITIONAL GO**

All five required CI checks pass. Production deployment successful. Google Drive backup removal complete. One production migration (0022_drop_drive_connections.sql) remains unapplied — requires explicit owner approval before execution.

---

## 1. Verified Current Commit

| Item | Value | Status |
|---|---|---|
| Commit SHA | `d549c1f3387a8cac0bed1c888fff73cfe1e0b76a` | ✅ Verified |
| Branch | `main` (merged from `chore/vercel-cli-best-practices`) | ✅ |
| PR | #269 | ✅ Merged |
| Merge Strategy | Merge commit (preserves 3 logical commits) | ✅ |
| CI Run ID | 39553363277 | ✅ All 5 required checks green |

### Commit Contents
- `c2840f8` — `fix(backup): remove the per-user Google Drive backup destination`
- `9f60bc6` — `chore(ci): ignore generated artifacts and widen the E2E time budgets`
- `37bdbf4` — `chore(vercel): trim .vercelignore to runtime-only source` (and related vercel housekeeping)

---

## 2. Production Database Migration Status

### Migration 0022: `DROP TABLE IF EXISTS drive_connections`

| Aspect | Finding | Evidence |
|---|---|---|
| Migration SQL | Single statement: `DROP TABLE IF EXISTS \`drive_connections\`` | `drizzle/0022_drop_drive_connections.sql` |
| Journal Entry | Present at idx 22, tag `0022_drop_drive_connections` | `drizzle/meta/_journal.json` |
| Snapshot | 7,265 lines, no `drive_connections` table | `drizzle/meta/0022_snapshot.json` |
| Schema Alignment | `drizzle-kit generate` produces **no changes** after 0022 applied | Tested on disposable MariaDB 13.0.2 |
| Finance Tables Affected | **None** — only `drive_connections` dropped | Verified by schema diff |

### Migration Rehearsal
- Applied 0021 → 0022 on disposable DB: **SUCCESS**
- All 22 expected tables present after 0022: **CONFIRMED**
- 121 foreign keys intact: **CONFIRMED**
- Financial data tables unchanged: **CONFIRMED**

### Production State
- **0022 NOT APPLIED** to production database (no CI/CD job runs migrations)
- `drive_connections` table exists in production but is **unused** (all Drive code removed)
- Applying 0022 will drop the table — **no financial data affected**

### Rollback/Recovery Plan
1. **Pre-migration:** Trigger manual backup via `pnpm db:push` dry-run to confirm
2. **Execute:** `DATABASE_URL=<prod> pnpm db:push` (applies 0022)
3. **Verify:** `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='drive_connections'` → 0
3. **Rollback (if needed):** Restore from latest Supabase backup bucket (`amar-hisab-backups`) — 7-day retention per project, 90-day global

### Owner Action Required
> **EXPLICIT APPROVAL NEEDED** before running `pnpm db:push` against production `DATABASE_URL`.

---

## 3. Dependency Vulnerability Status

### Verify Dependency Bumps Workflow (FAILING - Non-blocking)
- **Workflow:** `.github/workflows/verify-dependency-bumps.yml` (runs `pnpm audit --audit-level=high`)
- **Status:** FAILING on `main` (pre-existing, not introduced by this PR)
- **Required Checks:** NOT one of the 5 protected checks

### Advisory Breakdown (from run 39551310232)

| Severity | Count | Primary Packages | Path | Resolution Status |
|---|---|---|---|---|
| **Critical** | 1 | `tar@7.5.11` (DoS via unlimited input) | `vercel@62.7.0` → `@vercel/container` | **Accepted Risk** — vercel pinned per policy |
| **High** | 19 | `minimatch` (ReDoS), `undici` (WS DoS), `path-to-regexp`, `js-yaml`, `node-tar`, `smol-toml`, `@fastify/busboy`, `braces`, `launch-editor` | Transitive via `vercel@62.7.0`, `vite@8.3.1` | **Partial** — `vite` fix in PR #270 |
| **Moderate** | 26 | Various | Transitive | **Accepted** |
| **Low** | 7 | Various | Transitive | **Accepted** |

### Dependabot PR #270
- **Action:** Bump `vite` from 8.3.1 → 8.3.3
- **Fixes:** `launch-editor` advisory (GHSA-587h-7wmj-h5pm) via transitive update
- **Impact:** Dev dependency only; no runtime change
- **Status:** OPEN — requires review/merge

### Policy Compliance
- No major version upgrades in this PR (googleapis/google-auth-library **removed**, not upgraded)
- `jose` remains pinned exactly (security-critical)
- `vercel@62.7.0` pinned per deploy policy (no upgrade for "newer")
- Audit thresholds **NOT weakened**

---

## 4. CI and Deployment Evidence

### Required Checks (All PASS)

| Check | Run ID | Conclusion | Key Steps |
|---|---|---|---|
| **verify** | 119067335993 | ✅ PASS | Typecheck, Lint, Build, Font verification |
| **test** | 119067335637 | ✅ PASS | Unit tests + coverage gate (71.04/62.68/71.54/72.31) |
| **e2e** | 119067714561 | ✅ PASS | Migration rehearsal, Hermetic DB, Server E2E |
| **worker** | 119067714563 | ✅ PASS | Schema apply, Worker tests, Wrangler dry-run |
| **browser-e2e** | 119067714746 | ✅ PASS | Playwright install, Browser E2E tests, Report upload |

### Vercel Production Deployment
- **Deploy Run:** 39553797947 (success)
- **Deployment URL:** `https://money-tracker-blond-pi.vercel.app`
- **Alias:** `https://money-tracker-blond-pi.vercel.app`
- **Deploy Time:** 16s (build → deploy)
- **Vercel CLI:** 62.7.0 (pinned via devDependency)

### Production API Verification

| Endpoint | HTTP Code | Expected |
|---|---|---|
| `GET /` | 200 | ✅ |
| `GET /api/health-checks` | 403 | ✅ (cron-protected) |
| `GET /api/drive/oauth/start` | 404 | ✅ (Drive removed) |
| `GET /api/trpc/auth.me` | 200 (data: null) | ✅ (unauthenticated = null) |

---

## 5. Backup and Restore Evidence

### Automated Daily Backup (Daily Automated Finance Backup)
- **Last Success:** 2026-10-20T21:26:32Z (run 39500377888) on sha `dc9b829`
- **Workflow:** Comprehensive — bucket check, trigger, count assertion, audit verification, prune
- **Backup Endpoint:** `GET /api/scheduled/finance-backup` (cron-secret protected)
- **Audit Endpoint:** `GET /api/scheduled/backup-audit` (verifies storage + integrity)
- **Bucket:** `amar-hisab-backups` (Supabase Storage, private)

### Backup Service Tests (Disposable DB)
| Test Suite | Tests | Status |
|---|---|---|
| `cloudBackupService.test.ts` | 19 | ✅ PASS |
| `backupDb.test.ts` | 8 | ✅ PASS |
| `scheduledBackup.test.ts` | (included) | ✅ PASS |
| `restoreDrill.test.ts` | (part of 48) | ✅ PASS |
| `backupIntegrity.test.ts` | (part of 48) | ✅ PASS |

### Isolated Restore Verification
- `restoreDrill.test.ts` + `backupIntegrity.test.ts`: **48 tests PASS**
- Restore drill downloads, decrypts, validates checksum, restores to new project, rolls back
- Weekly scheduled restore drill endpoint: `/api/scheduled/restore-drill`

### Supabase Backup Generation
- Cloud backup providers tested: `supabase`, `s3`, `local_encrypted`
- `google_drive` provider **removed** — no code path remains
- Local encrypted snapshot fallback tested and working

---

## 6. Remaining Owner Actions

| # | Action | Priority | Details |
|---|---|---|---|
| 1 | **Apply migration 0022 to production** | HIGH | Run `DATABASE_URL=<prod> pnpm db:push` after explicit approval. Drops unused `drive_connections` table only. |
| 2 | **Review/merge Dependabot PR #270** | MEDIUM | Bumps `vite` 8.3.1 → 8.3.3; fixes `launch-editor` high advisory. Dev dependency only. |
| 3 | **Monitor Verify Dependency Bumps workflow** | LOW | 1 critical + 19 high advisories remain (mostly transitive via `vercel@62.7.0`). Accepted per policy; no action unless vercel releases patched version. |
| 4 | **Confirm production backup schedule** | MEDIUM | Daily 18:00 UTC cron triggers; verify next run succeeds on d549c1f. |

---

## 7. Final Recommendation

### CONDITIONAL GO

**Conditions:**
1. ✅ All 5 required CI checks green on `d549c1f`
2. ✅ Vercel production deployment successful and reachable
3. ✅ Google Drive integration fully removed (code, schema, config, deps)
3. ✅ Backup/restore tests pass on isolated DB
4. ✅ No financial data touched by pending migration
5. ⚠️ **PENDING:** Production migration 0022 not yet applied — requires explicit owner approval before execution

**Do NOT proceed with production migration 0022 without written owner approval.**

---

## Bengali Executive Summary (কারিগরি সারসংক্ষেপ বাংলায়)

**নির্ণয়: শর্তসাপেক্ষে অনুমোদন (CONDITIONAL GO)**

সকল পাঁচটি বাধ্যতামূলক CI চেক (verify, test, e2e, worker, browser-e2e) সাফল্যপূর্ণ। Vercel প্রোডাকশন ডিপ্লয়মেন্ট সফল — সাইট লাইভ (`https://money-tracker-blond-pi.vercel.app`)। Google Drive ব্যাকআপ পথ সম্পূর্ণরূপে অপসারিত (কোড, স্কিমা, কনফিগ, ডিপেন্ডেন্সি)। ব্যাকআপ/রিস্টোর টেস্ট বিচ্ছিন্ন ডাটাবেজে পাস। আর্থিক ডাটা কোনো ভাবে প্রভাবিত হয়নি। মাইগ্রেশন ০০২২ (`drive_connections` টেবিল ড্রপ) প্রোডাকশনে এখনো প্রয়োগ করা হয়নি — এটি মালিকের স্পষ্ট অনুমোদন না দিয়ে চালানো যাবে না। ডিপেন্ডেন্সি সিকিউরিটির একটা ফেইলিং ওয়ার্কফ্লো আছে (`Verify dependency bumps`) যা এই PR-র কারণে নয়, এটা আগেই ছিল; এর মধ্যে একটা critical (tar) এবং ১৯টি high সেভারিটি আছে, অধিকাংশ `vercel@62.7.0` এর মাধ্যমে ট্রানজিটিভ। নীতিমতো ভালো করা হয়নি, Dependabot PR #270 (vite ৮.৩.৩) এটা আংশিক সমাধান করবে।

**পরবর্তী ধাপ:** মালিকের লেখিত অনুমোদন পাওয়ার পরেই `pnpm db:push` চালিয়ে প্রোডাকশন ডাটাবেজে মাইগ্রেশন ০০২২ প্রয়োগ করা যাবে।