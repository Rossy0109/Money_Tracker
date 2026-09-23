# Money Tracker — Architecture Audit

**Generated:** 2025-09-17  
**Repository:** https://github.com/Rossy0109/Money_Tracker  
**Branch:** `feat/input-only-user-permissions`  
**Auditor:** Lead Software Architect / Security Engineer / Accounting-System Architect / Database Engineer / QA Engineer

---

## 1. Current Architecture

| Layer | Technology | Status |
|-------|------------|--------|
| **Frontend** | React 19 + Vite 8 + TailwindCSS 4 | ✅ EXISTS |
| **Routing** | Wouter (client-side) | ✅ EXISTS |
| **State/Data** | TanStack Query v5 + tRPC v11 | ✅ EXISTS |
| **API Layer** | tRPC (Express adapter) | ✅ EXISTS |
| **Server** | Express 5 + Node.js (ESM) | ✅ EXISTS |
| **Database** | TiDB Cloud (MySQL-compatible) via Drizzle ORM | ✅ EXISTS |
| **Auth** | Google OAuth 2.0 + Email/Password | ✅ EXISTS |
| **Session** | JWT (jose) + HttpOnly cookies | ✅ EXISTS |
| **Rate Limiting** | express-rate-limit + custom in-memory | ✅ EXISTS |
| **Logging** | Pino + Pino-HTTP | ✅ EXISTS |
| **Error Tracking** | Sentry (optional) | ✅ EXISTS |
| **Deployment** | Vercel (serverless) + local persistent | ✅ EXISTS |
| **Testing** | Vitest (unit/integration) + Playwright (E2E) | ✅ EXISTS |

**Architecture Pattern:** Monorepo (single package) with client/server/shared structure. tRPC provides end-to-end type safety.

---

## 2. Existing Modules

| Module | Location | Status |
|--------|----------|--------|
| **Projects/Workspaces** | `server/db.ts` → `financeProjects` | ✅ EXISTS |
| **Accounts (Cash/Bank/Mobile)** | `server/db.ts` → `financeAccounts` | ✅ EXISTS |
| **Categories (Income/Expense)** | `server/db.ts` → `financeCategories` | ✅ EXISTS |
| **Transactions** | `server/db.ts` → `financeTransactions` | ✅ EXISTS |
| **Budgets (Monthly)** | `server/db.ts` → `financeBudgets` | ✅ EXISTS |
| **Bills/Reminders** | `server/db.ts` → `financeBills` | ✅ EXISTS |
| **Dues (Debt/Receivable)** | `server/db.ts` → `financeDues` | ✅ EXISTS |
| **Due Settlements** | `server/db.ts` → `financeDueSettlements` | ✅ EXISTS |
| **Recurring Transactions** | `server/db.ts` → `financeRecurringTransactions` | ✅ EXISTS |
| **Voucher Numbering** | `server/db.ts` → `financeVoucherSettings` | ✅ EXISTS |
| **Double-Entry Vouchers (NEW)** | `server/db.ts` → `financeVouchers` + 4 related tables | ✅ EXISTS |
| **Households (Shared)** | `server/db.ts` → `financeHouseholds` + members/budgets/expenses | ✅ EXISTS |
| **Invoices** | `server/db.ts` → `financeInvoices` + items | ✅ EXISTS |
| **Inventory** | `server/db.ts` → `financeInventoryItems` | ✅ EXISTS |
| **Payroll (Employees/Salary/Advances)** | `server/db.ts` → `financeEmployees` + payments + advances | ✅ EXISTS |
| **Audit Logs** | `server/db.ts` → `auditLogs` + `financeVoucherAudit` | ✅ EXISTS |
| **Private Storage (Backups/Exports)** | `server/db.ts` → `financePrivateStorageObjects` | ✅ EXISTS |
| **Financial Statements** | `server/doubleEntryAccounting.ts` | ✅ EXISTS |
| **Cloud Backup** | `server/cloudBackupService.ts` | ✅ EXISTS |
| **Scheduled Jobs** | `server/scheduledFinance.ts` + `scheduledBackup.ts` | ✅ EXISTS |

---

## 3. Existing Database Tables (33 tables)

| Table | Purpose | Status |
|-------|---------|--------|
| `users` | Core identity (Google OAuth + password) | ✅ EXISTS |
| `finance_projects` | User workspaces | ✅ EXISTS |
| `finance_households` | Shared family profiles | ✅ EXISTS |
| `finance_household_members` | Household invitations/membership | ✅ EXISTS |
| `finance_shared_budgets` | Household category budgets | ✅ EXISTS |
| `finance_shared_expenses` | Household expenses with contributor | ✅ EXISTS |
| `finance_voucher_settings` | Voucher number ranges | ✅ EXISTS |
| **`finance_vouchers`** | **Voucher header (atomic group)** | ✅ **NEW** |
| **`finance_voucher_debits`** | **Debit entries (Dr)** | ✅ **NEW** |
| **`finance_voucher_credits`** | **Credit entries (Cr)** | ✅ **NEW** |
| **`finance_ledger_entries`** | **Posted ledger with running balance** | ✅ **NEW** |
| **`finance_voucher_references`** | **Cross-refs (cheque, bill, invoice)** | ✅ **NEW** |
| **`finance_voucher_audit`** | **Immutable audit trail (same TX)** | ✅ **NEW** |
| `finance_accounts` | Cash/Bank/Mobile accounts | ✅ EXISTS |
| `finance_categories` | Income/Expense categories | ✅ EXISTS |
| `finance_transactions` | Legacy single-entry transactions | ✅ EXISTS |
| `finance_budgets` | Monthly category budgets | ✅ EXISTS |
| `finance_bills` | Bill reminders | ✅ EXISTS |
| `finance_dues` | Debt/Receivable tracking | ✅ EXISTS |
| `finance_due_settlements` | Payments/Collections against dues | ✅ EXISTS |
| `finance_recurring_transactions` | Recurring templates | ✅ EXISTS |
| `finance_invoices` | Customer invoices | ✅ EXISTS |
| `finance_invoice_items` | Invoice line items | ✅ EXISTS |
| `finance_inventory_items` | Stock inventory | ✅ EXISTS |
| `finance_employees` | Employee profiles | ✅ EXISTS |
| `finance_salary_payments` | Monthly salary calculations | ✅ EXISTS |
| `finance_employee_advances` | Salary advances/loans | ✅ EXISTS |
| `audit_logs` | System-wide audit trail | ✅ EXISTS |
| `finance_private_storage_objects` | Backup/Export metadata | ✅ EXISTS |

**Migrations:** 10 migrations in `drizzle/` (0000–0009). Latest adds payroll/inventory/invoices.

---

## 4. Existing API Procedures (tRPC Routers)

### Auth Router (`auth.*`)
| Procedure | Type | Auth | Status |
|-----------|------|------|--------|
| `auth.me` | query | public | ✅ EXISTS |
| `auth.register` | mutation | public | ✅ EXISTS |
| `auth.login` | mutation | public | ✅ EXISTS |
| `auth.logout` | mutation | public | ✅ EXISTS |
| `auth.setPassword` | mutation | inputOnly | ✅ EXISTS |

### Admin Router (`admin.*`) — requires admin role + elevation
| Procedure | Type | Auth | Status |
|-----------|------|------|--------|
| `admin.verifyAccess` | mutation | admin | ✅ EXISTS |
| `admin.elevationStatus` | query | admin | ✅ EXISTS |
| `admin.revokeAccess` | mutation | admin | ✅ EXISTS |
| `admin.users` | query | elevatedAdmin | ✅ EXISTS |
| `admin.updateUserStatus` | mutation | elevatedAdmin | ✅ EXISTS |
| `admin.projects` | query | elevatedAdmin | ✅ EXISTS |
| `admin.auditLogs` | query | elevatedAdmin | ✅ EXISTS |
| `admin.auditLogExport` | query | elevatedAdmin | ✅ EXISTS |
| `admin.auditActivity` | query | elevatedAdmin | ✅ EXISTS |

### Projects Router (`projects.*`)
| Procedure | Type | Auth | Status |
|-----------|------|------|--------|
| `projects.list` | query | protected | ✅ EXISTS |
| `projects.create` | mutation | inputOnly | ✅ EXISTS |
| `projects.active` | query | inputOnly | ✅ EXISTS |

### Finance Router (`finance.*`) — 60+ procedures
| Category | Procedures | Auth |
|----------|------------|------|
| **Overview/Analytics** | `overview`, `budgetPlan`, `analytics`, `automationOverview`, `monthlyReport` | protected |
| **Transactions** | `searchTransactions`, `paginatedTransactions` | protected |
| **Vouchers (NEW)** | `createVoucher` | **inputOnly** |
| **Legacy Transactions** | `addTransaction`, `updateTransaction`, `deleteTransaction` | inputOnly / protected |
| **Dues** | `addDue`, `settleDue` | inputOnly / protected |
| **Accounts** | `addAccount`, `updateAccount`, `deleteAccount` | inputOnly / protected |
| **Budgets** | `saveBudget` | inputOnly |
| **Bills** | `addBill`, `updateBill`, `setBillPaid`, `deleteBill`, `enableBillReminder` | inputOnly / protected |
| **Recurring** | `addRecurringTemplate`, `setRecurringActive`, `generateRecurringNow`, `enableRecurringSchedule` | inputOnly / protected |
| **Voucher Settings** | `voucherSettings`, `saveVoucherSettings`, `voucherPrint` | protected |
| **Statements** | `statementData`, `financialStatements`, `firmProfile`, `saveFirmProfile` | protected |
| **Households** | `households`, `householdInvitations`, `createHousehold`, `householdOverview`, `inviteHouseholdMember`, `acceptHouseholdInvitation`, `updateHouseholdMember`, `saveSharedHouseholdBudget`, `addSharedHouseholdExpense` | protected |
| **Invoices** | `invoices`, `invoiceById`, `createInvoice`, `updateInvoiceStatus`, `deleteInvoice` | protected |
| **Inventory** | `inventoryList`, `createInventoryItem`, `updateInventoryItem`, `adjustInventoryStock`, `deleteInventoryItem` | protected |
| **Payroll** | `employeesList`, `createEmployee`, `updateEmployee`, `deleteEmployee`, `salaryPaymentsList`, `disburseSalary`, `employeeAdvancesList`, `createEmployeeAdvance` | protected / inputOnly |
| **Backup/Export** | `exportData`, `exportProjectBackup`, `previewProjectBackup`, `restoreProjectBackup`, `cloudBackupStatus`, `triggerCloudBackup` | protected |
| **Offline Sync** | `syncOfflineTransactions` | inputOnly |

**Total Procedures:** ~65 across 5 routers

---

## 5. Existing Authentication

| Aspect | Implementation | Status |
|--------|----------------|--------|
| **Primary** | Google OAuth 2.0 (`/api/auth/google/*`) | ✅ EXISTS |
| **Fallback** | Email/Password (bcrypt + constant-time verify) | ✅ EXISTS |
| **Session** | JWT (HS256 via jose) in HttpOnly cookie | ✅ EXISTS |
| **Cookie** | `__Host-` prefix optional; Secure; SameSite=Lax | ✅ EXISTS |
| **Token Expiry** | 1 year (configurable) | ✅ EXISTS |
| **Bootstrap Admin** | `ADMIN_BOOTSTRAP_EMAIL` + `OWNER_OPEN_ID` | ✅ EXISTS |
| **Rate Limiting** | Per-IP on auth endpoints (15min/20 register, 15/15 login) | ✅ EXISTS |

**Auth Modes:** `google` | `password` (controlled by `AUTH_MODE` / `VITE_AUTH_MODE`)

---

## 6. Existing Authorization

| Role | Permissions | Status |
|------|-------------|--------|
| **admin** | Full access + user management + audit + elevation | ✅ EXISTS |
| **user** | Full CRUD on own projects + read all | ✅ EXISTS |
| **input_only** | CREATE-only (transactions, dues, accounts, bills, budgets, vouchers, payroll, sync) | ✅ EXISTS |
| **household.owner** | Full household CRUD | ✅ EXISTS |
| **household.editor** | Create expenses/budgets | ✅ EXISTS |
| **household.viewer** | Read-only | ✅ EXISTS |

**Middleware Chain:**
- `publicProcedure` → no auth
- `protectedProcedure` → authenticated, active, not input_only
- `inputOnlyProcedure` → authenticated, active, role in [input_only, user, admin]
- `adminProcedure` → role === admin
- `elevatedAdminProcedure` → admin + valid elevation session (15min TTL) or inline password

**Project Scoping:** All finance procedures require `projectId` and validate ownership via `assertOwnedProject()`.

---

## 7. Existing Audit System

| Component | Implementation | Status |
|-----------|----------------|--------|
| **System Audit** | `auditLogs` table (create/update/delete) | ✅ EXISTS |
| **Voucher Audit** | `financeVoucherAudit` table (snapshot JSON in same TX) | ✅ **NEW** |
| **Coverage** | 35+ mutations checked via `audit-coverage.test.ts` | ✅ EXISTS |
| **Admin Access** | `admin.auditLogs`, `auditLogExport`, `auditActivity` | ✅ EXISTS |
| **Filters** | date range, actor, role, search, pagination | ✅ EXISTS |
| **Immutability** | Insert-only tables; no update/delete procedures | ✅ EXISTS |

**Audit Fields:** actorUserId, projectId, action, entityType, entityId, summary, createdAt

---

## 8. Existing Backup System

| Feature | Implementation | Status |
|---------|----------------|--------|
| **Local Export** | `exportUserData()` / `exportProjectBackup()` → JSON | ✅ EXISTS |
| **Project Backup** | Full schema (accounts, categories, transactions, budgets, bills, dues, settlements, recurring, voucherSettings) | ✅ EXISTS |
| **Restore** | `restoreProjectBackup()` → new project with data | ✅ EXISTS |
| **Cloud Backup** | Supabase / S3 (R2/MinIO) / Google Drive webhook | ✅ EXISTS |
| **Encryption** | AES-256-GCM (key from dedicated `BACKUP_ENCRYPTION_KEY` only; no admin-password fallback) | ✅ EXISTS |
| **Scheduled** | Daily cron (18:00) via Vercel cron + manual trigger | ✅ EXISTS |
| **Verification** | SHA-256 checksum + metadata in `financePrivateStorageObjects` | ✅ EXISTS |
| **Download Control** | Signed URLs + ownership/household membership check | ✅ EXISTS |

---

## 9. Existing Testing System

| Test Type | Framework | Files | Status |
|-----------|-----------|-------|--------|
| **Unit/Integration** | Vitest | 85 test files, 478 tests | ✅ EXISTS |
| **E2E Browser** | Playwright | 2 test files | ✅ EXISTS |
| **Isolated E2E** | Custom script + test DB | 1 test file | ✅ EXISTS |
| **Auth Tests** | `auth-rate-limit.test.ts`, `password.auth.test.ts` | ✅ EXISTS |
| **Permission Tests** | `permissions.test.ts`, `input-only-permissions.test.ts` (106 tests) | ✅ EXISTS |
| **DB Constraint Tests** | `database-constraints.test.ts` | ✅ EXISTS |
| **Transaction Validation** | `transaction-validation.test.ts`, `transaction-idempotency.test.ts` | ✅ EXISTS |
| **Audit Coverage** | `audit-coverage.test.ts` (static analysis) | ✅ EXISTS |
| **Backup Tests** | `export-reports.test.ts`, `cloudBackupService.test.ts` | ✅ EXISTS |
| **Concurrent Ops** | `concurrent-operations.test.ts` | ✅ EXISTS |
| **Full Workflows** | `full-user-workflows.test.ts` | ✅ EXISTS |

**Coverage Gaps:** No contract tests for tRPC procedures; limited E2E coverage.

---

## 10. Dependency Risks

| Dependency | Version | Risk | Notes |
|------------|---------|------|-------|
| `drizzle-orm` | 0.45.2 | LOW | Actively maintained |
| `drizzle-kit` | 0.31.10 | LOW | Matches ORM version |
| `@trpc/server` | 11.18.0 | LOW | Stable |
| `@trpc/client` | 11.18.0 | LOW | Stable |
| `@trpc/react-query` | 11.18.0 | LOW | Stable |
| `zod` | 4.6.5 | MEDIUM | v4 breaking changes possible |
| `react` | 19.3.0 | MEDIUM | React 19 recently released |
| `express` | 5.2.1 | MEDIUM | Express 5 recently released |
| `mysql2` | 3.24.4 | LOW | Stable |
| `jose` | 6.2.12 | LOW | Stable |
| `vitest` | 5.0.1 | LOW | Stable |
| `playwright` | 1.63.0 | LOW | Stable |
| `pino` | 10.3.1 | LOW | Stable |
| `helmet` | 8.3.0 | LOW | Stable |

**Action:** Pin exact versions; monitor zod v4, React 19, Express 5 for breaking changes.

---

## 11. Security Risks

| Risk | Severity | Mitigation Status |
|------|----------|-------------------|
| **No CSP** | MEDIUM | `helmet.contentSecurityPolicy: false` — needs policy |
| **In-memory rate limiter** | MEDIUM | Not distributed; fails in serverless — use Redis/Upstash |
| **JWT in cookie** | LOW | HttpOnly + Secure; consider short expiry + refresh tokens |
| **Admin password in env** | LOW | `ADMIN_ACCESS_PASSWORD` used only for admin elevation/2FA — never for backup auth or encryption |
| **No CSRF token** | LOW | SameSite=Lax cookies + tRPC POST-only mutations mitigate |
| **SQL Injection** | LOW | Drizzle parameterized queries |
| **XSS** | LOW | React auto-escape; no dangerouslySetInnerHTML found |
| **Path Traversal** | LOW | `storageKey.replace(/^\/+/, "")` in private storage |
| **Timing Attacks** | LOW | `timingSafeCompare` for passwords/admin tokens |
| **IDOR** | LOW | All procedures validate `projectId` ownership |

---

## 12. Accounting Risks

| Risk | Severity | Mitigation Status |
|------|----------|-------------------|
| **Single-entry legacy** | HIGH | `financeTransactions` lacks double-entry validation |
| **No running balance** | HIGH | Legacy transactions don't track account running balance |
| **Voucher audit outside TX** | MEDIUM | System audit logged AFTER commit; new voucher audit IN TX |
| **No reversal/correction** | MEDIUM | No credit note / reversing entry workflow |
| **Floating point** | LOW | `decimal(15,2)` used everywhere; `decimal()` helper formats |
| **Concurrent balance updates** | MEDIUM | `FOR UPDATE` used in `adjustAccountBalance` and new voucher TX |
| **Missing chart of accounts** | MEDIUM | Categories used as accounts; no proper CoA hierarchy |
| **No period locking** | MEDIUM | No month-end close / lock functionality |

**New Double-Entry System (vouchers):** Addresses most risks via atomic 5-table transaction with running balances and in-TX audit.

---

## 13. Data Integrity Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **No FK enforcement in TiDB** | HIGH | TiDB supports FK but may not enforce; app-level checks exist |
| **Soft deletes missing** | MEDIUM | Hard deletes used; audit log captures but no recovery |
| **No backup verification** | MEDIUM | Checksums stored but no automated restore test |
| **Idempotency keys** | LOW | `idempotencyKey` on transactions (24hr TTL in-memory) |
| **Race conditions** | MEDIUM | `FOR UPDATE` on account balance; voucher number claim uses optimistic lock |
| **Cascade delete safety** | MEDIUM | `onDelete: cascade` on project → could lose data; audit remains |

---

## 14. Missing Functionality

| Feature | Priority | Notes |
|---------|----------|-------|
| **Chart of Accounts** | HIGH | Hierarchical CoA with account types (asset/liability/equity/income/expense) |
| **Period Lock / Month-End Close** | HIGH | Prevent edits to closed periods |
| **Reversing Entries / Credit Notes** | HIGH | Proper correction workflow |
| **Multi-currency** | MEDIUM | Single currency (BDT) only |
| **Bank Reconciliation** | MEDIUM | Match statement lines to ledger |
| **Fixed Assets / Depreciation** | MEDIUM | Not modeled |
| **Tax/VAT Reporting** | MEDIUM | Invoice VAT exists; no VAT return |
| **Cost Centers / Dimensions** | MEDIUM | Only project/household scoping |
| **Approval Workflow** | MEDIUM | Draft → Approve → Post for vouchers |
| **Attachments/Receipts** | LOW | Cloud backup only; no per-transaction docs |
| **API Keys / Webhooks** | LOW | No external integration API |
| **Dark Mode** | LOW | Tailwind ready; not implemented |
| **Keyboard Shortcuts** | LOW | Not implemented |
| **Offline-First Sync Conflict Resolution** | MEDIUM | Last-write-wins; no conflict UI |

---

## 15. Recommended Upgrade Order

### Phase 1: Security & Stability (Immediate)
1. ✅ **Input-only permissions** — COMPLETE (106 tests pass)
2. 🔲 **Enable CSP** — Define policy for scripts/styles/fonts
3. 🔲 **Distributed Rate Limiter** — Replace in-memory with Upstash Redis
4. 🔲 **Short-lived JWT + Refresh Tokens** — Rotate tokens; detect theft
5. 🔲 **Audit CSP Violations** — Report-only mode first

### Phase 2: Accounting Hardening (High Priority)
6. ✅ **Double-Entry Voucher System** — COMPLETE (5 tables + atomic TX + in-TX audit)
7. 🔲 **Migrate Legacy Transactions** — Backfill `financeTransactions` → vouchers (optional)
8. 🔲 **Chart of Accounts** — Replace flat categories with hierarchical CoA
9. 🔲 **Period Lock** — Month-end close with admin override
10. 🔲 **Reversal Workflow** — Credit note / reversing voucher with audit link
11. 🔲 **Bank Reconciliation Module** — Match + unreconciled report

### Phase 3: Data Integrity & Reliability
12. 🔲 **FK Enforcement Verification** — Test TiDB FK behavior; add app-level asserts
13. 🔲 **Automated Restore Test** — CI job: backup → restore → verify checksums
14. 🔲 **Soft Delete Pattern** — `deletedAt` + filtered indexes; retain audit
15. 🔲 **Idempotency Persistence** — Move from in-memory to DB table with TTL

### Phase 4: Features & UX
16. 🔲 **Multi-Currency** — Exchange rates + base currency per project
17. 🔲 **Fixed Assets / Depreciation** — Asset register + monthly journal
18. 🔲 **VAT/Tax Returns** — Auto-generate from invoices/purchases
19. 🔲 **Cost Centers / Dimensions** — Tags on ledger entries
20. 🔲 **Approval Workflow** — Draft → Review → Post (role-based)
21. 🔲 **Attachments** — Per-voucher/document upload to private storage
22. 🔲 **External API / Webhooks** — tRPC public procedures + HMAC verification

### Phase 5: Observability & Ops
23. 🔲 **Structured Metrics** — Prometheus exporter (pino → prometheus)
24. 🔲 **Distributed Tracing** — OpenTelemetry (Sentry already integrated)
25. 🔲 **Runbook Documentation** — Incident response for each component
26. 🔲 **Chaos Testing** — Simulate DB failover, rate limit, clock skew

### Phase 6: Tech Debt & Modernization
27. 🔲 **React 19 Migration Verification** — Test all components
28. 🔲 **Express 5 Migration Verification** — Test middleware chain
29. 🔲 **Zod v4 Migration** — Update schemas; test validation
30. 🔲 **Drizzle v1 Preparation** — Monitor RFCs
31. 🔲 **TypeScript Strict Mode** — Already enabled; verify no `any`

---

## Summary

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 8/10 | Clean separation; tRPC provides type safety |
| **Security** | 7/10 | Good authz; needs CSP + distributed rate limit |
| **Accounting** | 6/10 | Legacy single-entry; new double-entry system added |
| **Data Integrity** | 7/10 | FKs, transactions, audit; needs soft delete + restore test |
| **Testing** | 8/10 | Excellent unit coverage; E2E needs expansion |
| **Observability** | 6/10 | Pino + Sentry; needs metrics + tracing |
| **Maintainability** | 8/10 | Modular; strict TS; good docs |

**Overall:** **7.3/10** — Production-ready with clear path to accounting-grade hardening.

---

*This audit is a living document. Update after each phase completion.*