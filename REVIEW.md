# Expert Application Review

## 2026-08-20 review results

The dashboard, all category routes, and the desktop and mobile responsive layouts were visually checked after the active-project continuity and finance-integrity updates. The dashboard renders Bengali controls, BDT balances, transaction entry access, vouchers, account, budget, bill, debt, receivable, project, profile, and administrator controls without overlapping the footer or hiding primary actions. The desktop category overview and separate income/expense pages retain the selected project, provide a clear dashboard return path, and preserve the persistent sidebar.

On a 375px mobile viewport, the dashboard switches to a compact header while preserving the primary actions. The category overview, income category list, and twelve-item expense category list remain readable and vertically scrollable, with visible dashboard return controls and project selection. No visual clipping, overlapping controls, or off-screen mandatory content was observed in the reviewed routes.

Automated verification completed with 48 tests across 19 files passing, TypeScript checks passing, and a production build completing successfully. The production dependency audit reported no known vulnerabilities after upgrading Drizzle ORM to the patched 0.45.2 release. The build still reports a non-blocking client bundle size advisory; it does not affect correctness or deployment, but future code-splitting can reduce first-load size.

## Remaining external validation

An end-to-end Manus OAuth login from the user's own mobile browser cannot be impersonated in this review environment. The application includes the mobile-friendly fallback and the review confirms the responsive sign-in-facing pages, but a real user session is still needed to confirm the final external identity-provider redirect and browser-specific keyboard/cookie behavior.

## Workflow evidence matrix

| Area | Implementation and authorization evidence | Regression and review evidence |
| --- | --- | --- |
| Profile and projects | Protected `projects.list` and `projects.create` routes; selected project persists across the dashboard and category routes. | `default-project-name.test.ts`, `activeProject.test.ts`, desktop/mobile route review. |
| Transactions and accounts | Protected, project-scoped create/edit/delete routes; account updates are committed with the transaction and immutable audit record. | `finance.router.test.ts`, `finance-integrity.wiring.test.ts`, `audit-write.integration.test.ts`. |
| Budgets and bills | Amount, month, project, and ownership validation are enforced in protected procedures. Every mutation includes the audit insert in its transaction. | `finance.router.test.ts`, `audit-coverage.test.ts`, dashboard visual review. |
| Categories | Exact required category sets remain project-scoped. Category browsing is separated into overview, income, and expense pages. | `finance.router.test.ts`, `categories-page.wiring.test.ts`, desktop/mobile visual review. |
| Dues and receivables | Settlement updates outstanding balances and account balances without creating income or expense transactions. | `dueAccounting.test.ts`, `debt-accounting.wiring.test.ts`, `finance.router.test.ts`. |
| Vouchers | Per-project settings are validated; automatic voucher claims are sequential and configuration cannot exclude the next required number. | `finance.router.test.ts`, `audit-write.integration.test.ts`, `finance-integrity.wiring.test.ts`. |
| Administration and audit | `adminProcedure` plus a timing-safe server-only second factor gate user/project, audit, activity, and export access. | `admin.verify-access.test.ts`, `admin-ui-access.test.ts`, `admin-ui.wiring.test.ts`, `finance.router.test.ts`. |
| Audit exports | CSV/PDF export reuses validated server-side filters and reports client-visible errors. | `finance.router.test.ts`, `auditFilters.test.ts`, `admin-ui.wiring.test.ts`. |
| Private backup/export | A protected user-data JSON export is scoped to the authenticated user and includes projects, ledgers, settlement history, and voucher settings; the UI directs a user to a private Drive folder without exposing shared data. | `finance.router.test.ts`, `Home.tsx` export review. |
| Navigation and responsive UI | Sidebar routes and same-page anchors are defined for dashboard sections; category routes retain project selection and a dashboard return path. | `sidebar-navigation.wiring.test.ts`, `data-entry.wiring.test.ts`, `categories-page.wiring.test.ts`, desktop/mobile visual review. |

## Sidebar destination checklist

| Sidebar control | Exact target | Expected behavior | Evidence reviewed |
| --- | --- | --- | --- |
| Overview | `/#overview` | Scrolls to the summary and current-project dashboard overview. | `DashboardLayout.tsx`, `Home.tsx`, `sidebar-navigation.wiring.test.ts`, desktop review. |
| Transactions | `/#transactions` | Scrolls to the ledger list, filters, and create/edit/delete transaction controls. | `DashboardLayout.tsx`, `Home.tsx`, `ledger-details.wiring.test.ts`, desktop/mobile review. |
| Accounts | `/#accounts` | Scrolls to account balances and the account create/edit/delete workflow. | `DashboardLayout.tsx`, `Home.tsx`, `functional-workflows.wiring.test.ts`, desktop review. |
| Budgets | `/#budgets` | Scrolls to current-month budget progress and the budget save dialog. | `DashboardLayout.tsx`, `Home.tsx`, `functional-workflows.wiring.test.ts`, desktop review. |
| Categories | `/categories` | Opens separate Bengali category overview; income and expense pages preserve the selected project and offer a dashboard return control. | `DashboardLayout.tsx`, `Categories.tsx`, `categories-page.wiring.test.ts`, `activeProject.test.ts`, desktop/mobile review. |
| Data entry | `/#transactions` | Makes the primary sidebar action reach the transaction form workflow within the selected project. | `DashboardLayout.tsx`, `Home.tsx`, `data-entry.wiring.test.ts`. |
| Administrator controls | Profile-triggered dialog on `/` | Requires administrator role and the server-only second-factor verification before user, project, audit, activity, or export data is loaded. | `Home.tsx`, `routers.ts`, `admin-ui-access.test.ts`, `admin.verify-access.test.ts`. |
| Audit export | Administrator dialog on `/` | Exports only the currently validated and filtered audit-log set as CSV or PDF; displays an error when no exportable records exist. | `Home.tsx`, `routers.ts`, `finance.router.test.ts`, `admin-ui.wiring.test.ts`. |
| Private backup export | Profile action on `/` | Retrieves only the authenticated user's JSON data and prompts private-folder storage rather than public sharing. | `Home.tsx`, `routers.ts`, `finance.router.test.ts`. |

## Functional workflow checklist

| Workflow | Typed action and authorization boundary | Integrity and error-handling evidence | Regression or visual evidence |
| --- | --- | --- | --- |
| Project creation and selection | `projects.create` and `projects.list` use `protectedProcedure`; `activeProject.ts` stores only the selected workspace identifier. | Project data is queried with the active `projectId`; a missing project prevents finance mutations through `requireProject`. | `default-project-name.test.ts`, `activeProject.test.ts`, `Home.tsx` and `Categories.tsx` review. |
| Transaction create, edit, and delete | `finance.addTransaction`, `updateTransaction`, and `deleteTransaction` are protected and pass both user and project ownership to the data layer. | Account delta, ledger change, voucher claim, and immutable audit insert share database transactions; client validation and error toasts cover invalid amounts or failed requests. | `finance-integrity.wiring.test.ts`, `finance.router.test.ts`, `audit-write.integration.test.ts`, dashboard review. |
| Account create, edit, and delete | Account procedures require authentication and a project ID. | Deletes are refused when ledger rows reference the account; audit insert shares the account mutation transaction. | `finance.router.test.ts`, `audit-coverage.test.ts`, `functional-workflows.wiring.test.ts`. |
| Budget save | `finance.saveBudget` is protected and accepts a positive, bounded amount, valid category, and `YYYY-MM` month key. | Project/category ownership is checked before the upsert and audit entry; the form reports invalid input. | `finance.router.test.ts`, `audit-coverage.test.ts`, dashboard review. |
| Bill create, edit, paid toggle, and delete | Every bill route is protected and user/project-scoped. | Each bill mutation includes its immutable audit record in the same database transaction; client uses a resettable dialog and error feedback. | `finance.router.test.ts`, `audit-write.integration.test.ts`, `audit-coverage.test.ts`, dashboard review. |
| Due create and settlement | `finance.addDue` and `settleDue` are protected and project-scoped. | Settlement cannot exceed outstanding value, uses a sequential voucher, adjusts only outstanding/account balance, and never produces income/expense. | `dueAccounting.test.ts`, `debt-accounting.wiring.test.ts`, `finance.router.test.ts`. |
| Voucher settings and issuance | `voucherSettings` and `saveVoucherSettings` are protected and project-scoped. | Server validates integer ranges and rejects settings that would omit the next required voucher; optimistic claim prevents duplicate issued numbers. | `finance.router.test.ts`, `audit-write.integration.test.ts`, `finance-integrity.wiring.test.ts`, voucher dialog review. |
| Administrator verification | `adminProcedure` enforces role, then every sensitive read repeats timing-safe server-only password verification. | Client does not load protected admin queries before verification; failed verification resets access and shows an error. | `admin.verify-access.test.ts`, `admin-ui-access.test.ts`, `finance.router.test.ts`. |
| Audit filters, analytics, pagination, and export | Admin audit routes accept bounded, validated filters only after second-factor verification. | CSV/PDF requests reuse exact filters; zero-result and request errors are surfaced to the user. | `auditFilters.test.ts`, `admin-ui.wiring.test.ts`, `finance.router.test.ts`. |
| User data export and private backup | `finance.exportData` is protected and has no user-supplied identifier. | Export queries only the current user and includes finance records, dues, settlements, and voucher settings; UI avoids public sharing and directs a private Drive folder. | `finance.router.test.ts`, `Home.tsx` export review, `functional-workflows.wiring.test.ts`. |
