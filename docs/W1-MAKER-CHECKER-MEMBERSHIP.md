# W-1 — Reachable maker–checker via project membership

Status: implemented (server + minimal client), pending owner review/merge.

Source: `docs/04-READINESS-VERDICT.md` §2 (W-1, P1). Chosen path: **option (b) — extend project membership** so a second account can approve/post without ownership transfer.

## Why

In a single-owner project the owner is the only actor allowed to touch vouchers, and every lifecycle step blocks the voucher's creator/submitter (4-eyes). With no second actor the approve→post path was unreachable, so every real posting flowed through system auto-posting.

## Design (delegation, data stays owner-keyed)

- Every finance row remains keyed to the project owner's `userId` (`finance_vouchers.userId`, `finance_chart_of_accounts.userId`, ledger/journal rows, backups, audits). No data is re-keyed and all statements/invariants keep their existing scope.
- New table `finance_project_members` (`projectId`, `userId`/`inviteeEmail`, `role∈{maker,checker}`, `status∈{pending,active,declined,revoked}`, `invitedByUserId`, `acceptedAt`) mirrors the household invitation model (email-matched acceptance).
- `finance_vouchers.createdBy` records the **acting maker**. Legacy rows are `NULL`; the maker identity falls back to `userId` (`voucherMakerId`).
- New authorization helper `getProjectAccess(userId, projectId)` → `{ role: owner|maker|checker, ownerId, project }`. Membership gates only the **voucher domain**:

| Action | owner | maker | checker |
|---|---|---|---|
| read (voucher list, reversals, CoA) | ✓ | ✓ | ✓ |
| create draft / submit | ✓ | ✓ | — |
| approve / post | ✓ | — | ✓ |
| reverse | ✓ | — | ✓ |

- Self-checks are unchanged in intent and now use the maker identity: creator cannot approve/post/reverse their own voucher; submitter cannot approve their own submission. Auto-posting still requires `_internalPostedBy`.
- Journal metadata inside posting is stamped with `ownerId`; the acting poster/approver is recorded on the voucher columns (`submittedBy`/`approvedBy`/`postedBy`/`reversedBy`) and `finance_voucher_audit.actorUserId`.
- `listProjects` returns owned projects (role `owner`) plus accepted membership projects (role `maker`/`checker`) so the voucher workspace selector reaches shared ledgers.

## Operational requirement (RBAC)

Membership is the **project-level** delegation. The second account also needs the procedure-level RBAC grants for the actions it performs:

- maker → `voucher.create`, `voucher.submit` (e.g. `INPUT_OPERATOR` has create; `MANAGER` has create+submit)
- checker → `voucher.approve`, `voucher.post` (e.g. `MANAGER`)

Assign the role to the second account before inviting it. Membership alone does not grant RBAC permissions.

## Known limitation

The member workspace is voucher-scoped. Selecting a shared project on owner-only pages (overview, statements, etc.) returns "Project not found or access denied" by design, since those domains stay `assertOwnedProject`.

## Migration / rollout

- `drizzle/0023_project_members_maker_checker.sql`: creates `finance_project_members` and adds nullable `finance_vouchers.createdBy` (additive, no backfill needed).
- `scripts/bootstrap-local-e2e-schema.mjs` updated for disposable-DB tests.

## Verification

- `server/project-membership.test.ts` (disposable MariaDB): access resolution, invitation visibility/acceptance email matching, full maker→checker approve→post path, role separation, revocation, reversal delegation and owner-stamped reversal rows.
- Existing invariants updated: `server/self-approval-prevention.test.ts`, `server/accounting-invariants.test.ts`.
- `client/src/pages/project-members.wiring.test.ts`, `vouchers.wiring.test.ts`.
