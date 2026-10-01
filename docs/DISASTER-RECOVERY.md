# Disaster Recovery Plan

## Overview

This document describes the backup and disaster recovery procedures for the Money Tracker application.

## Recovery Objectives

| Metric                             | Target   | Rationale                                                                                                                                                      |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO (Recovery Point Objective)** | 24 hours | Daily automated backups at 18:00 UTC; maximum data loss is one day of transactions                                                                             |
| **RTO (Recovery Time Objective)**  | 4 hours  | Manual restore procedure: download (30 min) + decrypt (5 min) + preview (5 min) + restore (15 min) + verification (30 min) + buffer for cloud provider latency |

**Note:** RPO of 24 hours means transactions entered after the last successful backup may be lost in a disaster scenario. RTO of 4 hours assumes the backup encryption key is available and the cloud provider is responsive. If the cloud provider is unavailable, RTO may extend by the provider's recovery time.

---

## Backup Frequency

| Backup Type            | Frequency | Schedule                              | Retention    |
| ---------------------- | --------- | ------------------------------------- | ------------ |
| Automated Cloud Backup | Daily     | 00:00 BDT (18:00 UTC) via Vercel Cron | 30 days      |
| Manual Cloud Backup    | On-demand | Via admin UI trigger                  | 30 days      |
| Local Export           | On-demand | Via user UI download                  | User-managed |

### Automated Backup Process

1. Vercel Cron triggers `/api/scheduled/finance-backup` daily at 18:00 UTC using **GET** (Vercel Cron always sends GET)
2. The Express route is registered with `app.all`, so GET and POST both work (GitHub Actions may use either)
3. The endpoint authenticates using `CRON_SECRET` (dedicated secret) via `Authorization: Bearer …`
4. For each active user, each project is exported as JSON
5. The JSON is encrypted using AES-256-GCM with `BACKUP_ENCRYPTION_KEY`
6. The encrypted payload is uploaded to the configured cloud provider
7. A SHA-256 checksum is computed and stored in the backup envelope
8. Post-upload integrity verification: checksum is re-verified
9. An audit log entry is created for every backup
10. The endpoint responds with counts (`projects`, `stored`, `verified`,
    `failed`) and answers **HTTP 500** when any project failed to store or
    verify — a hollow HTTP 200 can no longer hide a failed backup
11. The `Daily Automated Finance Backup` GitHub workflow triggers the same
    endpoint at 18:00 UTC, asserts those counts with `jq`, then verifies the
    `audit_logs` row in the production database (see Automated Verification)

---

## Secrets Configuration

### Required Environment Variables

| Variable                | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `BACKUP_ENCRYPTION_KEY` | Dedicated encryption key for backups (min 6 chars) |
| `CRON_SECRET`           | Authentication for Vercel Cron / GitHub Actions    |

> **Key rotation 2026-09-30:** `BACKUP_ENCRYPTION_KEY` was missing from the
> Vercel project (backups failed 2026-09-24 → 2026-09-29) and the previous key
> lived only in the deleted Vercel project `moneytrackerbd`. Any backup
> encrypted before that rotation is therefore likely **undecryptable**. The
> current key is stored in Vercel Production and in the operator's password
> manager — keep both in sync.

Required GitHub Actions secrets for backup verification:

| Secret        | Purpose                                                |
| ------------- | ------------------------------------------------------ |
| `CRON_SECRET` | Authorizes both the backup trigger and the audit read  |

Production database credentials are deliberately **not** needed: the audit
trail is read back through the cron-protected
`/api/scheduled/backup-audit` endpoint, so a rotated DB password can never
silently disable backup verification (it already did once).

### Explicitly Prohibited

- `ADMIN_ACCESS_PASSWORD` must NOT be used as a backup encryption key fallback
- `ADMIN_ACCESS_PASSWORD` must NOT be used for backup authorization
- If `BACKUP_ENCRYPTION_KEY` is not set, backups FAIL with an explicit error

---

## Encryption

- Algorithm: AES-256-GCM
- Key derivation: SHA-256 hash of `BACKUP_ENCRYPTION_KEY`
- IV: 12-byte random per backup
- Auth tag: GCM authentication tag stored alongside ciphertext

### Backup File Format

```
{
  "formatVersion": "finance-encrypted-cloud-backup-v1",
  "checksum": "<sha256-of-raw-json>",
  "projectId": 1,
  "projectName": "My Project",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "iv": "<hex>",
  "encrypted": "<hex>",
  "tag": "<hex>"
}
```

---

## Retention Policy

- Default retention: 30 days (configurable via `BACKUP_RETENTION_DAYS`)
- Old backups beyond the retention period are automatically cleaned up
- The retention policy is enforced during scheduled backup runs

---

## Integrity Verification

### Post-Upload Verification

After every successful cloud upload, the backup system:

1. Re-exports the project data from the database
2. Computes a new SHA-256 checksum
3. Compares it against the checksum of the uploaded backup
4. Records the verification result in the backup response

### Backup Health Monitoring

The health check system monitors:

- `backup.last`: Last database backup age (warns if > 48 hours)
- `backup.pending`: Pending/failed backup count
- **Production Health Watch** (`.github/workflows/health-watch.yml`): probes
  `/api/healthz`, the unauthenticated tRPC `auth.me` endpoint (returns 500
  exactly when DB/RBAC wiring breaks — `healthz` never touches the database),
  and the web root every 15 minutes. Three consecutive failures open (or
  refresh) a `health-watch` issue; the issue auto-closes when the probe passes.

---

## Restore Procedure

### Prerequisites

- Access to the encrypted backup file
- The `BACKUP_ENCRYPTION_KEY` used during backup
- Admin privileges in the application

### Restore Steps

1. Download the backup from cloud storage
2. Decrypt using the backup decryption tool or admin UI
3. Preview the backup via `previewProjectBackup` tRPC procedure
4. Restore via `restoreProjectBackup` tRPC procedure with confirmation
   - Confirmation string: `RESTORE_NEW_PROJECT`
   - The backup is restored into a NEW project (existing data is not overwritten)

### Restore Verification

After restore:

1. Compare record counts between backup manifest and restored project
2. Verify critical entity types (accounts, transactions, vouchers)
3. Check that balances and totals match

---

## Failure Procedures

### Backup Failure

1. Check the scheduled backup response for `success: false` and its counts
   (`stored` / `verified` / `failed`)
2. Verify `BACKUP_ENCRYPTION_KEY` is set and >= 6 characters
3. Verify `CRON_SECRET` matches the Vercel/GitHub configuration
4. Check cloud provider status (Supabase, S3, Google Drive)
5. Check the audit log for error details (`cloud_backup_failed` rows)
6. The GitHub `Daily Automated Finance Backup` run is red — its log shows
   which assertion failed (counts vs. audit trail)

### Restore Failure

1. Verify the backup file is not corrupted (checksum validation)
2. Verify the `BACKUP_ENCRYPTION_KEY` matches the one used during backup
3. Check that the backup format version is supported
4. Try restoring to a different project name
5. Contact support with the backup file and error details

### Cloud Provider Outage

1. Backups will automatically fall back to `local_encrypted` storage
2. Monitor the health check endpoint for provider status
3. When the provider recovers, manually trigger a backup via admin UI

---


### Secrets Hygiene

- **GitHub Actions**: the backup workflow no longer connects directly to the production database. `CRON_SECRET` is the only secret it needs for verification. `db-reconcile.yml` is manual-only and accepts either `DATABASE_URL` or `PROD_DATABASE_URL` (falls back to the legacy name). The `PROD_DATABASE_URL` Actions secret is stale relative to Vercel's current value; rotate or remove it only after deciding whether to keep db-reconcile's direct-DB path. If you migrate db-reconcile to a read-only API, you can drop prod DB credentials from Actions entirely.


## Verification Procedure

### Automated Verification

- Every backup is verified post-upload by re-exporting the project and
  comparing checksums. Both sides are **normalized** first (`exportedAt`
  dropped, row arrays sorted by `id`): `exportProjectBackup` stamps
  `exportedAt: new Date()` on every call and its queries have no `ORDER BY`, so
  a raw hash comparison could never match and every backup used to be counted
  as an integrity failure.
- Integrity verification failures are logged and counted — they fail the run,
  not just a warning
- The `daily-backup` workflow fails unless the endpoint reports
  `projects >= 1`, `stored == projects`, `verified == projects`, `failed == 0`
- Then `GET /api/scheduled/backup-audit` (cron secret) must report
  `verified: true`: the newest `audit_logs` row within 30 minutes is
  `cloud_backup`, written only when every upload + integrity check passed —
  proof of storage that an HTTP status alone can never give. The endpoint also
  returns `history` for triage, and `reason` when it cannot verify
- The **Production Health Watch** workflow alerts on outage (see Backup Health
  Monitoring)

### Manual Verification

To manually verify a backup:

1. Export the project via admin UI or tRPC `exportProjectBackup`
2. Compute SHA-256 of the raw JSON
3. Compare against the checksum in the backup envelope
4. If encrypted, decrypt with `BACKUP_ENCRYPTION_KEY` and verify the decrypted content

---

## Environment Variable Reference

| Variable                | Required | Default | Description                              |
| ----------------------- | -------- | ------- | ---------------------------------------- |
| `BACKUP_ENCRYPTION_KEY` | Yes      | (none)  | AES-256-GCM encryption key for backups   |
| `CRON_SECRET`           | Yes      | (none)  | Authentication for scheduled backup cron |
| `BACKUP_RETENTION_DAYS` | No       | 30      | Days to retain backup files              |
| `SUPABASE_URL`          | No       | (none)  | Supabase project URL for cloud storage   |
| `SUPABASE_ANON_KEY`     | No       | (none)  | Supabase API key                         |
| `S3_BUCKET_NAME`        | No       | (none)  | S3/R2 bucket name                        |
| `S3_ACCESS_KEY_ID`      | No       | (none)  | S3 access key                            |
| `S3_SECRET_ACCESS_KEY`  | No       | (none)  | S3 secret key                            |
| `S3_REGION`             | No       | auto    | S3 region                                |
| `S3_ENDPOINT`           | No       | (none)  | Custom S3-compatible endpoint            |


### Backup Encryption Key: Rotation & Recoverability

- **Store it safely**: `~/.money-tracker-backup-key` contains the 64-hex `BACKUP_ENCRYPTION_KEY` used to encrypt all cloud backups. Back it up in a password manager and/or offline safe (not in git). Set `chmod 600` on the file and treat it as production-critical.
- **Key rotation caveat**: backups encrypted before a key rotation are unrecoverable with the new key. Before rotating, decrypt/export any backups you must keep, or ensure the old key is archived.
- **Verifying recoverability**: the manual restore drill (decrypt the latest `.enc.json` and check `sha256(plaintext) == envelope.checksum`) proves both key correctness and storage integrity.

### Quarterly Restore Drill (Recommended)

1. **Pick a recent backup**: from Supabase Storage bucket `amar-hisab-backups`, download the latest `.enc.json` file.
2. **Decrypt**: using `~/.money-tracker-backup-key` (64-hex), decrypt `iv/encrypted/tag` with AES-GCM and verify `sha256(plaintext) === envelope.checksum`.
3. **Restore to a throwaway project**: in a non-production environment, call `restoreProjectBackup` with the decrypted payload under a unique project name. Do not overwrite production data.
4. **Sanity-check**: compare key record counts (transactions, vouchers, ledger/journal lines) against the envelope/manifest and confirm the project opens.
5. **Log it**: record the date, object name, and result in your operations log.
