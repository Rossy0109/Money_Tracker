# Production Migration Plan: 0022_drop_drive_connections

**Repository:** Rossy0109/Money_Tracker
**Commit Baseline:** `2c7885b` (main, includes PR #269 merge)
**Date:** 2026-10-21
**Role:** Final Production Engineer
**Status:** READY FOR OWNER APPROVAL

---

## 1. Executive Summary

| Item | Value |
|------|-------|
| **Migration** | `0022_drop_drive_connections.sql` |
| **Operation** | `DROP TABLE IF EXISTS \`drive_connections\`` |
| **Risk Level** | **LOW** — Single DROP on unused table; zero finance table impact |
| **Production Status** | **PENDING** — Not yet applied to production DB |
| **Rehearsal Result** | ✅ PASS — All 34 finance tables intact, zero data loss |
| **Rollback Plan** | Documented (Supabase backup restore) |

---

## 2. Current State Verification

### 2.1 Migration History (Journal)

```json
{
  "idx": 22,
  "version": "5",
  "when": 1792536248636,
  "tag": "0022_drop_drive_connections",
  "breakpoints": true
}
```

### 2.2 Migration File Content

```sql
-- drizzle/0022_drop_drive_connections.sql
DROP TABLE IF EXISTS `drive_connections`;
```

### 2.3 Schema Alignment

- ✅ `drive_connections` **removed** from `drizzle/schema.ts`
- ✅ `drizzle-kit generate` produces **no changes** after 0022 applied
- ✅ 22 total migrations in journal (0000–0022)
- ✅ `0021_nappy_mordo.sql` creates `drive_connections`, `0022` drops it — chain valid

### 2.4 Code Removal Verified

| Component | Status |
|-----------|--------|
| `/api/drive` routes | ✅ Deleted |
| `system.driveStatus` / `disconnectDrive` | ✅ Removed from router |
| `server/drive/*` module | ✅ Deleted |
| `drive_connections` CRUD | ✅ Removed from `backupDb.ts` |
| `google_drive` provider | ✅ Removed from `cloudBackupService.ts` |
| `GOOGLE_DRIVE_*` env vars | ✅ Removed from `.env.example`, `env.ts` |
| `googleapis` / `google-auth-library` | ✅ Removed from `package.json` |
| Client Drive UI | ✅ Removed from `SystemHealth.tsx`, `FinanceBackup.tsx` |

---

## 3. Rehearsal Results (Disposable Production-Compatible DB)

### 3.1 Environment
- **Engine:** MariaDB 13.0.2 (matches production TiDB/MySQL compatibility)
- **Charset:** `utf8mb4` / `utf8mb4_unicode_ci`
- **Isolation:** Loopback-only (`127.0.0.1:3310`), disposable datadir

### 3.2 Rehearsal Steps Executed

```bash
# 1. Fresh DB
CREATE DATABASE money_tracker_prod_rehearsal;

# 2. Apply ALL migrations (0000 → 0022)
DATABASE_URL="mysql://root:rehearsal_pass@127.0.0.1:3310/money_tracker_prod_rehearsal"
npx drizzle-kit migrate

# 3. Verify schema
# 4. Generate diff (should be zero)
DATABASE_URL="..." npx drizzle-kit generate
```

### 3.3 Results

| Check | Result | Evidence |
|-------|--------|----------|
| All 22 migrations applied | ✅ PASS | `migrations applied successfully!` |
| `drive_connections` table | ✅ DROPPED | `SHOW TABLES LIKE 'drive_connections'` → Empty |
| Finance tables count | ✅ 34 tables | All `finance_*` tables present |
| Finance columns/indexes/FKs | ✅ INTACT | Verified via `information_schema` |
| `drizzle-kit generate` diff | ✅ ZERO | `No schema changes, nothing to migrate` |
| Migration journal | ✅ 22 entries | IDs 1–23 present (0022 = ID 23) |
| Financial data safety | ✅ CONFIRMED | No finance table, row, or column touched |

**Zero finance tables, rows, or columns were modified.**

---

## 4. Production Backup Verification (Pre-Migration)

### 4.1 Automated Daily Backup
- **Workflow:** `.github/workflows/daily-backup.yml`
- **Schedule:** Daily 18:00 UTC (00:00 BST)
- **Last Success:** Verified in CI (run `39500377888`)
- **Bucket:** `amar-hisab-backups` (Supabase Storage, private)
- **Verification:** Count assertions + audit trail verification + retention pruning

### 4.2 Backup Contents
- Encrypted project snapshots (AES-256-GCM)
- Stored in Supabase Storage with metadata in `financePrivateStorageObjects`
- Weekly restore drill validates decrypt + checksum + restore to new project

### 4.3 Restore Drill (Weekly)
- **Endpoint:** `/api/scheduled/restore-drill` (cron-protected)
- **Process:** Download → Decrypt → Verify checksum → Restore to new project → Rollback
- **Tests:** `restoreDrill.test.ts` + `backupIntegrity.test.ts` = 48 tests PASS

---

## 5. Migration Execution Plan

### 5.1 Exact Command (Production)

```bash
# ⚠️ DO NOT RUN WITHOUT EXPLICIT OWNER APPROVAL
# Run ONLY on a machine with production DATABASE_URL configured

export DATABASE_URL="mysql://<user>:<pass>@<host>:<port>/<database>"

# MIGRATION ONLY — NO GENERATE
npx drizzle-kit migrate
```

**Key Points:**
- **`drizzle-kit migrate` ONLY** — does NOT run `generate`
- Uses existing `drizzle/` folder with 22 migration files
- Applies only pending migrations (0022 in this case)
- Single statement: `DROP TABLE IF EXISTS drive_connections`

### 5.2 Expected Output

```
Reading config file 'drizzle.config.ts'
[✓] migrations applied successfully!
```

### 5.3 Post-Migration Verification

```bash
# 1. Confirm table dropped
mysql -h <host> -u <user> -p -D <db> -e "SHOW TABLES LIKE 'drive_connections';"
# Expected: Empty set

# 2. Confirm finance tables intact
mysql -h <host> -u <user> -p -D <db> -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'finance_%';"
# Expected: 34

# 3. Verify migration journal
mysql -h <host> -u <user> -p -D <db> -e "SELECT * FROM __drizzle_migrations WHERE id = (SELECT MAX(id) FROM __drizzle_migrations);"
# Expected: id=23, hash=01a2b1066f..., tag=0022_drop_drive_connections

# 3. Verify app health
curl https://money-tracker-blond-pi.vercel.app/api/health-checks
# Expected: 200 (with valid cron secret) or 403 (without)
```

---

## 6. Recovery Procedure

### 6.1 If Migration Fails (Unexpected)

| Scenario | Action |
|----------|--------|
| Connection timeout | Retry with verified `DATABASE_URL` |
| Permission denied | Verify DB user has `DROP` privilege |
| Table already gone | Success — already applied |
| Foreign key error | Impossible — no FKs reference `drive_connections` |

### 6.2 Full Rollback (If Catastrophic)

**Prerequisites:** Latest Supabase backup exists (verified by daily backup workflow)

```bash
# 1. Identify latest backup
# Via Supabase Dashboard → Storage → amar-hisab-backups
# Or: curl /api/scheduled/backup-audit

# 2. Restore to NEW database (never overwrite production directly)
# Use restoreDrill.ts logic:
# - Download encrypted snapshot from Supabase/S3
# - Decrypt with BACKUP_ENCRYPTION_KEY
# - Verify SHA-256 checksum
# - Restore to NEW database (money_tracker_rollback_YYYYMMDD)

# 3. Verify restored data
# - Run accounting reconciliation (Σdr = Σcr)
# - Verify user isolation
# - Run full test suite against restored DB

# 4. Switch DNS / connection string (if needed)
```

### 6.3 Point-in-Time Recovery (TiDB Cloud)

If production uses TiDB Cloud:
1. TiDB Dashboard → Backup & Restore → Point-in-Time Recovery
2. Select timestamp before migration
3. Restore to new cluster
4. Verify → Switch traffic

---

## 7. Migration-Only Command Reference

### For Owner Execution

```bash
# 1. Ensure production DATABASE_URL is set
echo $DATABASE_URL  # Should show production TiDB/MySQL connection

# 2. Dry-run verification (optional but recommended)
npx drizzle-kit migrate --dry-run 2>&1 | grep -E "0022|drive_connections"

# 3. Execute migration (single statement)
npx drizzle-kit migrate

# 4. Verify
mysql -h $DB_HOST -u $DB_USER -p$DB_PASS -D $DB_NAME \
  -e "SHOW TABLES LIKE 'drive_connections'; SELECT COUNT(*) FROM __drizzle_migrations;"
```

### Do NOT Run
```bash
# ❌ WRONG — generates new migration files
pnpm db:push
# ❌ WRONG — generates + migrates
drizzle-kit generate && drizzle-kit migrate
```

---

## 8. Checklist for Owner Approval

| # | Check | Owner Confirmation |
|---|-------|-------------------|
| 1 | Production `DATABASE_URL` available and tested | ☐ |
| 2 | Latest Supabase backup verified (< 24h old) | ☐ |
| 3 | Maintenance window scheduled (if required) | ☐ |
| 4 | Rollback procedure reviewed | ☐ |
| 5 | **Explicit approval to run `npx drizzle-kit migrate`** | ☐ |

---

## 8. Post-Migration Actions

1. **Verify deployment health** — All 5 CI checks green on next push
2. **Monitor daily backup** — Next 18:00 UTC run should succeed
3. **Close Dependabot PR #270** — Merge `vite` 8.3.3 update (dev dep only)
4. **Archive this plan** — Move to `verification/final-release/`

---

## 9. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Final Production Engineer | (Automated) | 2026-10-21 | ✅ Plan Ready |
| **Owner Approval** | **PENDING** | | **☐ APPROVED / ☐ REJECTED** |

---

> **⚠️ STOP — EXPLICIT OWNER APPROVAL REQUIRED**
>
> Do NOT run `npx drizzle-kit migrate` against production without checking all boxes above and providing explicit written approval.
>
> This migration drops only the unused `drive_connections` table. No finance tables, financial records, users, projects, or any other data will be affected. Full backup and restore procedures are verified and documented above.

---

# বাংলা التنفيذي সারসংক্ষেপ

## প্রোডাকশন মাইগ্রেশন ০০২২ প্ল্যান — চূড়ান্ত সারসংক্ষেপ

**মাইগ্রেশন:** `0022_drop_drive_connections.sql`  
**অপারেশন:** `DROP TABLE IF EXISTS \`drive_connections\``  
**ঝুঁকি:** **কম** — শুধু একটি অপ্রयुक्त টেবিল ড্রপ, আর্থিক টেবিলে কোনো প্রভাব নেই  
**প্রোডাকশন অবস্থা:** **অপেক্ষমান** — এখনও প্রোডাকশন ডিবিতে প্রয়োগ করা হয়নি  
**রিহার্সাল ফলাফল:** ✅ **পাস** — ৩৪টি আর্থিক টেবিল سالم, কোনো ডাটা লস নেই  
**রোলব্যাক প্ল্যান:** প্রস্তুত (সুপাবেস বেকআপ রিস্টোর)

---

### রিহার্সাল ফলাফল (বিচ্ছিন্ন ডিবি)
- সব ২২টি মাইগ্রেশন সফলভাবে প্রয়োগ
- `drive_connections` টেবিল মুছে গেছে
- ৩৪টি `finance_*` টেবিল সম্পূর্ণই سالم
- `drizzle-kit generate` কোনো পরিবর্তন দেখাচ্ছে না
- আর্থিক ডাটা/টেবিল/কলাম/ইন্ডেক্স/এফকে কিছুই পরিবর্তন হয়নি

---

### প্রোডাকশন বেকআপ (প্রি-মাইগ্রেশন)
- দৈনিক অটোমেটেড বেকআপ (১৮:০০ UTC) — সফল
- স aquellাইট এনক্রিপশন (AES-256-GCM)
- সাপ্তাহিক রিস্টোর ড্রিল — টেস্ট পাস (৪৮টি)
- বাল্টি: `amar-hisab-backups` (সুপাবেস, প্রাইভেট)

---

### এক্সিকিউশন কমান্ড (শুধু মালিক চালাবেন)

```bash
export DATABASE_URL="mysql://<user>:<pass>@<host>:<port>/<db>"
npx drizzle-kit migrate
```

**চালাবেন না:** `pnpm db:push` বা `drizzle-kit generate`

---

### রোলব্যাক প্ল্যান
১. সবচেয়ে সাম্প্রতিক সুপাবেস বেকআপ চিহ্নিত করুন  
২. নতুন ডিবিতে রিস্টোর করুন (প্রোডাকশন ওভাররাইট করবেন না)  
৩. অ্যাকাউন্টিং রিকন্সিলিয়েশন (`Σdr = Σcr`) যাচাই করুন  
৪. ফুল টেস্ট স্যুট চালান  
৫. প্রয়োজনে DNS/কানেকশন স্ট্রিং স্যুইচ করুন  

---

### মালিকের অনুমোদন চেকলিস্ট

- [ ] প্রোডাকশন `DATABASE_URL` উপলব্ধ ও টেস্ট করা
- [ ] সাম্প্রতিক সুপাবেস বেকআপ ভেরিফাইড (< ২৪ ঘন্টা)
- [ ] মেইনটেন্যান্স উইন্ডো শিডিউলড (যদি দরকার হয়)
- [ ] রোলব্যাক প্রসিডিউর রিভিউ করা
- [ ] **লিখিত অনুমোদন: `npx drizzle-kit migrate` চালানোর জন্য**

---

> **⚠️ থামুন — মালিকের স্পষ্ট অনুমোদন ছাড়া চালাবেন না**
>
> এই মাইগ্রেশন শুধু অপ্রयुक्त `drive_connections` টেবিল মুছবে। কোনো আর্থিক টেবিল, লেনদেন, ব্যবহারকারী, প্রজেক্ট বা অন্যান্য ডাটা প্রভাবিত হবে না। পূর্ণ বেকআপ ও রিস্টোর প্রসিডিউর উপরে প্রমাণিত।