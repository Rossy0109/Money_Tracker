# PRISM REPORT — Phase 4 (Frontend + UX)

**Agent:** PRISM (Ling 3.1 Flash Free role)
**Date:** 2026-10-06
**Scope:** React, Vite, wouter, TanStack Query, Tailwind, navigation, forms, dashboard, voucher UI, reports, settings, admin, mobile UI, permission-aware UI, a11y. Read-only.

---

## 1. Routing & Navigation

| Check | Status | Evidence |
|---|---|---|
| All wouter routes resolve to existing pages | ✅ | 21 routes in `App.tsx:41-63`, all lazy pages exist; 22 sidebar/tab hrefs all map (`DashboardLayout.tsx:70-290`) |
| Hash anchors (`/#transactions` etc.) | ✅ | Targets exist (`Home.tsx:1130`, `AccountsPanel.tsx:36`, `BudgetsPanel.tsx:45`) |
| **SPA navigation** | ⚠️ **P2** | No wouter `Link` anywhere — nav items are raw `<a href>` (`DashboardLayout.tsx:314,381,412,427`) → **full document reload on every menu click**, wiping React state + query cache. wouter effectively decorative (only 3 programmatic jumps) |
| Cross-page anchor nav | ⚠️ P3 | `/#...` clicks from subpages do full load; deep-link/refresh scroll unverified |

## 2. Query / Loading States

| Check | Status |
|---|---|
| Loading loops | ✅ None — all gating uses `enabled:` + v5 `isLoading`; disabled queries never spin |
| Query keys | ✅ Consistent tRPC procedure+input keys, per-page `refresh()` helpers |
| **Stale data** | ⚠️ **P2** — `Home.tsx:292-297 refresh()` never invalidates `finance.monthlyReport` (rendered `:1091-1095`) → Accounting Summary stale after every mutation until reload. Also `VoucherReversal.tsx:86-93` and `FinanceBackup.tsx:114` partial invalidations (P3) |

## 3. Forms & Errors

| Check | Status |
|---|---|
| react-hook-form/zod in production | ❌ Unused — 0 `<FormField>` outside dead `ui/form.tsx`; all forms are `useState` + manual checks (deps present but idle) |
| Validation tests | ⚠️ `forms/validation.test.ts` tests schemas **nothing imports** (dead test) |
| Mutation error surfacing | ✅ 69 `useMutation` sites, 64 with `onError` toast; rest covered by try/catch or intentional (offline sync) |
| **Query error surfacing** | ⚠️ **P2** — only 2 pages render `isError`; global subscriber toasts only 5xx/429/offline; **400/401/403 fall through silently → empty pages with zero feedback** (`networkErrorHandler.ts:250-263`) |
| `Payroll.tsx:88-110` | P3 — 4 queries, no loading/error state → empty-table flash |

## 4. Permission-Aware UI (UX only; backend authoritative) ✅

Client `lib/rbac.ts` reads **server-returned** roles/permissions — no client-side model drift possible. Two mismatches:

| ID | Severity | Finding |
|---|---|---|
| P-01 | P3 | **Under-grant**: sidebar `/account` requires `user.read` (`DashboardLayout.tsx:201`) but page hosts self-service `setPassword` (any `*.create` holder) → MANAGER/ACCOUNTING_ADMIN can't reach password change in UI though API allows |
| P-02 | P3 | **Over-grant**: sidebar `/statements`, `/reports` gate on `reports.view` but server needs `accounting.read` (`routers.ts:1639,688,635`) → SYSTEM_ADMIN/HR_ADMIN see entries, get silent-403 empty pages |
| P-03 | P3 | Missing page-level gates on most pages (statements, payroll, period-lock, etc.) — direct URL renders 403-empty shell. Health + backup pages gate correctly |

## 5. Auth-Mode Handling

- ✅ Client reads `VITE_AUTH_MODE` in exactly 2 places (`const.ts:9`, `AuthCard.tsx:91`); enforced by `check-auth-mode.mjs` predev/prebuild/build:vercel + `env-auth-mode.test.ts`.
- ⚠️ **P2** mismatched UI surfaces: password mode renders dead "Google sign-in" button (`AuthCard.tsx:300-327`); google mode renders password form that only works for pre-existing password accounts.

## 6. Other bugs

| ID | Severity | Finding |
|---|---|---|
| P-04 | P3 | `Home.tsx:1004-1011` — `window.location.replace("#transactions")` during **render** (side effect in render path) |
| P-05 | P4 | `useAuth.ts:57-64` — `localStorage.setItem` inside `useMemo` (render side effect) |
| P-06 | P4 | `DashboardLayoutSkeleton.tsx` zero importers (dead code); `useOfflineSync.ts:68` swallows sync failures silently |

## 7. A11y / Responsive — mostly good

✅ `lang="bn"`, 50 `aria-label`, 47 `focus-visible` rings, `aria-current` on tabs, safe-area bottom bar, `useMobile` 768px, keyboard-reachable gesture siblings, horizontal-scroll tables.
⚠️ P3: 89 `<Label>` vs 17 `htmlFor` (label association relies on proximity); P4: no skip-to-content; `Categories.tsx:121,173` dual `<h1>` in exclusive branches.

## 8. Test coverage reality

- **26 client `.wiring.test.ts`** are `readFileSync` source-string assertions (e.g. exact CSS class literal) — brittle, never render UI.
- 57 client `*.test.ts` run under vitest **node environment**: **0 `.test.tsx`, no jsdom, no @testing-library** → no component/interaction tests; `.tsx` outside coverage.

## 9. Recommendations

1. **P2 (highest value):** add `finance.monthlyReport` to `refresh()` invalidations; render global 4xx error feedback (403 especially).
2. **P2:** replace raw `<a href>` nav with wouter `Link` (SPA navigation without state/cache wipe).
3. **P2:** gate auth-mode-specific UI (hide Google button in password mode, hide password form in google mode).
4. **P3:** fix sidebar permission mismatches (P-01/P-02); add page-level gates.
5. **P3:** fix render-phase side effects (P-04/P-05).
6. **P4:** delete dead `DashboardLayoutSkeleton`, dead validation schemas or wire them into forms.

**Frontend permission checks remain UX-only; backend authorization unchanged and authoritative.**
