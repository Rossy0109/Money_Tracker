# AGENT TASK MATRIX

**Project:** Money Tracker  
**Phase:** 0 — Inspection & Baseline  
**Report Date:** 2026-10-09  
**Model:** Nemotron 3.5 Lightning Free (currently available OpenCode model)  

---
## 1. SEVEN-AGENT RESPONSIBILITY OVERVIEW

Use the following seven logical roles. Model availability can change; use the exact currently available model ID shown in OpenCode.

| Agent | Model | Primary Focus | Key Deliverables |
|---|---|---|---|
| **1 — Fledge / MASTER ARCHITECT** | Nemotron 3.5 Lightning Free | Audit, architecture baseline, risk register, task ownership, acceptance criteria | `docs/AGENT-ARCHITECTURE-REPORT.md`, `docs/AGENT-TASK-MATRIX.md`, risk register, task dependencies, acceptance criteria per phase |
| **2 — ATLAS / DATABASE AND ACCOUNTING** | Nemotron 3 Ultra Free | Database schema safety, financial data integrity, double-entry accounting, voucher/journal lifecycle, ledger integrity, decimal precision, transaction atomicity, idempotency, data ownership | Verify debit/credit balance, posting atomicity, reversal historical records, disposable DB for migration rehearsal |
| **3 — SENTINEL / SECURITY AND AUTHENTICATION** | Big Pickle | Google OAuth, password auth, sessions/JWTs/cookies, RBAC/permission enforcement, user/resource ownership, admin privilege boundaries, input-only restrictions, rate limiting, input validation, secret handling, replay/duplicate-mutation protection, self-approval prevention | Backend authorization is authoritative; hiding a button/route in frontend is not a security control |
| **4 — FORGE / BACKEND AND API** | MiMo-V2.6-Flash | Express/tRPC, routers/middleware/services, DB access integration, input validation/error handling, transaction boundaries, audit/idempotency integration, retry safety, scheduled jobs/backup behavior, Vercel API handling, backend tests/compatibility | Every mutation must have: auth, ownership, permission, validation, transaction, audit, idempotency controls |
| **5 — PRISM / FRONTEND AND UX** | Ling 3.1 Flash | React/Vite, routing/navigation, sidebar/dashboard, forms/validation, voucher/accounting screens, reports/settings/admin screens, loading/success/error states, query invalidation/mutation handling, responsive layouts/accessibility, frontend/backend contract compatibility | Do not bypass backend authorization or hide errors to make interface appear successful |
| **6 — GUARDIAN / QA AND ADVERSARIAL REVIEW** | Muse Spark 1.3 | Independent review of integrated candidate, unit/integration/regression/security tests, accounting/RBAC tests, build/typecheck verification, migration rehearsal verification, E2E testing (where environment permits), defect reproduction/severity classification, release-gate matrix | Do not delete/weaken/skip tests merely to achieve a passing result |
| **7 — HELIX / INTEGRATION AND RELEASE** | Space Bunny Free | Review every agent report/handoff, inspect cumulative diffs/commits, resolve integration conflicts, verify test evidence, reject unsafe/unrelated changes, verify migrations/dependencies/secrets/deployment config, verify rollback/recovery plans, produce final release report | Only HELIX may authorize integration under this workflow; actual merge permissions enforced by repo config/access controls |

---
## 2. EXECUTION ORDER

Follow this order unless Fledge documents a justified dependency change and HELIX approves it:

1. **Fledge** — repository audit and planning.
2. **Atlas** — database and accounting.
3. **Sentinel** — authentication, security, and RBAC.
4. **Forge** — backend and API.
5. **Prism** — frontend and UX.
6. **Guardian** — integrated QA and adversarial review.
7. **Helix** — final integration and release decision.

**Parallel work is allowed only when:**
- File ownership is explicit.
- Dependencies are understood.
- Shared-file conflicts are controlled.
- Branches or worktrees are isolated where supported.
- Each agent produces a verifiable handoff.

Do not start a dependent phase while required predecessor work remains blocked or unverified.

---
## 3. FILE OWNERSHIP AND GIT SAFETY

Before modifying files:
- Run `git status`.
- Inspect the current branch and existing diffs.
- Check recent commits.
- Identify changes owned by another agent.

Never:
- Overwrite another agent's work blindly.
- Reset or discard uncommitted work without explicit approval.
- Force-push without explicit approval.
- Silently rewrite commit history.
- Commit secrets.
- Mix unrelated changes into one commit.
- Merge unreviewed changes automatically.

Use isolated branches or worktrees when supported. If only one shared workspace is available, execute agents sequentially and establish explicit file ownership.

**Suggested branch names:**
- `agent/fledge/architecture`
- `agent/atlas/accounting`
- `agent/sentinel/security`
- `agent/forge/backend`
- `agent/prism/frontend`
- `agent/guardian/qa`
- `agent/helix/integration`

Only HELIX authorizes integration in this workflow.

---
## 3. FINANCIAL DATA SAFETY

Production data must remain untouched during analysis and testing. Prohibited unless separately authorized through a reviewed migration plan:
- `DROP DATABASE`
- `DROP TABLE`
- `TRUNCATE`
- Unscoped destructive `DELETE`
- Production restore experiments
- Unverified production migrations
- Deletion or silent mutation of posted financial records

Before any migration:
1. Inspect the migration.
2. Confirm its intended effect.
3. Check backward compatibility.
4. Test against a disposable database.
5. Verify rollback or recovery procedures.
6. Record the evidence.
7. Obtain the required approval before production execution.

Use decimal-safe arithmetic for financial values. Do not use ordinary floating-point arithmetic as the authoritative accounting representation.

Preserve the audit trail for posting, reversal, approval, and other material accounting actions.

---
## 4. ACCOUNTING INVARIANTS

Verify the actual accounting implementation and tests. Required controls include:
- Debit and credit equality for applicable posted journal entries.
- Valid voucher lifecycle transitions.
- Atomic posting.
- Duplicate-posting protection.
- Idempotent mutation handling where required.
- Posted-record immutability.
- Traceable reversals.
- Consistent journal and ledger records.
- Reconciled financial reports.
- Appropriate fiscal-period controls.
- Resource ownership and authorization.
- Audit records for material changes.

**Expected lifecycle, if supported by the actual implementation:**
`DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED`

Do not force this lifecycle onto an existing implementation without inspecting its schema and business rules first.

---
## 5. INPUT-ONLY ROLE

The Input-Only role must be restricted to authorized new-entry operations for the designated Accounting, Budget, Payroll, Ledger, and Voucher modules, according to the approved product requirements.

It must not gain unauthorized abilities to:
- View or search existing records.
- Edit or delete existing records.
- Approve or post transactions.
- Access reports.
- Access settings or administrative functions.
- Bypass restrictions through direct API calls.

Verify every relevant backend endpoint. UI restrictions alone are insufficient.

If the existing product requirements distinguish entry creation from ledger access, follow the approved requirements and document any ambiguity before implementation.

---
## 6. SEGREGATION OF DUTIES

Where the approved accounting rules require separation of duties, the creator must not approve, post, or reverse their own transaction.

Apply the rule consistently across normal users and elevated administrative roles unless an explicitly approved, documented exception exists.

Test the restriction through the authoritative backend path.

Never treat a disabled button as proof that self-approval is prevented.

---
## 7. AUTHENTICATION AND DEPLOYMENT

Preserve the existing authentication architecture unless an approved change is necessary.

Inspect and test:
- Login initiation.
- OAuth callback.
- Redirect URI configuration.
- Session creation and invalidation.
- Cookie attributes and production HTTPS behavior.
- Environment-specific configuration.
- Authorization checks.
- Error handling and redirect loops.
- Vercel routing and SPA fallback.
- Database connectivity.
- GitHub Actions configuration.

Never print real secrets in logs, reports, commits, or test output.

Do not place production credentials, API keys, private customer information, or production database dumps into prompts or model contexts.

Use placeholders when discussing configuration.

Do not claim a production deployment is successful unless deployment status and application behavior have been verified.

---
## 8. REQUIRED COMPLETION REPORT

Every agent must submit a report using this exact structure:

```
AGENT:MODEL:ROLE:TASK_SCOPE:STATUS
STATUS: COMPLETE / COMPLETE_WITH_WARNINGS / BLOCKED / FAILED

TASKS_ASSIGNED:
- ...

TASKS_COMPLETED:
- ...

FILES_INSPECTED:
- ...

FILES_CHANGED:
- ...

FILES_NOT_CHANGED:
- ...

BRANCH: ...

COMMITS: ...

IMPLEMENTATION_SUMMARY:
- ...

TYPECHECK: PASS / FAIL / NOT_RUN / BLOCKED
LINT: PASS / FAIL / NOT_RUN / BLOCKED
BUILD: PASS / FAIL / NOT_RUN / BLOCKED
SECURITY_CHECK: PASS / FAIL / NOT_VERIFIED / NOT_APPLICABLE
ACCOUNTING_CHECK: PASS / FAIL / NOT_VERIFIED / NOT_APPLICABLE
REGRESSION_CHECK: PASS / FAIL / NOT_VERIFIED / NOT_APPLICABLE

RISKS_FOUND:
- ...

RISKS_FIXED:
- ...

RISKS_REMAINING:
- ...

ENVIRONMENTAL_LIMITATIONS:
- ...

DEPENDENCIES:
- ...

BLOCKERS:
- ...

NEXT_AGENT: ...

RECOMMENDATION:
- ...
```

An agent may report `COMPLETE` only when all mandatory checks in its approved task matrix pass and all required deliverables are present.

If a mandatory check fails or remains unverified, use `COMPLETE_WITH_WARNINGS`, `BLOCKED`, or `FAILED` as appropriate. A critical security or accounting uncertainty must block acceptance of the affected scope.

---
## 9. HANDOFF ACCEPTANCE GATE

The receiving agent must inspect the previous agent's report, commits, changed files, relevant tests, and unresolved risks.

The receiving agent must respond:

```
PREVIOUS_AGENT: ...
HANDOFF_VERIFIED: YES / NO
COMMIT_VERIFIED: YES / NO / NOT_APPLICABLE
FILES_VERIFIED: YES / NO
TEST_RESULTS_VERIFIED: YES / NO
KNOWN_RISKS_REVIEWED: YES / NO
HANDOFF_STATUS: ACCEPTED / ACCEPTED_WITH_WARNINGS / REJECTED / BLOCKED
REASON: ...
```

Do not advance dependent work when the handoff is incomplete or a critical dependency remains unresolved.

---
## 10. TESTING POLICY

Run the project's actual supported commands. Discover the scripts in `package.json` rather than assuming that command names exist.

Run relevant checks for:
- Lint.
- TypeScript.
- Unit tests.
- Integration tests.
- Authentication and authorization.
- RBAC.
- Accounting.
- API behavior.
- Frontend behavior.
- Production build.
- Migration rehearsal.
- End-to-end behavior where supported.
- Security and regression risks.

Record exact commands and results.

Do not claim that a test passed if it was not executed.

Do not change a test merely to make a defect disappear. Any legitimate test correction requires a documented reason and review.

A browser test that cannot run in the local environment must be marked with the actual limitation and supported by appropriate alternative evidence where possible.

---
## 11. SEVERITY CLASSIFICATION

- **P0** — Critical data loss, major financial corruption, severe compromise, or equivalent release-stopping risk.
- **P1** — Critical security, accounting, authentication, authorization, or release-blocking defect.
- **P2** — Major functional defect or substantial regression.
- **P3** — Moderate defect or non-critical usability issue.
- **P4** — Minor improvement or cosmetic issue.

Unresolved P0/P1 issues prevent a GREEN release. Do not suppress or downgrade a finding without documented evidence and justification.

---
## 12. FINAL RELEASE GATES

HELIX must produce a release-gate matrix:

- Architecture reviewed.
- Required handoffs accepted.
- Typecheck passed.
- Lint passed.
- Unit tests passed.
- Integration tests passed.
- Build passed.
- Accounting invariants verified.
- Ledger integrity verified.
- Authentication verified.
- Security checks passed.
- RBAC checks passed.
- Input-Only restrictions verified.
- Self-approval prevention verified where required.
- Migration rehearsal passed.
- No unauthorized destructive database operation.
- No secret leakage.
- API compatibility verified.
- Deployment configuration verified.
- Regression testing completed.
- E2E testing passed, or a documented environmental limitation with appropriate alternative evidence.
- Rollback or recovery plan reviewed.

Every gate must have a status, evidence, and explanation for any exception. Do not label an unverified gate as passing.

---
## 13. FINAL HELIX REPORT

```
Project: Money_Tracker
Final status: GREEN / YELLOW / RED

ARCHITECTURE: ...
DATABASE: ...
ACCOUNTING: ...
SECURITY: ...
AUTHENTICATION: ...
RBAC: ...
BACKEND: ...
FRONTEND: ...
QA: ...
DEPLOYMENT: ...
INTEGRATION_DECISIONS: ...
UNRESOLVED_CONFLICTS: ...
REMAINING_BLOCKERS: ...
ROLLBACK_PLAN: ...
RELEASE_GATE_MATRIX: ...
RECOMMENDATION: RELEASE / HOLD / STOP
```

GREENAll mandatory release gates pass, no unresolved P0/P1 issue remains, and all critical claims are supported by evidence.

YELLOWNo known release-blocking issue remains, but documented non-critical risks or limitations require an explicit acceptance decision and remediation plan.

REDP0/P1 issue remains unresolved, a critical financial or security invariant is unverified, a migration is unsafe, secrets are exposed, or a release-blocking test fails.
```

---
## 14. FINAL OPERATING COMMAND

Start with Fledge. Audit before implementation. Assign clear ownership. Protect financial records. Make minimal, justified changes. Test every critical change. Require evidence. Require receiving-agent acceptance. Do not silently skip incomplete work. Do not expose secrets. Do not perform destructive database operations. Do not claim success without verification. Integrate only reviewed changes. Release only when HELIX has evaluated the evidence and approved the release decision.

Operate as one controlled senior engineering team, not seven independent code generators.