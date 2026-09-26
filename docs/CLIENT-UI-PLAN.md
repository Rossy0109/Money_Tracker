# Client-Side UI Implementation Plan: Accounting-Grade Features

**Based on:** Existing React 19 + Vite + TanStack Query + tRPC + TailwindCSS 4 + Radix UI architecture

---

## 1. Current Architecture Summary

| Aspect            | Implementation                                                                      |
| ----------------- | ----------------------------------------------------------------------------------- |
| **Routing**       | Wouter (React Router alternative) - lazy-loaded pages in `App.tsx`                  |
| **State/Data**    | TanStack Query v5 + tRPC React hooks (`trpc.useQuery`, `trpc.useMutation`)          |
| **Layout**        | `DashboardLayout` with collapsible sidebar (`SidebarProvider`, `SidebarMenu`)       |
| **UI Components** | Radix UI primitives + TailwindCSS 4 (40+ components in `client/src/components/ui/`) |
| **Forms**         | React Hook Form + Zod validation (via tRPC input schemas)                           |
| **Notifications** | Sonner toasts                                                                       |
| **Auth**          | `useAuth` hook, input-only role detection                                           |

---

## 2. New Pages to Create

### 2.1 Chart of Accounts — `/chart-of-accounts`

**File:** `client/src/pages/ChartOfAccounts.tsx`

**Features:**

- Tree view using `Collapsible` (Radix) for hierarchical accounts
- Each node shows: code, name (BN/EN), type badge, current balance
- Inline actions: Add child, Edit, Delete (disabled if has children/voucher refs)
- Toolbar: "Seed Default CoA" button (input-only allowed), expand/collapse all
- Right panel: Account detail drawer on click

**tRPC Hooks:**

```typescript
const { data: accountTypes } = trpc.finance.getAccountTypes.useQuery();
const { data: coaTree } = trpc.finance.getChartOfAccountsTree.useQuery({
  projectId,
});
const createAccount = trpc.finance.createChartOfAccount.useMutation({
  onSuccess: invalidate,
});
const updateAccount = trpc.finance.updateChartOfAccount.useMutation({
  onSuccess: invalidate,
});
const deleteAccount = trpc.finance.deleteChartOfAccount.useMutation({
  onSuccess: invalidate,
});
const seedCoA = trpc.finance.seedChartOfAccounts.useMutation({
  onSuccess: invalidate,
});
```

**UI Components:** `Collapsible`, `TreeView` (custom recursive component), `Drawer` for detail/edit

**Sidebar Entry:**

```typescript
{ icon: BookOpen, label: "চার্ট অফ অ্যাকাউন্টস", href: "/chart-of-accounts" }
```

---

### 2.2 Period Lock — `/period-lock`

**File:** `client/src/pages/PeriodLock.tsx`

**Features:**

- List of months with status badges: 🔒 Locked / 🔓 Unlocked / ⏳ Current
- Lock action: modal with month picker + reason textarea (input-only allowed)
- Unlock action: confirmation dialog (admin only)
- Visual indicator: locked months show in transaction/voucher forms

**tRPC Hooks:**

```typescript
const { data: locks } = trpc.finance.getPeriodLocks.useQuery({ projectId });
const lockPeriod = trpc.finance.lockPeriod.useMutation({
  onSuccess: invalidate,
});
const unlockPeriod = trpc.finance.unlockPeriod.useMutation({
  onSuccess: invalidate,
});
```

**UI Components:** `Table`, `Dialog`, `Badge`, `Calendar` (month picker)

**Sidebar Entry:**

```typescript
{ icon: Lock, label: "পিরিয়ড লক", href: "/period-lock", adminOnly: true }  // unlock is admin-only
```

---

### 2.3 Voucher Reversal — `/voucher-reversal`

**File:** `client/src/pages/VoucherReversal.tsx`

**Features:**

- List of reversible vouchers (status = "posted", not already reversed)
- Each row: voucherNo, date, narration, total, "Reverse" button
- Reverse dialog: reason (required), date (defaults to today), shows preview of reversal entries (swapped Dr/Cr)
- After reversal: shows original + reversal voucherNo link

**tRPC Hooks:**

```typescript
const { data: vouchers } = trpc.finance.getVoucherList.useQuery({ projectId }); // Need new query
const { data: reversals } = trpc.finance.getVoucherReversals.useQuery({
  projectId,
});
const reverseVoucher = trpc.finance.reverseVoucher.useMutation({
  onSuccess: invalidate,
});
```

**UI Components:** `Table`, `Dialog`, `Select` (voucher picker), preview section

**Sidebar Entry:**

```typescript
{ icon: RotateCcw, label: "ভাউচার রিভার্সাল", href: "/voucher-reversal" }
```

---

### 2.4 Bank Reconciliation — `/bank-reconciliation`

**File:** `client/src/pages/BankReconciliation.tsx`

**Features:**

- **List view:** Table of reconciliations (account, statement date, statement/book balance, difference, status)
- **Create dialog:** Account selector (CoA bank accounts only), statement date, statement balance, notes
- **Detail view (matching screen):**
  - Header: account info, statement balance, book balance, difference, status badge
  - Two columns: **Bank Statement Items** (left) | **Book Ledger Entries** (right)
  - Each statement item: ref, date, amount, type, [Match dropdown] / [Unmatch button]
  - Auto-suggest matches by amount + date proximity
  - "Complete" button (enabled when difference = 0)

**tRPC Hooks:**

```typescript
const { data: recs } = trpc.finance.getBankReconciliations.useQuery({
  projectId,
});
const createRec = trpc.finance.createBankReconciliation.useMutation({
  onSuccess: invalidate,
});
const getRec = trpc.finance.getBankReconciliation.useQuery({
  projectId,
  reconciliationId,
});
const addItem = trpc.finance.addBankReconciliationItem.useMutation({
  onSuccess: invalidate,
});
const matchItem = trpc.finance.matchBankReconciliationItem.useMutation({
  onSuccess: invalidate,
});
const unmatchItem = trpc.finance.unmatchBankReconciliationItem.useMutation({
  onSuccess: invalidate,
});
const completeRec = trpc.finance.completeBankReconciliation.useMutation({
  onSuccess: invalidate,
});
```

**UI Components:** `Table`, `Dialog`, `Tabs` (List/Detail), `Select` with search (ledger entry picker), drag-drop optional

**Sidebar Entry:**

```typescript
{ icon: Banknote, label: "ব্যাংক রিকোনসিলিয়েশন", href: "/bank-reconciliation" }
```

---

## 3. Shared Components to Create

### 3.1 `TreeView` Component

**Location:** `client/src/components/ChartOfAccountsTree.tsx`

```typescript
interface TreeNode {
  id: number;
  code: string;
  name: string;
  nameBn?: string;
  accountTypeId: number;
  currentBalance: string;
  isDetail: boolean;
  children: TreeNode[];
}
```

Uses `Collapsible` recursively with indentation, expand/collapse all button.

### 3.2 `AccountTypeBadge` Component

Reusable badge showing account type with color coding:

- Asset: green
- Liability: red
- Equity: purple
- Revenue: blue
- Expense: orange

### 3.3 `PeriodLockBadge` Component

Reusable badge for transaction/voucher forms showing lock status.

---

## 4. Navigation Updates

### 4.1 `DashboardLayout.tsx` — Add to `menuItems`

```typescript
{ icon: BookOpen, label: "চার্ট অফ অ্যাকাউন্টস", href: "/chart-of-accounts" },
{ icon: Lock, label: "পিরিয়ড লক", href: "/period-lock" },
{ icon: RotateCcw, label: "ভাউচার রিভার্সাল", href: "/voucher-reversal" },
{ icon: Banknote, label: "ব্যাংক রিকোনসিলিয়েশন", href: "/bank-reconciliation" },
```

### 4.2 `App.tsx` — Add Routes

```typescript
const ChartOfAccounts = lazy(() => import("./pages/ChartOfAccounts"));
const PeriodLock = lazy(() => import("./pages/PeriodLock"));
const VoucherReversal = lazy(() => import("./pages/VoucherReversal"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));

// In Switch:
<Route path="/chart-of-accounts" component={ChartOfAccounts} />
<Route path="/period-lock" component={PeriodLock} />
<Route path="/voucher-reversal" component={VoucherReversal} />
<Route path="/bank-reconciliation" component={BankReconciliation} />
```

---

## 5. API Gaps to Address

| Feature                 | Missing Query           | Solution                                 |
| ----------------------- | ----------------------- | ---------------------------------------- |
| Voucher Reversal list   | `getVoucherList`        | Add `getVoucherList` in `db.ts` + router |
| CoA seed                | `seedChartOfAccounts`   | Already exists                           |
| Bank Rec account filter | Filter CoA to bank type | Add `accountTypeId` filter in query      |

---

## 6. Implementation Order (Recommended)

| Phase | Page                    | Dependencies                    | Effort |
| ----- | ----------------------- | ------------------------------- | ------ |
| 1     | **Chart of Accounts**   | TreeView component, Collapsible | Medium |
| 2     | **Period Lock**         | Simple table + dialog           | Low    |
| 3     | **Voucher Reversal**    | Needs `getVoucherList` API      | Medium |
| 4     | **Bank Reconciliation** | Most complex (matching UI)      | High   |

---

## 7. Key Design Decisions

| Decision                      | Rationale                                 |
| ----------------------------- | ----------------------------------------- |
| CoA tree uses `Collapsible`   | Already in Radix UI, no new deps          |
| Period lock in separate page  | Admin-only unlock, clean separation       |
| Reversal preview in dialog    | Avoid navigation loss, immediate feedback |
| Bank rec two-column layout    | Standard accounting UX pattern            |
| Lazy-loaded pages             | Consistent with existing pattern          |
| Input-only allowed for create | Matches server-side permissions           |

---

## 8. Testing Strategy

| Test Type   | Coverage                                                        |
| ----------- | --------------------------------------------------------------- |
| Unit        | TreeView recursion, badge components                            |
| Integration | tRPC mutations + invalidation flow                              |
| E2E         | Create CoA → use in voucher → period lock → reversal → bank rec |

---

## 9. Files to Create/Modify

| File                                            | Action                        |
| ----------------------------------------------- | ----------------------------- |
| `client/src/pages/ChartOfAccounts.tsx`          | Create                        |
| `client/src/pages/PeriodLock.tsx`               | Create                        |
| `client/src/pages/VoucherReversal.tsx`          | Create                        |
| `client/src/pages/BankReconciliation.tsx`       | Create                        |
| `client/src/components/ChartOfAccountsTree.tsx` | Create (recursive tree)       |
| `client/src/components/DashboardLayout.tsx`     | Add 4 menu items              |
| `client/src/App.tsx`                            | Add 4 routes + imports        |
| `server/routers.ts`                             | Add `getVoucherList` query    |
| `server/db.ts`                                  | Add `getVoucherList` function |

---

**Estimated Total:** ~1,500–2,000 lines of client code across 4 pages + shared components.
