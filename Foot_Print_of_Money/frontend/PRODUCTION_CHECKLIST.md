# PRODUCTION_CHECKLIST.md

## 1. Monitoring & Logging
- [ ] Enable Vercel Analytics for frontend performance.
- [ ] Monitor Supabase API logs for 403 (Permission Denied) errors.
- [ ] Check GitHub Actions logs weekly for backup failures.

## 2. Security
- [ ] Rotate Supabase Anon Key every 12 months.
- [ ] Ensure `supabase_hardening.sql` is fully applied.
- [ ] Verify App PIN is enabled in your local settings.
- [ ] Use GitHub Secrets for all CI/CD keys.

## 3. Maintenance
- [ ] Update NPM dependencies (`Chart.js`, `Supabase-JS`) quarterly.
- [ ] Audit "Recent Transactions" for data drift.
- [ ] Verify "Restore" logic works by importing a backup into a test account.

## 4. Disaster Recovery
- [ ] Keep a copy of your `.env` secrets in a secure password manager.
- [ ] Download a manual JSON backup before any major schema changes.
- [ ] Maintain access to the recovery email for your GitHub/Supabase accounts.
