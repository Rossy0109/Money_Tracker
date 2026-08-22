import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateBudgetAlerts,
  calculateBudgetEarlyWarnings,
  DEFAULT_CATEGORIES,
  calculateBudgetProgress,
} from "./finance.constants";
import { ENV } from "./_core/env";

const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getOverview: vi.fn(), getBudgetPlan: vi.fn(), getFinanceAnalytics: vi.fn(), searchTransactions: vi.fn(), getMonthlyReport: vi.fn(), getVoucherSettings: vi.fn(), updateVoucherSettings: vi.fn(), exportUserData: vi.fn(), exportProjectBackup: vi.fn(), previewProjectBackup: vi.fn(), restoreProjectBackup: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(),
    createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), createDue: vi.fn(), settleDue: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(),
    upsertBudget: vi.fn(), createBill: vi.fn(), updateBill: vi.fn(), setBillPaid: vi.fn(), deleteBill: vi.fn(), getAutomationOverview: vi.fn(), createRecurringTemplate: vi.fn(), updateRecurringTemplate: vi.fn(), generateRecurringNow: vi.fn(), setRecurringScheduleTask: vi.fn(), setBillReminderSettings: vi.fn(), setBillScheduleTask: vi.fn(),
    listUsersForAdmin: vi.fn(), listProjectsForAdmin: vi.fn(), listAuditLogs: vi.fn(), listAuditLogsPage: vi.fn(), listAuditLogsForExport: vi.fn(), getAuditLogActivity: vi.fn(),
  },
}));

vi.mock("./db", () => financeDb);

import { appRouter } from "./routers";

const authenticatedContext = {
  user: { id: 42, openId: "finance-owner", email: "owner@example.com", name: "Owner", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

const administratorContext = {
  ...authenticatedContext,
  user: { ...authenticatedContext.user, id: 1, openId: "system-owner", role: "admin" as const },
} as any;

const expenseInput = { projectId: 88, categoryId: 7, accountId: 3, type: "expense" as const, amount: 1500, paymentMethod: "bKash", note: "Groceries", occurredAt: new Date("2026-08-19T12:00:00.000Z") };

describe("finance router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defines the user-approved Bengali default expense categories", () => {
    expect(DEFAULT_CATEGORIES).toEqual({
      income: ["Salary", "Business", "Investment"],
      expense: ["মেয়র স্যার", "রছি ভাই", "মুক্তার বাড়ির বাজার", "ইউটিলিটি বিল", "বেতন", "বাজারের বাসা খরচ", "যাতায়াত খরচ", "ঠিকাদারী ব্যবসা", "ঠিকাদার লাইসেন্স রেনুয়াল", "দেনা পাওনা", "রাজনৈতিক খরচ", "অনুদান"],
    });
  });

  it("caps budget progress safely", () => {
    expect(calculateBudgetProgress(3750, 5000)).toBe(75);
    expect(calculateBudgetProgress(6000, 5000)).toBe(100);
    expect(calculateBudgetProgress(6000, 0)).toBe(0);
  });

  it("alerts only after a category strictly exceeds its budget and ranks the largest overage first", () => {
    expect(calculateBudgetAlerts([
      { categoryId: 7, categoryName: "বেতন", budgetAmount: 5000, spent: 5000 },
      { categoryId: 8, categoryName: "বাজার", budgetAmount: 3000, spent: 3400 },
      { categoryId: 9, categoryName: "যাতায়াত", budgetAmount: 1000, spent: 1800 },
    ])).toEqual([
      { categoryId: 9, categoryName: "যাতায়াত", budgetAmount: 1000, spent: 1800, exceededAmount: 800 },
      { categoryId: 8, categoryName: "বাজার", budgetAmount: 3000, spent: 3400, exceededAmount: 400 },
    ]);
  });

  it("shows one 80% or 90% early warning before a category exceeds its budget", () => {
    expect(calculateBudgetEarlyWarnings([
      { categoryId: 7, categoryName: "বেতন", budgetAmount: 1000, spent: 799 },
      { categoryId: 8, categoryName: "বাজার", budgetAmount: 1000, spent: 800 },
      { categoryId: 9, categoryName: "যাতায়াত", budgetAmount: 1000, spent: 900 },
      { categoryId: 10, categoryName: "অনুদান", budgetAmount: 1000, spent: 1000 },
      { categoryId: 11, categoryName: "ইউটিলিটি বিল", budgetAmount: 1000, spent: 1001 },
    ])).toEqual([
      { categoryId: 10, categoryName: "অনুদান", budgetAmount: 1000, spent: 1000, threshold: 90, remainingAmount: 0 },
      { categoryId: 9, categoryName: "যাতায়াত", budgetAmount: 1000, spent: 900, threshold: 90, remainingAmount: 100 },
      { categoryId: 8, categoryName: "বাজার", budgetAmount: 1000, spent: 800, threshold: 80, remainingAmount: 200 },
    ]);
  });

  it("recalculates a category's current-month alert after its budget is edited", () => {
    const currentMonthSpending = 5600;
    const existingBudget = { categoryId: 7, categoryName: "বেতন", budgetAmount: 5000, spent: currentMonthSpending };
    const editedBudget = { ...existingBudget, budgetAmount: 6000 };

    expect(calculateBudgetAlerts([existingBudget])).toMatchObject([
      { categoryId: 7, exceededAmount: 600 },
    ]);
    expect(calculateBudgetAlerts([editedBudget])).toEqual([]);
    expect(calculateBudgetEarlyWarnings([
      { ...existingBudget, spent: 4800 },
    ])).toMatchObject([{ categoryId: 7, threshold: 90 }]);
    expect(calculateBudgetEarlyWarnings([
      { ...editedBudget, spent: 4800 },
    ])).toMatchObject([{ categoryId: 7, threshold: 80, remainingAmount: 1200 }]);
  });

  it("saves an edited project budget and returns the recalculated alert state on overview refetch", async () => {
    let savedBudgetAmount = 5000;
    financeDb.upsertBudget.mockImplementation(async (_userId: number, input: { amount: number }) => {
      savedBudgetAmount = input.amount;
      return { id: 11, ...input };
    });
    financeDb.getOverview.mockImplementation(async (_userId: number, projectId: number) => ({
      projectId,
      budgetAlerts: calculateBudgetAlerts([
        { categoryId: 7, categoryName: "বেতন", budgetAmount: savedBudgetAmount, spent: 5600 },
      ]),
    }));
    const caller = appRouter.createCaller(authenticatedContext);
    const originalBudget = { projectId: 88, categoryId: 7, monthKey: "2026-08", amount: 5000 };
    const editedBudget = { ...originalBudget, amount: 6000 };

    await caller.finance.saveBudget(originalBudget);
    await expect(caller.finance.overview({ projectId: 88 })).resolves.toMatchObject({
      projectId: 88,
      budgetAlerts: [{ categoryId: 7, exceededAmount: 600 }],
    });
    await caller.finance.saveBudget(editedBudget);
    await expect(caller.finance.overview({ projectId: 88 })).resolves.toMatchObject({
      projectId: 88,
      budgetAlerts: [],
    });
    expect(financeDb.upsertBudget).toHaveBeenCalledWith(42, editedBudget);
    expect(financeDb.getOverview).toHaveBeenLastCalledWith(42, 88);
  });

  it("scopes overview data to the authenticated user and selected project", async () => {
    const overview = {
      totals: {},
      budgetAlerts: [{ categoryId: 7, categoryName: "বেতন", budgetAmount: 5000, spent: 5600, exceededAmount: 600 }],
      budgetEarlyWarnings: [{ categoryId: 8, categoryName: "বাজার", budgetAmount: 5000, spent: 4500, threshold: 90, remainingAmount: 500 }],
    };
    financeDb.getOverview.mockResolvedValue(overview);
    await expect(appRouter.createCaller(authenticatedContext).finance.overview({ projectId: 88 })).resolves.toEqual(overview);
    expect(financeDb.getOverview).toHaveBeenCalledWith(42, 88);
  });

  it("exports, previews, and restores a validated backup only through a new project", async () => {
    const backup = {
      formatVersion: "finance-project-backup-v1" as const,
      exportedAt: new Date("2026-08-22T00:00:00.000Z"),
      project: { id: 88, name: "মূল হিসাব" },
      accounts: [], categories: [], transactions: [], budgets: [], bills: [], dues: [], settlements: [], recurring: [], voucherSettings: null,
    };
    const preview = { sourceProjectName: "মূল হিসাব", exportedAt: backup.exportedAt, counts: { accounts: 0, categories: 0, transactions: 0, budgets: 0, bills: 0, dues: 0, settlements: 0, recurring: 0 }, transactionDateRange: null, restorePolicy: "new-project-only" };
    financeDb.exportProjectBackup.mockResolvedValue(backup);
    financeDb.previewProjectBackup.mockResolvedValue(preview);
    financeDb.restoreProjectBackup.mockResolvedValue({ projectId: 99, projectName: "পুনরুদ্ধারকৃত হিসাব" });
    const caller = appRouter.createCaller(authenticatedContext);

    await expect(caller.finance.exportProjectBackup({ projectId: 88 })).resolves.toEqual(backup);
    await expect(caller.finance.previewProjectBackup({ backup })).resolves.toEqual(preview);
    await expect(caller.finance.restoreProjectBackup({ projectName: "পুনরুদ্ধারকৃত হিসাব", confirmation: "RESTORE_NEW_PROJECT", backup })).resolves.toEqual({ projectId: 99, projectName: "পুনরুদ্ধারকৃত হিসাব" });
    await expect(caller.finance.restoreProjectBackup({ projectName: "পুনরুদ্ধারকৃত হিসাব", confirmation: "restore", backup } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(financeDb.exportProjectBackup).toHaveBeenCalledWith(42, 88);
    expect(financeDb.restoreProjectBackup).toHaveBeenCalledWith(42, { projectName: "পুনরুদ্ধারকৃত হিসাব", backup });
  });

  it("keeps automation, due dates, and recurring template actions scoped to the selected project", async () => {
    financeDb.getAutomationOverview.mockResolvedValue({ recurring: [], bills: [], ageing: [] });
    financeDb.createDue.mockResolvedValue(undefined);
    financeDb.createRecurringTemplate.mockResolvedValue(91);
    const caller = appRouter.createCaller(authenticatedContext);
    await expect(caller.finance.automationOverview({ projectId: 88 })).resolves.toEqual({ recurring: [], bills: [], ageing: [] });
    await caller.finance.addDue({ projectId: 88, type: "debt", counterparty: "সরবরাহকারী", amount: 1200, openedAt: new Date("2026-08-20T12:00:00Z"), dueAt: new Date("2026-09-01T12:00:00Z") });
    await caller.finance.addRecurringTemplate({ ...expenseInput, frequency: "monthly", scheduleDay: 15, nextRunAt: new Date("2026-09-15T12:00:00Z") });
    expect(financeDb.getAutomationOverview).toHaveBeenCalledWith(42, 88);
    expect(financeDb.createDue).toHaveBeenCalledWith(42, expect.objectContaining({ projectId: 88, dueAt: expect.any(Date) }));
    expect(financeDb.createRecurringTemplate).toHaveBeenCalledWith(42, expect.objectContaining({ projectId: 88, frequency: "monthly", scheduleDay: 15 }));
  });

  it("returns planning and analytics only for the authenticated user's selected project", async () => {
    const plan = { targetMonthKey: "2026-09", previousMonthKey: "2026-08", plans: [{ categoryId: 7, suggestedAmount: 5000 }] };
    const analytics = { data: [{ monthKey: "2026-08", income: 9000, expense: 3000, savings: 6000, budgeted: 5000, budgetUsagePercentage: 60 }] };
    financeDb.getBudgetPlan.mockResolvedValue(plan);
    financeDb.getFinanceAnalytics.mockResolvedValue(analytics);
    const caller = appRouter.createCaller(authenticatedContext);

    await expect(caller.finance.budgetPlan({ projectId: 88, monthKey: "2026-09" })).resolves.toEqual(plan);
    await expect(caller.finance.analytics({ projectId: 88, months: 6 })).resolves.toEqual(analytics);
    expect(financeDb.getBudgetPlan).toHaveBeenCalledWith(42, 88, "2026-09");
    expect(financeDb.getFinanceAnalytics).toHaveBeenCalledWith(42, 88, 6);
  });

  it("passes validated transaction search filters through the authenticated user and project boundary", async () => {
    const results = [{ id: 91, categoryName: "বাজার", amount: 1200 }];
    financeDb.searchTransactions.mockResolvedValue(results);
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-31T23:59:59.999Z");
    const input = { projectId: 88, query: "বাজার", categoryId: 7, type: "expense" as const, from, to, minAmount: 100, maxAmount: 2000, limit: 50 };

    await expect(appRouter.createCaller(authenticatedContext).finance.searchTransactions(input)).resolves.toEqual(results);
    expect(financeDb.searchTransactions).toHaveBeenCalledWith(42, input);
    await expect(appRouter.createCaller(authenticatedContext).finance.searchTransactions({ ...input, from: to, to: from })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("scopes a monthly financial report to the authenticated user, project, and validated month", async () => {
    const report = { projectName: "দৈনিক লেনদেনের খাতা", monthKey: "2026-08", totalIncome: 12000, totalExpense: 3500, netAmount: 8500, categoryTotals: [], totalDebt: 0, totalReceivable: 0, transactionCount: 2, previousMonthKey: "2026-07", previousExpenseCategoryTotals: [{ name: "বেতন", total: 3000 }], profitAndLoss: { income: 12000, expense: 3500, profitOrLoss: 8500 }, financialPosition: { accountBalance: 6000, receivables: 0, assets: 6000, debts: 0, netFinancialPosition: 6000 }, accountDetails: [{ name: "নগদ", type: "cash", currentBalance: 6000 }], dueDetails: [], transactionDetails: [{ occurredAt: new Date("2026-08-19T00:00:00.000Z"), voucherNo: "V-12", type: "expense", categoryName: "বেতন", description: "মাসিক বেতন", amount: 3500 }] };
    financeDb.getMonthlyReport.mockResolvedValue(report);

    await expect(appRouter.createCaller(authenticatedContext).finance.monthlyReport({ projectId: 88, monthKey: "2026-08" })).resolves.toEqual(report);
    expect(financeDb.getMonthlyReport).toHaveBeenCalledWith(42, 88, "2026-08");
    expect(report.financialPosition.netFinancialPosition).toBe(6000);
    expect(report.previousExpenseCategoryTotals).toEqual([{ name: "বেতন", total: 3000 }]);
    await expect(appRouter.createCaller(authenticatedContext).finance.monthlyReport({ projectId: 88, monthKey: "2026-13" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("exports only the authenticated user's finance data", async () => {
    financeDb.exportUserData.mockResolvedValue({ projects: [], transactions: [] });
    await appRouter.createCaller(authenticatedContext).finance.exportData();
    expect(financeDb.exportUserData).toHaveBeenCalledWith(42);
  });

  it("scopes a new transaction and an edit to the authenticated user and project", async () => {
    const caller = appRouter.createCaller(authenticatedContext);
    await caller.finance.addTransaction(expenseInput);
    await caller.finance.updateTransaction({ id: 501, ...expenseInput, amount: 1650 });
    expect(financeDb.createTransaction).toHaveBeenCalledWith(42, expenseInput);
    expect(financeDb.updateTransaction).toHaveBeenCalledWith(42, 501, { ...expenseInput, amount: 1650 });
  });

  it("uses the description-only transaction contract while voucher numbering remains server-side", async () => {
    await appRouter.createCaller(authenticatedContext).finance.addTransaction(expenseInput);

    expect(financeDb.createTransaction).toHaveBeenCalledWith(42, expenseInput);
  });

  it("gets and saves voucher settings only within the authenticated user's project", async () => {
    const settings = { id: 1, projectId: 88, prefix: "V", startNumber: 1, endNumber: 999999, nextNumber: 23 };
    financeDb.getVoucherSettings.mockResolvedValue(settings);
    financeDb.updateVoucherSettings.mockResolvedValue({ ...settings, prefix: "EXP", startNumber: 10, endNumber: 999 });
    const caller = appRouter.createCaller(authenticatedContext);
    const input = { projectId: 88, prefix: "EXP", startNumber: 10, endNumber: 999 };

    await expect(caller.finance.voucherSettings({ projectId: 88 })).resolves.toEqual(settings);
    await expect(caller.finance.saveVoucherSettings(input)).resolves.toMatchObject({ prefix: "EXP", startNumber: 10, endNumber: 999 });
    expect(financeDb.getVoucherSettings).toHaveBeenCalledWith(42, 88);
    expect(financeDb.updateVoucherSettings).toHaveBeenCalledWith(42, input);
  });

  it("keeps debt settlement and receivable collection as separate scoped operations", async () => {
    const caller = appRouter.createCaller(authenticatedContext);
    const dueInput = { projectId: 88, type: "debt" as const, counterparty: "রহিম", amount: 5000, note: "মাসিক বকেয়া", openedAt: new Date("2026-08-19T00:00:00.000Z") };
    const settlementInput = { projectId: 88, dueId: 31, accountId: 3, amount: 1200, note: "আংশিক পরিশোধ", occurredAt: new Date("2026-08-20T00:00:00.000Z") };

    await caller.finance.addDue(dueInput);
    await caller.finance.settleDue(settlementInput);

    expect(financeDb.createDue).toHaveBeenCalledWith(42, dueInput);
    expect(financeDb.settleDue).toHaveBeenCalledWith(42, settlementInput);
    expect(financeDb.createTransaction).not.toHaveBeenCalled();
  });

  it("passes both user and project ownership boundaries to delete and bill actions", async () => {
    const caller = appRouter.createCaller(authenticatedContext);
    await caller.finance.deleteTransaction({ projectId: 88, id: 501 });
    await caller.finance.setBillPaid({ projectId: 88, id: 9, isPaid: true });
    await caller.finance.deleteBill({ projectId: 88, id: 9 });
    expect(financeDb.deleteTransaction).toHaveBeenCalledWith(42, 88, 501);
    expect(financeDb.setBillPaid).toHaveBeenCalledWith(42, 88, 9, true);
    expect(financeDb.deleteBill).toHaveBeenCalledWith(42, 88, 9);
  });

  it("creates a new isolated project for the authenticated user", async () => {
    financeDb.createProject.mockResolvedValue({ id: 99, name: "নতুন প্রকল্প" });
    await appRouter.createCaller(authenticatedContext).projects.create({ name: "নতুন প্রকল্প" });
    expect(financeDb.createProject).toHaveBeenCalledWith(42, "নতুন প্রকল্প");
  });

  it("scopes account edits and deletions to the authenticated user and project", async () => {
    const caller = appRouter.createCaller(authenticatedContext);
    await caller.finance.updateAccount({ id: 16, projectId: 88, name: "Cash", type: "cash", openingBalance: 4000 });
    await caller.finance.deleteAccount({ projectId: 88, id: 16 });
    expect(financeDb.updateAccount).toHaveBeenCalledWith(42, 16, { projectId: 88, name: "Cash", type: "cash", openingBalance: 4000 });
    expect(financeDb.deleteAccount).toHaveBeenCalledWith(42, 88, 16);
  });

  it("rejects unauthenticated finance requests", async () => {
    await expect(appRouter.createCaller({ ...authenticatedContext, user: null }).finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not permit a standard user to inspect administrator audit logs", async () => {
    await expect(appRouter.createCaller(authenticatedContext).admin.auditLogs({ password: "any-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(authenticatedContext).admin.auditLogExport({ password: "any-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(financeDb.listAuditLogsPage).not.toHaveBeenCalled();
    expect(financeDb.listAuditLogsForExport).not.toHaveBeenCalled();
  });

  it("permits a verified administrator to inspect the audit log", async () => {
    financeDb.listAuditLogsPage.mockResolvedValue({ logs: [{ id: 1, summary: "Transaction created" }], page: 1, pageSize: 25, total: 1, totalPages: 1 });
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.verifyAccess({ password: ENV.adminAccessPassword })).resolves.toEqual({ verified: true });
    await expect(caller.admin.auditLogs({ password: ENV.adminAccessPassword })).resolves.toMatchObject({ logs: [{ id: 1, summary: "Transaction created" }], page: 1, pageSize: 25 });
    expect(financeDb.listAuditLogsPage).toHaveBeenCalledWith({ from: undefined, to: undefined, actorUserId: undefined, actorRole: undefined, search: undefined, page: 1, pageSize: 25 });
  });

  it("passes validated date-range, actor, and keyword filters to the audit-log query", async () => {
    financeDb.listAuditLogsPage.mockResolvedValue({ logs: [], page: 2, pageSize: 25, total: 26, totalPages: 2 });
    const caller = appRouter.createCaller(administratorContext);
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-19T23:59:59.999Z");

    await caller.admin.auditLogs({ password: ENV.adminAccessPassword, from, to, actorUserId: 17, actorRole: "user", search: "delete", page: 2 });

    expect(financeDb.listAuditLogsPage).toHaveBeenCalledWith({ from, to, actorUserId: 17, actorRole: "user", search: "delete", page: 2, pageSize: 25 });
  });

  it("permits a verified administrator to retrieve only the selected audit-log export set", async () => {
    financeDb.listAuditLogsForExport.mockResolvedValue([{ id: 2, summary: "Transaction deleted" }]);
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.auditLogExport({ password: ENV.adminAccessPassword, actorUserId: 17, actorRole: "user", search: "deleted" })).resolves.toEqual([{ id: 2, summary: "Transaction deleted" }]);
    expect(financeDb.listAuditLogsForExport).toHaveBeenCalledWith({ from: undefined, to: undefined, actorUserId: 17, actorRole: "user", search: "deleted" });
  });

  it("returns filtered audit activity analytics only after administrator verification", async () => {
    financeDb.getAuditLogActivity.mockResolvedValue([{ action: "update", count: 8 }]);
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.auditActivity({ password: ENV.adminAccessPassword, actorRole: "admin" })).resolves.toEqual([{ action: "update", count: 8 }]);
    expect(financeDb.getAuditLogActivity).toHaveBeenCalledWith({ from: undefined, to: undefined, actorUserId: undefined, actorRole: "admin", search: undefined });
    await expect(appRouter.createCaller(authenticatedContext).admin.auditActivity({ password: "any-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permits a verified administrator to inspect all registered project workspaces", async () => {
    financeDb.listProjectsForAdmin.mockResolvedValue([{ id: 88, name: "দৈনিক লেনদেনের খাতা" }]);
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.projects({ password: ENV.adminAccessPassword })).resolves.toEqual([{ id: 88, name: "দৈনিক লেনদেনের খাতা" }]);
    expect(financeDb.listProjectsForAdmin).toHaveBeenCalledTimes(1);
  });
});
