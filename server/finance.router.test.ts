import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES, calculateBudgetProgress } from "./finance.constants";
import { ENV } from "./_core/env";

const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getOverview: vi.fn(), exportUserData: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(),
    createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(),
    upsertBudget: vi.fn(), createBill: vi.fn(), updateBill: vi.fn(), setBillPaid: vi.fn(), deleteBill: vi.fn(),
    listUsersForAdmin: vi.fn(), listProjectsForAdmin: vi.fn(), listAuditLogs: vi.fn(), listAuditLogsPage: vi.fn(), listAuditLogsForExport: vi.fn(),
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

  it("scopes overview data to the authenticated user and selected project", async () => {
    financeDb.getOverview.mockResolvedValue({ totals: {} });
    await appRouter.createCaller(authenticatedContext).finance.overview({ projectId: 88 });
    expect(financeDb.getOverview).toHaveBeenCalledWith(42, 88);
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
    expect(financeDb.listAuditLogsPage).toHaveBeenCalledWith({ from: undefined, to: undefined, actorUserId: undefined, page: 1, pageSize: 25 });
  });

  it("passes validated date-range and actor filters to the audit-log query", async () => {
    financeDb.listAuditLogsPage.mockResolvedValue({ logs: [], page: 2, pageSize: 25, total: 26, totalPages: 2 });
    const caller = appRouter.createCaller(administratorContext);
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-19T23:59:59.999Z");

    await caller.admin.auditLogs({ password: ENV.adminAccessPassword, from, to, actorUserId: 17, page: 2 });

    expect(financeDb.listAuditLogsPage).toHaveBeenCalledWith({ from, to, actorUserId: 17, page: 2, pageSize: 25 });
  });

  it("permits a verified administrator to retrieve only the selected audit-log export set", async () => {
    financeDb.listAuditLogsForExport.mockResolvedValue([{ id: 2, summary: "Transaction deleted" }]);
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.auditLogExport({ password: ENV.adminAccessPassword, actorUserId: 17 })).resolves.toEqual([{ id: 2, summary: "Transaction deleted" }]);
    expect(financeDb.listAuditLogsForExport).toHaveBeenCalledWith({ from: undefined, to: undefined, actorUserId: 17 });
  });

  it("permits a verified administrator to inspect all registered project workspaces", async () => {
    financeDb.listProjectsForAdmin.mockResolvedValue([{ id: 88, name: "Face Two Button" }]);
    const caller = appRouter.createCaller(administratorContext);

    await expect(caller.admin.projects({ password: ENV.adminAccessPassword })).resolves.toEqual([{ id: 88, name: "Face Two Button" }]);
    expect(financeDb.listProjectsForAdmin).toHaveBeenCalledTimes(1);
  });
});
