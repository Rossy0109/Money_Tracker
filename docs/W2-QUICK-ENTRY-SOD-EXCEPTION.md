# W-2 — Quick-entry auto-posting: accepted segregation-of-duties exception

Status: **documented and accepted** (P2-W-2, `docs/04-READINESS-VERDICT.md` §2).
A "strict mode" flag for multi-operator deployments is a recorded follow-up, not
implemented — it is a product decision (see §4).

## 1. What the exception is

Human vouchers must travel the lifecycle: draft → submit → approve → post, with
4-eyes self-checks (creator ≠ approver/poster, submitter ≠ approver; W-1 extends
this to maker/checker project members). Quick-entry flows bypass that lifecycle:
they call `createVoucherWithEntriesInTx` with `status: "posted"` directly.

The gate is `validateVoucherInput` in `server/db.ts` (~line 1198):

```ts
if (input.status === "posted" && !input._internalPostedBy) {
  throw new Error("সরাসরি পোস্ট করা ভাউচার তৈরি করা যাবে না; প্রথমে ড্রাফ্ট তৈরি করুন");
}
```

`_internalPostedBy` is a **server-only** field: it is absent from every client
zod input (`voucherInput` and friends), so a client can never set it. Only
internal call sites pass it.

## 2. Covered flows

| Flow | Function (server/db.ts) |
|---|---|
| Quick income/expense entry (canonical voucher) | `canonicalQuickVoucherInTx` |
| Due settlement | `settleDue` |
| Wallet opening-balance voucher | `postWalletOpeningVoucherInTx` |
| Employee advance | `createEmployeeAdvance` |
| Reversal of an already-posted voucher | `reverseVoucherInTx` |

An auto-posted voucher is indistinguishable by status from a human-posted one
except that `submittedBy`/`approvedBy` are empty — the gate flag itself is not
persisted.

## 3. Why it is accepted

- **Single-operator UX is the product's default deployment.** One person books
  cash income/expense, settles dues, tops up wallets. Forcing a
  submit→approve round trip on oneself for every ৳50 quick entry adds no
  assurance and would make the app unusable alone.
- **Every other control stays on**: server-derived `userId` ownership, RBAC
  `voucher.create`/`accounting.create` permission, double-entry balance
  validation, period-lock enforcement (`assertPeriodNotLockedTx`), idempotency
  keys on transaction paths, and `logAudit` / `finance_voucher_audit` rows.
- **Human vouchers keep full 4-eyes.** The exception never applies to the
  manual voucher form; there `_internalPostedBy` is unset by construction.
- **W-1 closes the multi-operator gap for the manual path**: project members
  (maker/checker) can split submit/approve across two accounts.

## 4. Follow-up: strict mode (not implemented)

For multi-operator deployments that want *no* auto-posting at all, a
`strictMode` project setting (or env `VOUCHER_STRICT_MODE=1`) could reject
`_internalPostedBy` creations at `createVoucherWithEntriesInTx` entry, forcing
quick entries into draft so a second operator must approve. This requires a
product decision (which flows, if any, remain exempt — wallet opening balances
are pure bookkeeping setup with no operator split to enforce), so it is
recorded here rather than shipped.

## 5. Verification

- `server/voucher-lifecycle.test.ts`, `server/self-approval-prevention.test.ts`,
  `server/input-operator-security.test.ts` — the gate and 4-eyes rules stay
  pinned.
- `server/finance-lifecycle.e2e.ts` (P2-D-1) uses the quick-entry path on a
  disposable MariaDB and is an executable example of the exception.
