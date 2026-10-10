# PRISM REPORT — Phase 4 (Frontend)

**Agent:** PRISM (Ling 3.1 role)
**Model:** Ling 3.1 Flash (currently available OpenCode model)
**Date:** 2026-10-09
**Branch:** `agent/prism/frontend`
**Scope:** Client (`client/`) — React 19, wouter routing, TanStack Query (tRPC), Tailwind. Implements the four Forge→Prism handoff items.

---

## 0. HANDOFF ACCEPTANCE (FORGE → PRISM)

```
PREVIOUS_AGENT: FORGE
COMMIT_VERIFIED: NOT_APPLICABLE (no commit — uncommitted in shared workspace)
FILES_VERIFIED: YES (docs/FORGE-REPORT.md; handoff items enumerated §4)
TEST_RESULTS_VERIFIED: YES (Forge gates green: coverage 70.38/61.52/70.88/71.73 with DB)
KNOWN_RISKS_REVIEWED: YES (F-12 migration 0020 deploy note; stable-key semantics)
HANDOFF_STATUS: ACCEPTED
REASON: Forge backend complete with no blocking defects; the four client items
        are independent, well-scoped, and testable in the node test env.
```

---

## 1. COMPLETION REPORT (REQUIRED FORMAT)

```
AGENT: PRISM (Ling 3.1)
MODEL: Ling 3.1 Flash
ROLE: FRONTEND
TASK_SCOPE: Forge handoff — sync chunking, stable idempotency keys,
            duplicate-project 409 UX, registration gating verification.
STATUS: COMPLETE

TASKS:
- P1 Offline sync chunking: server now rejects >500 items per
  syncOfflineTransactions call. useOfflineSync sends sequential
  chunks of ≤500 (SYNC_CHUNK_SIZE) via exported pure buildSyncChunks;
  each chunk is cleared from the queue only after it is durably synced,
  so a mid-batch failure leaves exactly the unsynced remainder queued.
  Toast reports the true synced total.
- P2 Stable idempotency keys: new client/src/lib/idempotency.ts.
  transactionUpdateKey(id, payload) = "update:<id>:<FNV-1a fingerprint
  of sorted payload>" — an accidental retry replays identically, while
  a genuinely different edit gets a different key (no false 409).
  transactionDeleteKey(projectId, id) = "delete:<projectId>:<id>"
  (deterministic payload). Wired into Home.tsx updateTransaction and
  deleteTransaction mutations.
- P3 Duplicate project 409 UX: classifyNetworkError gains an explicit
  CONFLICT_409 kind (non-retryable, surfaces the server's Bengali
  message) instead of lumping into generic CLIENT_4XX. Home.tsx
  createProject.onError keeps the dialog open with an inline
  destructive error on 409; ProjectDialog gains an optional
  `error` prop. Other callers unaffected (optional prop).
- P4 Registration gating verification: AuthCard already hides the
  sign-up UI when VITE_AUTH_MODE === "google" (defence-in-depth with
  Forge's API-level 404/FORBIDDEN). Locked with a source-assertion
  wiring test (AuthCard.authmode.wiring.test.ts), the repo's
  established pattern for component contracts in the node env.

FILES:
- client/src/hooks/useOfflineSync.ts: SYNC_CHUNK_SIZE + buildSyncChunks
  export; chunked sync loop with per-chunk queue removal.
- client/src/hooks/useOfflineSync.test.ts (NEW): 7 unit tests for the
  pure chunker (empty, small, oversized, exact multiple, order,
  custom max, nonsensical max).
- client/src/lib/idempotency.ts (NEW): transactionUpdateKey /
  transactionDeleteKey + FNV-1a fingerprint.
- client/src/lib/idempotency.test.ts (NEW): 9 tests (stability,
  id sensitivity, payload sensitivity, date-instant equality,
  undefined-normalisation, prefix, delete-key determinism).
- client/src/pages/Home.tsx: keys wired into update/delete mutations;
  projectError state; createProject 409 inline-error path.
- client/src/lib/networkErrorHandler.ts: CONFLICT_409 kind +
  classification before generic 4xx.
- client/src/lib/networkErrorHandler.test.ts: +3 CONFLICT_409 tests.
- client/src/components/dashboard/dialogs/ProjectDialog.tsx: optional
  error prop rendered as destructive text.
- client/src/components/AuthCard.authmode.wiring.test.ts (NEW): 4
  source-assertion tests locking the google-mode register contract.

TESTS:
- New/extended targeted: 39 passed across 5 files
  (useOfflineSync 7, idempotency 9, networkErrorHandler 15+3,
  AuthCard wiring 4, offline-sync existing).
- Full suite without DB: 1518 passed | 28 skipped (DB-gated suites
  self-skip by design).
- Forge-phase DB-backed coverage gate unchanged and unaffected
  (client-only additions; thresholds 70/60/70/70 held at Forge handoff).

TYPECHECK: PASS (pnpm check — clean)
LINT: PASS (pnpm lint — clean)
BUILD: PASS (pnpm build — vite production build, dist/ produced)

SECURITY: No new client trust boundaries; keys are derived locally and
validated server-side (server remains authoritative for idempotency).

REGRESSION: None. DashboardHeader references ProjectDialog only via an
onOpenProjectDialog callback (no prop change). All existing Home/auth
tests pass.

RISKS:
- Stable update key embeds a payload fingerprint: two edits with
  byte-identical payloads in quick succession replay (correct — the
  second is a duplicate of the first by definition).
- Chunked sync makes N tRPC calls for N/500 chunks; a failure at chunk
  k leaves chunks k..N queued (strictly better than the previous
  all-or-nothing rejection for >500 items).
- CONFLICT_409 classification keys on httpStatus 409 or "conflict" in
  the message; a server message that mentions "conflict" incidentally
  would be classified as 409 — cosmetic only (non-retryable either way).
```

---

## 2. HANDOFF TO GUARDIAN (BREAKER/QA)

```
NEXT_AGENT: GUARDIAN (Big Pickle)
HANDOFF_STATUS: READY
ITEMS_FOR_NEXT_AGENT:
- Adversarial review of stable-key semantics: confirm the tRPC
  idempotent middleware's request-hash check prevents a forged
  "update:<id>:<same-hash>" replay with a tampered payload.
- Migration 0020 (finance_firm_profiles) must be exercised in the
  full DB-backed gate (Forge ran it green; re-verify on Guardian's
  disposable DB).
- Offline queue integration: simulate >500 queued items end-to-end
  (chunking is unit-tested; an e2e-ish path test would strengthen it).
- Verify no client code path still reads firm profile from an
  in-memory-only source after Forge's persistence change.
RECOMMENDATION: PROCEED (all gates green; no blocking defects)
```

---

## 3. RECOMMENDATION

```
RECOMMENDATION: PROCEED TO GUARDIAN
RATIONALE: All four handoff items implemented and tested; check/lint/build
clean; full suite 1518 passed (28 DB-gated self-skips). No commit made
(per pipeline rules — awaiting user instruction).
```
