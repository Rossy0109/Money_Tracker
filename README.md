# Ahmed's Financial Accounting — Personal & Business Finance Manager

**Ahmed's Financial Accounting** is a modern personal & business finance web application for recording income, expenses, account balances, monthly budgets, invoices, inventory, and bill reminders in Bangladeshi taka (৳).

## What it includes

| Area | Included capability |
|---|---|
| Dashboard | Total balance, income, expense, net amount, and a six-month income-versus-expense chart |
| Transactions | Income and expense entry with category, date, payment method, note, filter, and deletion |
| Accounts | Cash, bank, and mobile banking accounts with opening and auto-updated running balances |
| Budgets | Per-expense-category monthly budgets with actual-spend progress |
| Bills | Upcoming bill tracking with a paid/unpaid state |
| Categories | Fixed defaults only: income — Salary, Business, Investment; expense — মেয়র স্যার, রছি ভাই, মুক্তার বাড়ির বাজার, ইউটিলিটি বিল, বেতন, বাজারের বাসা খরচ, যাতায়াত খরচ, ঠিকাদারী ব্যবসা, ঠিকাদার লাইসেন্স রেনুয়াল, দেনা পাওনা, রাজনৈতিক খরচ, অনুদান |
| Privacy | All finance requests use the authenticated user's server-side identifier; records are scoped by `userId` |

## Running locally

Install dependencies and start the development server.

```bash
pnpm install
pnpm dev
```

For a production verification run:

```bash
pnpm check
pnpm test
pnpm build
```

## Authentication and data isolation

The application uses Google OAuth 2.0 and email/password sign-in (`AUTH_MODE=google` or `AUTH_MODE=password`; server `AUTH_MODE` and client `VITE_AUTH_MODE` must match). Every database query and write is protected by an authenticated procedure and carries the server-derived user ID; the browser never supplies a user ID for finance records.

## Deployment notes

This source tree deploys to Vercel (`pnpm run build:vercel`), which serves the Vite frontend and the Express API (`api/[...path].js`). Configure `AUTH_MODE`/`VITE_AUTH_MODE`, Google OAuth credentials, `DATABASE_URL`, and session secrets in the hosting provider's environment variables. Keep this repository as the portable source-code backup for future changes.

## Continuous deployment

Pushes to `main` trigger GitHub Actions (`Verify money tracker`), and when those checks pass the `Deploy to Vercel (CD)` workflow deploys the production build to Vercel. The `main` branch is protected: direct pushes are rejected, so changes land through pull requests with at least one approval and green CI checks.

## Test coverage

The test suite verifies the fixed category contract, budget percentage behavior, authenticated ownership scoping for finance operations, unauthenticated rejection, and bill/budget mutation routing.
