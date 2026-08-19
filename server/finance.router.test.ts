import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES, calculateBudgetProgress } from "./finance.constants";

const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getOverview: vi.fn(),
    listTransactions: vi.fn(),
    createTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    createAccount: vi.fn(),
    listCategories: vi.fn(),
    listBudgets: vi.fn(),
    upsertBudget: vi.fn(),
    createBill: vi.fn(),
    setBillPaid: vi.fn(),
  },
}));

vi.mock("./db", () => financeDb);

import { appRouter } from "./routers";

const authenticatedContext = {
  user: {
    id: 42,
    openId: "finance-owner",
    email: "owner@example.com",
    name: "Owner",
    loginMethod: "manus",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

describe("finance router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defines exactly the required default categories", () => {
    expect(DEFAULT_CATEGORIES).toEqual({
      income: ["Salary", "Business", "Investment"],
      expense: [
        "মেয়র স্যার",
        "রছি ভাই",
        "মুক্তার বাড়ির বাজার",
        "ইউটিলিটি বিল",
        "বেতন",
        "বাজারের বাসা খরচ",
        "যাতায়াত খরচ",
        "ঠিকাদারী ব্যবসা",
        "ঠিকাদার লাইসেন্স রেনুয়াল",
        "দেনা পাওনা",
        "রাজনৈতিক খরচ",
        "অনুদান",
      ],
    });
  });

  it("caps budget progress at 100 percent and handles a zero budget", () => {
    expect(calculateBudgetProgress(3750, 5000)).toBe(75);
    expect(calculateBudgetProgress(6000, 5000)).toBe(100);
    expect(calculateBudgetProgress(6000, 0)).toBe(0);
  });

  it("uses the authenticated user's id for overview, not an id from client input", async () => {
    financeDb.getOverview.mockResolvedValue({ totals: {} });
    const caller = appRouter.createCaller(authenticatedContext);
    await caller.finance.overview();
    expect(financeDb.getOverview).toHaveBeenCalledWith(42);
  });

  it("exports only the authenticated user's finance data", async () => {
    financeDb.getOverview.mockResolvedValue({ transactions: [] });
    const caller = appRouter.createCaller(authenticatedContext);

    await caller.finance.exportData();

    expect(financeDb.getOverview).toHaveBeenCalledWith(42);
  });

  it("scopes a new transaction to the authenticated user", async () => {
    financeDb.createTransaction.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(authenticatedContext);
    const occurredAt = new Date("2026-08-19T12:00:00.000Z");
    await caller.finance.addTransaction({ categoryId: 7, accountId: 3, type: "expense", amount: 1500, paymentMethod: "bKash", note: "Groceries", occurredAt });
    expect(financeDb.createTransaction).toHaveBeenCalledWith(42, expect.objectContaining({ categoryId: 7, accountId: 3, type: "expense", amount: "1500.00", occurredAt }));
  });

  it("rejects an unauthenticated finance request", async () => {
    const caller = appRouter.createCaller({ ...authenticatedContext, user: null });
    await expect(caller.finance.overview()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("passes the owner id when creating a budget and marking a bill paid", async () => {
    financeDb.upsertBudget.mockResolvedValue(undefined);
    financeDb.setBillPaid.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(authenticatedContext);
    await caller.finance.saveBudget({ categoryId: 5, monthKey: "2026-08", amount: 5000 });
    await caller.finance.setBillPaid({ id: 9, isPaid: true });
    expect(financeDb.upsertBudget).toHaveBeenCalledWith(42, { categoryId: 5, monthKey: "2026-08", amount: "5000.00" });
    expect(financeDb.setBillPaid).toHaveBeenCalledWith(42, 9, true);
  });
});
