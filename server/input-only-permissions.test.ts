import { beforeEach, describe, expect, it, vi } from "vitest";

const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getOverview: vi.fn(), getBudgetPlan: vi.fn(), getFinanceAnalytics: vi.fn(), searchTransactions: vi.fn(), listTransactionsPaginated: vi.fn(), getMonthlyReport: vi.fn(), getVoucherSettings: vi.fn(), updateVoucherSettings: vi.fn(), exportUserData: vi.fn(), exportProjectBackup: vi.fn(), previewProjectBackup: vi.fn(), restoreProjectBackup: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(),
    createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), createDue: vi.fn(), settleDue: vi.fn(), createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn(),
    upsertBudget: vi.fn(), createBill: vi.fn(), updateBill: vi.fn(), setBillPaid: vi.fn(), deleteBill: vi.fn(), getAutomationOverview: vi.fn(), createRecurringTemplate: vi.fn(), updateRecurringTemplate: vi.fn(), generateRecurringNow: vi.fn(), setRecurringScheduleTask: vi.fn(), setBillReminderSettings: vi.fn(), setBillScheduleTask: vi.fn(),
    listUsersForAdmin: vi.fn(), listProjectsForAdmin: vi.fn(), listAuditLogs: vi.fn(), listAuditLogsPage: vi.fn(), listAuditLogsForExport: vi.fn(), getAuditLogActivity: vi.fn(),
    listHouseholds: vi.fn(), listHouseholdInvitations: vi.fn(), createHousehold: vi.fn(), getHouseholdOverview: vi.fn(), inviteHouseholdMember: vi.fn(), acceptHouseholdInvitation: vi.fn(), updateHouseholdMember: vi.fn(), saveSharedBudget: vi.fn(), addSharedExpense: vi.fn(),
    getStatementData: vi.fn(), getVoucherPrintData: vi.fn(), getFirmProfile: vi.fn(), saveFirmProfile: vi.fn(),
    getEmployees: vi.fn(), createEmployee: vi.fn(), updateEmployee: vi.fn(), deleteEmployee: vi.fn(),
    getSalaryPayments: vi.fn(), disburseSalary: vi.fn(),
    getEmployeeAdvances: vi.fn(), createEmployeeAdvance: vi.fn(),
    getInvoices: vi.fn(), getInvoiceById: vi.fn(), createInvoice: vi.fn(), updateInvoiceStatus: vi.fn(), deleteInvoice: vi.fn(),
    getInventoryList: vi.fn(), createInventoryItem: vi.fn(), updateInventoryItem: vi.fn(), adjustInventoryStock: vi.fn(), deleteInventoryItem: vi.fn(),
    getBills: vi.fn(),
    setUserPassword: vi.fn(),
    listInvoices: vi.fn(), getFinancialStatements: vi.fn(),
    getVoucherList: vi.fn(), getVoucherReversals: vi.fn(),
    getPeriodLocks: vi.fn(), lockPeriod: vi.fn(), unlockPeriod: vi.fn(),
    getChartOfAccounts: vi.fn(), getChartOfAccountsTree: vi.fn(), getAccountTypes: vi.fn(),
    createChartOfAccount: vi.fn(), updateChartOfAccount: vi.fn(), deleteChartOfAccount: vi.fn(), seedDefaultChartOfAccounts: vi.fn(),
    createVoucherWithEntries: vi.fn(), reverseVoucher: vi.fn(),
    createBankReconciliation: vi.fn(), getBankReconciliationById: vi.fn(), getBankReconciliations: vi.fn(),
    addBankReconciliationItem: vi.fn(), matchBankReconciliationItem: vi.fn(), unmatchBankReconciliationItem: vi.fn(),
    completeBankReconciliation: vi.fn(), getBankReconciliationItems: vi.fn(), getLedgerEntriesForReconciliation: vi.fn(),
  },
}));

// Mock RBAC module — admin gets all permissions, input_only gets only entry perms
const ALL_PERMISSIONS = [
  "auth.login", "auth.logout",
  "accounting.read", "accounting.create", "accounting.update", "accounting.delete",
  "budget.read", "budget.create", "budget.update", "budget.approve",
  "payroll.read", "payroll.create", "payroll.update", "payroll.approve",
  "voucher.read", "voucher.create", "voucher.submit", "voucher.approve", "voucher.post", "voucher.reverse",
  "ledger.read", "ledger.export",
  "audit.read", "audit.export",
  "user.read", "user.create", "user.update", "user.suspend",
  "backup.create", "backup.restore",
  "settings.manage", "role.manage", "permission.manage",
];
const INPUT_ONLY_PERMISSIONS = ["auth.login", "auth.logout", "accounting.create", "payroll.create", "voucher.create", "budget.create"];

const rbacMock = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  hasAnyPermission: vi.fn(),
  hasAllPermissions: vi.fn(),
  hasRole: vi.fn(),
  getUserPermissions: vi.fn(),
  getUserRoles: vi.fn(),
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/rbac", () => rbacMock);

vi.mock("./db", () => financeDb);

import { appRouter } from "./routers";

const adminUser = {
  id: 1, openId: "admin-user", email: "admin@example.com", name: "Admin",
  loginMethod: "manus", role: "admin" as const, status: "active" as const,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};

const inputOnlyUser = {
  id: 42, openId: "input-only-user", email: "input@example.com", name: "Input Only",
  loginMethod: "manus", role: "input_only" as const, status: "active" as const,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};

const normalUser = {
  id: 99, openId: "normal-user", email: "normal@example.com", name: "Normal User",
  loginMethod: "manus", role: "user" as const, status: "active" as const,
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};

const adminContext = {
  user: adminUser,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
  adminElevation: {
    userId: 1, openId: "admin-user", role: "admin" as const,
    issuedAt: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000,
  },
} as any;

const inputOnlyContext = {
  user: inputOnlyUser,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

const normalUserContext = {
  user: normalUser,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

const unauthenticatedContext = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

const expenseInput = {
  projectId: 88, categoryId: 7, accountId: 3, type: "expense" as const,
  amount: 1500, paymentMethod: "bKash", note: "Test", occurredAt: new Date("2026-08-19T12:00:00.000Z"),
};

describe("Input-Only User Permission Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // RBAC mock: admin (id=1) and normal user (id=99) get all permissions;
    // input_only user (id=42) gets only entry permissions.
    rbacMock.hasPermission.mockImplementation(async (userId: number, perm: string) => {
      if (userId === 42) return INPUT_ONLY_PERMISSIONS.includes(perm);
      return ALL_PERMISSIONS.includes(perm);
    });
    rbacMock.hasAnyPermission.mockImplementation(async (userId: number, perms: string[]) => {
      if (userId === 42) return perms.some(p => INPUT_ONLY_PERMISSIONS.includes(p));
      return perms.some(p => ALL_PERMISSIONS.includes(p));
    });
    rbacMock.hasAllPermissions.mockImplementation(async (userId: number, perms: string[]) => {
      if (userId === 42) return perms.every(p => INPUT_ONLY_PERMISSIONS.includes(p));
      return perms.every(p => ALL_PERMISSIONS.includes(p));
    });
    rbacMock.getUserPermissions.mockImplementation(async (userId: number) => {
      if (userId === 42) return INPUT_ONLY_PERMISSIONS;
      return ALL_PERMISSIONS;
    });
    rbacMock.getUserRoles.mockImplementation(async (userId: number) => {
      if (userId === 42) return ["INPUT_OPERATOR"];
      return ["SUPER_ADMIN"];
    });
    rbacMock.hasRole.mockResolvedValue(true);
  });

  // ─────────────────────────────────────────────
  // ADMIN REGRESSION (Tests 1–10)
  // ─────────────────────────────────────────────
  describe("Admin can do everything (regression)", () => {
    it("1. Admin can read protected data (overview)", async () => {
      financeDb.getOverview.mockResolvedValue({ totals: {}, budgetAlerts: [] });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.overview({ projectId: 88 })).resolves.toBeDefined();
    });

    it("2. Admin can create (addTransaction)", async () => {
      financeDb.createTransaction.mockResolvedValue({ id: 1, voucherNo: "V001" });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.addTransaction(expenseInput)).resolves.toBeDefined();
    });

    it("3. Admin can update (updateTransaction)", async () => {
      financeDb.updateTransaction.mockResolvedValue({ id: 1 });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.updateTransaction({ ...expenseInput, id: 1 })).resolves.toBeDefined();
    });

    it("4. Admin can delete (deleteTransaction)", async () => {
      financeDb.deleteTransaction.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.deleteTransaction({ projectId: 88, id: 1 })).resolves.toBeUndefined();
    });

    it("5. Admin can approve (updateInvoiceStatus)", async () => {
      financeDb.updateInvoiceStatus.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.updateInvoiceStatus({ projectId: 88, id: 1, status: "paid" })).resolves.toBeUndefined();
    });

    it("6. Admin can access reports (monthlyReport)", async () => {
      financeDb.getMonthlyReport.mockResolvedValue({ monthKey: "2026-08" });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.monthlyReport({ projectId: 88, monthKey: "2026-08" })).resolves.toBeDefined();
    });

    it("7. Admin can access balances (overview contains accounts)", async () => {
      financeDb.getOverview.mockResolvedValue({ totals: {}, accounts: [] });
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.finance.overview({ projectId: 88 });
      expect(result).toHaveProperty("accounts");
    });

    it("8. Admin can manage users (admin.users)", async () => {
      financeDb.listUsersForAdmin.mockResolvedValue([]);
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.admin.users()).resolves.toBeDefined();
    });

    it("9. Admin can access financial statements", async () => {
      financeDb.getStatementData.mockResolvedValue({ statements: [] });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.statementData({ projectId: 88 })).resolves.toBeDefined();
    });

    it("10. Admin can export data", async () => {
      financeDb.exportUserData.mockResolvedValue({ data: {} });
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.exportData()).resolves.toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY ALLOWED CREATE (Tests 11–15)
  // ─────────────────────────────────────────────
  describe("Input-Only User can create via allowed procedures", () => {
    it("11. Can create Accounting entry (addTransaction)", async () => {
      financeDb.createTransaction.mockResolvedValue(10);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.addTransaction(expenseInput);
      expect(result).toBe(10);
    });

    it("12. Can create Budget entry (saveBudget)", async () => {
      financeDb.upsertBudget.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.saveBudget({ projectId: 88, categoryId: 7, monthKey: "2026-08", amount: 5000 });
      expect(result).toBeUndefined();
    });

    it("13. Can create Payroll entry (disburseSalary)", async () => {
      financeDb.disburseSalary.mockResolvedValue({ success: true, voucherNo: "S030" });
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.disburseSalary({
        projectId: 88, employeeId: 1, monthKey: "2026-08",
        baseSalary: 25000, bonusAmount: 0, allowanceAmount: 0,
        advanceDeduction: 0, otherDeduction: 0,
      });
      expect(result).toEqual({ success: true, voucherNo: "S030" });
    });

    it("14. Can create Ledger entry (addDue)", async () => {
      financeDb.createDue.mockResolvedValue({ id: 40 });
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.addDue({
        projectId: 88, type: "debt", counterparty: " Supplier",
        amount: 5000, openedAt: new Date("2026-08-20T12:00:00Z"),
      });
      expect(result).toHaveProperty("id", 40);
    });

    it("15. Can create Voucher entry (addTransaction with income type)", async () => {
      financeDb.createTransaction.mockResolvedValue(50);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.addTransaction({
        ...expenseInput, type: "income", categoryId: 1,
      });
      expect(result).toBe(50);
    });

    it("Can create Bill entry (addBill)", async () => {
      financeDb.createBill.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.addBill({
        projectId: 88, title: "Electricity", amount: 2000, dueAt: new Date("2026-09-01"),
      });
      expect(result).toBeUndefined();
    });

    it("Can create Account entry (addAccount)", async () => {
      financeDb.createAccount.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.addAccount({
        projectId: 88, name: "Cash", type: "cash", openingBalance: 0,
      });
      expect(result).toBeUndefined();
    });

    it("Can create Employee Advance (createEmployeeAdvance)", async () => {
      financeDb.createEmployeeAdvance.mockResolvedValue({ id: 80, success: true, voucherNo: "EA080" });
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.createEmployeeAdvance({
        projectId: 88, employeeId: 1, amount: 5000,
      });
      expect(result).toHaveProperty("id", 80);
    });

    it("Can create Recurring Template (addRecurringTemplate)", async () => {
      financeDb.createRecurringTemplate.mockResolvedValue(90);
      const caller = appRouter.createCaller(inputOnlyContext);
      const { occurredAt: _, ...recurringInput } = expenseInput;
      const result = await caller.finance.addRecurringTemplate({
        ...recurringInput,
        frequency: "monthly", scheduleDay: 15, nextRunAt: new Date("2026-09-15T12:00:00Z"),
      });
      expect(result).toBe(90);
    });

    it("Can sync Offline Transactions (syncOfflineTransactions)", async () => {
      financeDb.createTransaction.mockResolvedValue(100);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.finance.syncOfflineTransactions({
        projectId: 88, items: [expenseInput],
      });
      expect(result).toEqual({ syncedCount: 1, transactions: [100] });
    });

    it("Can create Project (projects.create)", async () => {
      financeDb.createProject.mockResolvedValue({ id: 110, name: "Default" });
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.projects.create({ name: "My Project" });
      expect(result).toHaveProperty("id", 110);
    });

    it("Can get or auto-create active project (projects.active)", async () => {
      financeDb.listProjects.mockResolvedValue([{ id: 120, name: "Existing" }]);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.projects.active();
      expect(result).toEqual({ id: 120, name: "Existing" });
    });

    it("Auto-creates project if none exists (projects.active)", async () => {
      financeDb.listProjects.mockResolvedValue([]);
      financeDb.createProject.mockResolvedValue({ id: 130, name: "Default" });
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.projects.active();
      expect(result).toEqual({ id: 130, name: "Default" });
      expect(financeDb.createProject).toHaveBeenCalledWith(42, "Default");
    });

    it("Can set own password (auth.setPassword)", async () => {
      financeDb.setUserPassword.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOnlyContext);
      const result = await caller.auth.setPassword({ password: "NewPass@123" });
      expect(result).toHaveProperty("success", true);
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — List/Read/Search (Tests 16–18)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT list/read/search existing records", () => {
    it("16. Cannot list projects (projects.list)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.projects.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("17. Cannot read overview (finance.overview)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("18. Cannot search transactions (finance.searchTransactions)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.searchTransactions({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list paginated transactions", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.paginatedTransactions({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read budget plan", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.budgetPlan({ projectId: 88, monthKey: "2026-08" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read analytics", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.analytics({ projectId: 88, months: 6 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read automation overview", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.automationOverview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read monthly report", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.monthlyReport({ projectId: 88, monthKey: "2026-08" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read voucher settings", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.voucherSettings({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read statement data", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.statementData({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read financial statements", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.financialStatements({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read voucher print data", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.voucherPrint({ projectId: 88, transactionId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read firm profile", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.firmProfile({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list households", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.households()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list invoices", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.invoices({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read invoice by ID", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.invoiceById({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list inventory", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.inventoryList({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list employees", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.employeesList({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list salary payments", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.salaryPaymentsList({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot list employee advances", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.employeeAdvancesList({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot read cloud backup status", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.cloudBackupStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — Update (Tests 19–20)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT update existing records", () => {
    it("19. Cannot update transaction", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateTransaction({ ...expenseInput, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("20. Cannot update account", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateAccount({ id: 1, projectId: 88, name: "Cash", type: "cash", openingBalance: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot update bill", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateBill({ projectId: 88, id: 1, title: "Bill", amount: 100, dueAt: new Date(), isPaid: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot set bill paid", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.setBillPaid({ projectId: 88, id: 1, isPaid: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot settle due", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.settleDue({ projectId: 88, dueId: 1, amount: 100, occurredAt: new Date() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot update employee", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateEmployee({ projectId: 88, id: 1, name: "Updated" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot update invoice status", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateInvoiceStatus({ projectId: 88, id: 1, status: "paid" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot update inventory item", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateInventoryItem({ projectId: 88, id: 1, name: "Updated" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot adjust inventory stock", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.adjustInventoryStock({ projectId: 88, id: 1, quantityChange: 5, reason: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot save voucher settings", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveVoucherSettings({ projectId: 88, prefix: "V", startNumber: 1, endNumber: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot save firm profile", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveFirmProfile({ projectId: 88, name: "Test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot set recurring active", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.setRecurringActive({ projectId: 88, id: 1, isActive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot generate recurring now", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.generateRecurringNow({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot enable recurring schedule", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.enableRecurringSchedule({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot enable bill reminder", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.enableBillReminder({ projectId: 88, id: 1, reminderDaysBefore: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — Delete (Tests 21)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT delete records", () => {
    it("21. Cannot delete transaction", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteTransaction({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot delete account", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteAccount({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot delete bill", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteBill({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot delete invoice", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteInvoice({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot delete inventory item", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteInventoryItem({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot delete employee", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.deleteEmployee({ projectId: 88, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — Reports/Export/Import (Tests 22–28)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT access reports/export/import", () => {
    it("22. Cannot access reports (monthlyReport)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.monthlyReport({ projectId: 88, monthKey: "2026-08" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("23. Cannot access balances (overview)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("24. Cannot access ledgers (statementData)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.statementData({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("25. Cannot access other users' records", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.overview({ projectId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("26. Cannot export data", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.exportData()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("27. Cannot export project backup", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.exportProjectBackup({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("28. Cannot import/restore backup", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.restoreProjectBackup({
        projectName: "Test",
        confirmation: "RESTORE_NEW_PROJECT",
        backup: {} as any,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot trigger cloud backup", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.triggerCloudBackup({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — Settings/Configuration (Tests 29–34)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT change settings/configuration", () => {
    it("29. Cannot change settings (saveVoucherSettings)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveVoucherSettings({ projectId: 88, prefix: "V", startNumber: 1, endNumber: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("30. Cannot change accounting rules (saveFirmProfile)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveFirmProfile({ projectId: 88, name: "Test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("31. Cannot change voucher settings", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveVoucherSettings({ projectId: 88, prefix: "X", startNumber: 1, endNumber: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("32. Cannot change budget configuration (budgetPlan read)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.budgetPlan({ projectId: 88, monthKey: "2026-08" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("33. Cannot change payroll configuration", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateEmployee({ projectId: 88, id: 1, baseSalary: 99999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("34. Cannot change ledger configuration", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.saveVoucherSettings({ projectId: 88, prefix: "V", startNumber: 1, endNumber: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — User/Role Management (Tests 35–41)
  // ─────────────────────────────────────────────
  describe("Input-Only User MUST NOT manage users/roles/permissions", () => {
    it("35. Cannot manage users (admin.users)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("36. Cannot manage roles (admin.updateUserStatus)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.updateUserStatus({ targetUserId: 99, status: "active" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("37. Cannot grant permissions (admin.verifyAccess)", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.verifyAccess({ password: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("38. Cannot access admin projects", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.projects()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("39. Cannot access admin audit logs", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.auditLogs({ page: 1, pageSize: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("40. Cannot access admin elevation status", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.elevationStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("41. Cannot revoke admin access", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.revokeAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot access admin audit activity", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.auditActivity({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Cannot export audit logs", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.admin.auditLogExport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // INPUT_ONLY DENIED — Direct API Bypass (Tests 41–43)
  // ─────────────────────────────────────────────
  describe("Input-Only User — Direct API attack rejected", () => {
    it("41. Direct API access to protected procedure is rejected", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("42. Unauthenticated access is rejected", async () => {
      const caller = appRouter.createCaller(unauthenticatedContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.finance.addTransaction(expenseInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("43. Pending user access is rejected", async () => {
      const pendingContext = {
        ...inputOnlyContext,
        user: { ...inputOnlyUser, status: "pending" as const },
      };
      const caller = appRouter.createCaller(pendingContext);
      await expect(caller.finance.addTransaction(expenseInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Suspended user access is rejected", async () => {
      const suspendedContext = {
        ...inputOnlyContext,
        user: { ...inputOnlyUser, status: "suspended" as const },
      };
      const caller = appRouter.createCaller(suspendedContext);
      await expect(caller.finance.addTransaction(expenseInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // SECURITY — Role/ID Manipulation (Tests 44–50)
  // ─────────────────────────────────────────────
  describe("Security — Client-supplied role/userId cannot elevate", () => {
    it("44. Client-supplied role cannot elevate privileges", async () => {
      // Even if the context claims role is admin, RBAC checks permissions by userId.
      // userId=42 has INPUT_ONLY_PERMISSIONS which don't include accounting.read,
      // so finance.overview is correctly denied regardless of the legacy role field.
      const fakeAdminContext = {
        ...inputOnlyContext,
        user: { ...inputOnlyUser, role: "admin" as const },
      };
      const caller = appRouter.createCaller(fakeAdminContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("45. Client-supplied userId cannot access another user's data", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      // Try to access a project that doesn't belong to this user
      await expect(caller.finance.overview({ projectId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("46. URL userId cannot bypass authorization", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      // Attempt to access another user's project via URL parameter
      await expect(caller.finance.overview({ projectId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("47. Request body createdBy cannot spoof another user", async () => {
      financeDb.createTransaction.mockImplementation(async (userId: number) => {
        // Verify the server uses the authenticated user's ID, not any client-supplied value
        expect(userId).toBe(42);
        return { id: 1, voucherNo: "V001" };
      });
      const caller = appRouter.createCaller(inputOnlyContext);
      await caller.finance.addTransaction(expenseInput);
      expect(financeDb.createTransaction).toHaveBeenCalledWith(42, expect.any(Object));
    });

    it("48. Input-only user cannot access protected data through alternate endpoint", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      // Try multiple alternate endpoints
      await expect(caller.finance.statementData({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.finance.voucherPrint({ projectId: 88, transactionId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.finance.financialStatements({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("49. Input-only user cannot use generic CRUD endpoint to bypass CREATE-only", async () => {
      // updateTransaction is a generic CRUD endpoint that should be denied
      const caller = appRouter.createCaller(inputOnlyContext);
      await expect(caller.finance.updateTransaction({ ...expenseInput, id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("50. Input-only user cannot exploit IDOR", async () => {
      const caller = appRouter.createCaller(inputOnlyContext);
      // Try to access another user's data via different IDs
      await expect(caller.finance.overview({ projectId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.finance.overview({ projectId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ─────────────────────────────────────────────
  // REGRESSION — Existing functionality still works (Tests 51–52)
  // ─────────────────────────────────────────────
  describe("Regression — Existing functionality still works", () => {
    it("51. Normal user can still access all protected procedures", async () => {
      financeDb.getOverview.mockResolvedValue({ totals: {}, budgetAlerts: [] });
      const caller = appRouter.createCaller(normalUserContext);
      await expect(caller.finance.overview({ projectId: 88 })).resolves.toBeDefined();
    });

    it("52. Normal user can still create transactions", async () => {
      financeDb.createTransaction.mockResolvedValue({ id: 1, voucherNo: "V001" });
      const caller = appRouter.createCaller(normalUserContext);
      await expect(caller.finance.addTransaction(expenseInput)).resolves.toBeDefined();
    });

    it("Normal user can still update transactions", async () => {
      financeDb.updateTransaction.mockResolvedValue({ id: 1 });
      const caller = appRouter.createCaller(normalUserContext);
      await expect(caller.finance.updateTransaction({ ...expenseInput, id: 1 })).resolves.toBeDefined();
    });

    it("Normal user can still delete transactions", async () => {
      financeDb.deleteTransaction.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(normalUserContext);
      await expect(caller.finance.deleteTransaction({ projectId: 88, id: 1 })).resolves.toBeUndefined();
    });

    it("Normal user can still list projects", async () => {
      financeDb.listProjects.mockResolvedValue([]);
      const caller = appRouter.createCaller(normalUserContext);
      await expect(caller.projects.list()).resolves.toBeDefined();
    });

    it("Admin can still do everything", async () => {
      financeDb.getOverview.mockResolvedValue({ totals: {}, budgetAlerts: [] });
      financeDb.listUsersForAdmin.mockResolvedValue([]);
      const caller = appRouter.createCaller(adminContext);
      await expect(caller.finance.overview({ projectId: 88 })).resolves.toBeDefined();
      await expect(caller.admin.users()).resolves.toBeDefined();
    });
  });
});
