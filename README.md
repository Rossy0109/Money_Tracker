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

The application uses the provided Manus OAuth flow. Users sign in through the account portal, which supports the Gmail-compatible login experience available to their Manus account. Every database query and write is protected by an authenticated procedure and carries the server-derived user ID; the browser never supplies a user ID for finance records.

## Deployment notes

This source tree is designed for the Manus full-stack environment, which provides the required OAuth and managed database configuration. Before making a deployment public, create a checkpoint, then use the project interface's **Publish** control. Keep this repository as the portable source-code backup for future changes.

## Test coverage

The test suite verifies the fixed category contract, budget percentage behavior, authenticated ownership scoping for finance operations, unauthenticated rejection, and bill/budget mutation routing.
