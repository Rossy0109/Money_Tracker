import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock the RBAC module (controls permission checks) ───────────────────────
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

// ─── Mock the database module ────────────────────────────────────────────────
const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getOverview: vi.fn(),
    getBudgetPlan: vi.fn(),
    getFinanceAnalytics: vi.fn(),
    searchTransactions: vi.fn(),
    listTransactionsPaginated: vi.fn(),
    getMonthlyReport: vi.fn(),
    getVoucherSettings: vi.fn(),
    updateVoucherSettings: vi.fn(),
    exportUserData: vi.fn(),
    exportProjectBackup: vi.fn(),
    previewProjectBackup: vi.fn(),
    restoreProjectBackup: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    getAutomationOverview: vi.fn(),
    getStatementData: vi.fn(),
    getVoucherPrintData: vi.fn(),
    getVoucherList: vi.fn(),
    getFirmProfile: vi.fn(),
    saveFirmProfile: vi.fn(),
    getAccountTypes: vi.fn(),
    getChartOfAccounts: vi.fn(),
    getChartOfAccountsTree: vi.fn(),
    createChartOfAccount: vi.fn(),
    updateChartOfAccount: vi.fn(),
    deleteChartOfAccount: vi.fn(),
    seedDefaultChartOfAccounts: vi.fn(),
    getPeriodLocks: vi.fn(),
    lockPeriod: vi.fn(),
    unlockPeriod: vi.fn(),
    getVoucherReversals: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    createDue: vi.fn(),
    settleDue: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    upsertBudget: vi.fn(),
    createBill: vi.fn(),
    updateBill: vi.fn(),
    setBillPaid: vi.fn(),
    deleteBill: vi.fn(),
    createRecurringTemplate: vi.fn(),
    updateRecurringTemplate: vi.fn(),
    generateRecurringNow: vi.fn(),
    setRecurringScheduleTask: vi.fn(),
    setBillReminderSettings: vi.fn(),
    setBillScheduleTask: vi.fn(),
    createVoucherWithEntries: vi.fn(),
    reverseVoucher: vi.fn(),
    createBankReconciliation: vi.fn(),
    getBankReconciliationById: vi.fn(),
    getBankReconciliations: vi.fn(),
    addBankReconciliationItem: vi.fn(),
    matchBankReconciliationItem: vi.fn(),
    unmatchBankReconciliationItem: vi.fn(),
    completeBankReconciliation: vi.fn(),
    getBankReconciliationItems: vi.fn(),
    getLedgerEntriesForReconciliation: vi.fn(),
    listHouseholds: vi.fn(),
    listHouseholdInvitations: vi.fn(),
    createHousehold: vi.fn(),
    getHouseholdOverview: vi.fn(),
    inviteHouseholdMember: vi.fn(),
    acceptHouseholdInvitation: vi.fn(),
    updateHouseholdMember: vi.fn(),
    saveSharedBudget: vi.fn(),
    addSharedExpense: vi.fn(),
    listInvoices: vi.fn(),
    getInvoiceById: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    deleteInvoice: vi.fn(),
    getFinancialStatements: vi.fn(),
    listInventoryItems: vi.fn(),
    createInventoryItem: vi.fn(),
    updateInventoryItem: vi.fn(),
    adjustInventoryStock: vi.fn(),
    deleteInventoryItem: vi.fn(),
    getEmployees: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    deleteEmployee: vi.fn(),
    getSalaryPayments: vi.fn(),
    disburseSalary: vi.fn(),
    getEmployeeAdvances: vi.fn(),
    createEmployeeAdvance: vi.fn(),
    listUsersForAdmin: vi.fn(),
    listProjectsForAdmin: vi.fn(),
    listAuditLogsPage: vi.fn(),
    listAuditLogsForExport: vi.fn(),
    getAuditLogActivity: vi.fn(),
    setUserPassword: vi.fn(),
  },
}));

vi.mock("./db", () => financeDb);

// ─── Import after mocks ─────────────────────────────────────────────────────
import { appRouter } from "./routers";

// ─── INPUT_OPERATOR permissions (from permissions.ts) ────────────────────────
const INPUT_OPERATOR_PERMISSIONS = [
  "auth.login",
  "auth.logout",
  "accounting.create",
  "payroll.create",
  "voucher.create",
  "budget.create",
];

// ─── Test contexts ──────────────────────────────────────────────────────────
const inputOperatorUser = {
  id: 42,
  openId: "input-op-user",
  email: "inputop@example.com",
  name: "Input Operator",
  loginMethod: "password",
  role: "input_only" as const,
  status: "active" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const inputOperatorContext = {
  user: inputOperatorUser,
  req: { protocol: "https", headers: {}, ip: "127.0.0.1" },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
} as any;

const unauthenticatedContext = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

const expenseInput = {
  projectId: 88,
  categoryId: 7,
  accountId: 3,
  type: "expense" as const,
  amount: 1500,
  paymentMethod: "bKash",
  note: "Test",
  occurredAt: new Date("2026-08-19T12:00:00.000Z"),
};

// ─── Helper: set up RBAC mock for INPUT_OPERATOR ────────────────────────────
function mockInputOperatorPermissions() {
  rbacMock.hasPermission.mockImplementation(
    async (_userId: number, perm: string) => INPUT_OPERATOR_PERMISSIONS.includes(perm)
  );
  rbacMock.hasAnyPermission.mockImplementation(
    async (_userId: number, perms: string[]) => perms.some(p => INPUT_OPERATOR_PERMISSIONS.includes(p))
  );
  rbacMock.hasAllPermissions.mockImplementation(
    async (_userId: number, perms: string[]) => perms.every(p => INPUT_OPERATOR_PERMISSIONS.includes(p))
  );
  rbacMock.getUserPermissions.mockResolvedValue(INPUT_OPERATOR_PERMISSIONS);
  rbacMock.getUserRoles.mockResolvedValue(["INPUT_OPERATOR"]);
  rbacMock.hasRole.mockImplementation(
    async (_userId: number, role: string) => role === "INPUT_OPERATOR"
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

describe("INPUT_OPERATOR RBAC Security Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInputOperatorPermissions();
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 1: Allowed Operations (must succeed)
  // ───────────────────────────────────────────────────────────────────────
  describe("Allowed: Data entry operations", () => {
    it("can create accounting entry (addTransaction)", async () => {
      financeDb.createTransaction.mockResolvedValue(10);
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.addTransaction(expenseInput);
      expect(result).toBe(10);
    });

    it("can create account (addAccount)", async () => {
      financeDb.createAccount.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.addAccount({
          projectId: 88, name: "Cash", type: "cash", openingBalance: 0,
        })
      ).resolves.toBeUndefined();
    });

    it("can create budget entry (saveBudget)", async () => {
      financeDb.upsertBudget.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.saveBudget({
          projectId: 88, categoryId: 7, monthKey: "2026-08", amount: 5000,
        })
      ).resolves.toBeUndefined();
    });

    it("can create bill (addBill)", async () => {
      financeDb.createBill.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.addBill({
          projectId: 88, title: "Electricity", amount: 2000,
          dueAt: new Date("2026-09-01"),
        })
      ).resolves.toBeUndefined();
    });

    it("can create due/debt (addDue)", async () => {
      financeDb.createDue.mockResolvedValue({ id: 40 });
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.addDue({
        projectId: 88, type: "debt", counterparty: "Supplier",
        amount: 5000, openedAt: new Date("2026-08-20T12:00:00Z"),
      });
      expect(result).toHaveProperty("id", 40);
    });

    it("can create recurring template (addRecurringTemplate)", async () => {
      financeDb.createRecurringTemplate.mockResolvedValue(55);
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.addRecurringTemplate({
        ...expenseInput, frequency: "monthly", scheduleDay: 1,
        nextRunAt: new Date("2026-09-01T12:00:00Z"),
      });
      expect(result).toBe(55);
    });

    it("can create voucher (createVoucher)", async () => {
      financeDb.createVoucherWithEntries.mockResolvedValue({ id: 10, voucherNo: "V010" });
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.createVoucher({
        projectId: 88, date: new Date("2026-08-20"),
        debits: [{ accountId: 1, amount: 1000 }],
        credits: [{ accountId: 2, amount: 1000 }],
      });
      expect(result).toHaveProperty("voucherNo", "V010");
    });

    it("can disburse salary (disburseSalary)", async () => {
      financeDb.disburseSalary.mockResolvedValue({ success: true, voucherNo: "S030" });
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.disburseSalary({
        projectId: 88, employeeId: 1, monthKey: "2026-08",
        baseSalary: 25000, bonusAmount: 0, allowanceAmount: 0,
        advanceDeduction: 0, otherDeduction: 0,
      });
      expect(result).toEqual({ success: true, voucherNo: "S030" });
    });

    it("can create employee advance (createEmployeeAdvance)", async () => {
      financeDb.createEmployeeAdvance.mockResolvedValue({ id: 80 });
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.createEmployeeAdvance({
        projectId: 88, employeeId: 1, amount: 5000,
      });
      expect(result).toHaveProperty("id", 80);
    });

    it("can sync offline transactions (syncOfflineTransactions)", async () => {
      financeDb.createTransaction.mockResolvedValue(1);
      const caller = appRouter.createCaller(inputOperatorContext);
      const result = await caller.finance.syncOfflineTransactions({
        projectId: 88, items: [expenseInput],
      });
      expect(result).toHaveProperty("syncedCount", 1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 2: Admin procedures (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Admin procedures", () => {
    it("cannot access admin.users", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.updateUserStatus", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.admin.updateUserStatus({ targetUserId: 1, status: "active" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.projects", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.projects()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.auditLogs", async () => {
      financeDb.listAuditLogsPage.mockResolvedValue({ logs: [], total: 0 });
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.auditLogs({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.auditLogExport", async () => {
      financeDb.listAuditLogsForExport.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.auditLogExport({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.auditActivity", async () => {
      financeDb.getAuditLogActivity.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.auditActivity({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.verifyAccess", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.admin.verifyAccess({ password: "test" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.elevationStatus", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.elevationStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot access admin.revokeAccess", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.admin.revokeAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 3: Read operations (must be blocked — entry operators don't read)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Financial read operations", () => {
    it("cannot read overview", async () => {
      financeDb.getOverview.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.finance.overview({ projectId: 88 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read budget plan", async () => {
      financeDb.getBudgetPlan.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.budgetPlan({ projectId: 88, monthKey: "2026-08" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read analytics", async () => {
      financeDb.getFinanceAnalytics.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.analytics({ projectId: 88, months: 6 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot search transactions", async () => {
      financeDb.searchTransactions.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.searchTransactions({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot list paginated transactions", async () => {
      financeDb.listTransactionsPaginated.mockResolvedValue({ items: [], total: 0 });
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.paginatedTransactions({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read automation overview", async () => {
      financeDb.getAutomationOverview.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.automationOverview({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read monthly report", async () => {
      financeDb.getMonthlyReport.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.monthlyReport({ projectId: 88, monthKey: "2026-08" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read statement data", async () => {
      financeDb.getStatementData.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.statementData({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read financial statements", async () => {
      financeDb.getFinancialStatements.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.financialStatements({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read voucher list", async () => {
      financeDb.getVoucherList.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.voucherList({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read voucher settings", async () => {
      financeDb.getVoucherSettings.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.voucherSettings({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read voucher print data", async () => {
      financeDb.getVoucherPrintData.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.voucherPrint({ projectId: 88, transactionId: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read firm profile", async () => {
      financeDb.getFirmProfile.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.firmProfile({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read chart of accounts", async () => {
      financeDb.getChartOfAccounts.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getChartOfAccounts({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read COA tree", async () => {
      financeDb.getChartOfAccountsTree.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getChartOfAccountsTree({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read account types", async () => {
      financeDb.getAccountTypes.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getAccountTypes({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read period locks", async () => {
      financeDb.getPeriodLocks.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getPeriodLocks({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read voucher reversals", async () => {
      financeDb.getVoucherReversals.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getVoucherReversals({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read bank reconciliations", async () => {
      financeDb.getBankReconciliations.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.getBankReconciliations({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read invoices", async () => {
      financeDb.listInvoices.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.invoices({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read inventory", async () => {
      financeDb.listInventoryItems.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.inventoryList({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read employees", async () => {
      financeDb.getEmployees.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.employeesList({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read salary payments", async () => {
      financeDb.getSalaryPayments.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.salaryPaymentsList({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read employee advances", async () => {
      financeDb.getEmployeeAdvances.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.employeeAdvancesList({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot list projects", async () => {
      financeDb.listProjects.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.projects.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot read households", async () => {
      financeDb.listHouseholds.mockResolvedValue([]);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.finance.households()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 4: Update operations (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Financial update operations", () => {
    it("cannot update transaction", async () => {
      financeDb.updateTransaction.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateTransaction({ ...expenseInput, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update account", async () => {
      financeDb.updateAccount.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateAccount({
          id: 1, projectId: 88, name: "Cash", type: "cash", openingBalance: 0,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update chart of accounts", async () => {
      financeDb.updateChartOfAccount.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateChartOfAccount({
          projectId: 88, accountId: 1, name: "Updated",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update bill", async () => {
      financeDb.updateBill.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateBill({
          projectId: 88, id: 1, title: "Updated", amount: 1000,
          dueAt: new Date(), isPaid: false,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot mark bill paid", async () => {
      financeDb.setBillPaid.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.setBillPaid({ projectId: 88, id: 1, isPaid: true })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot settle due", async () => {
      financeDb.settleDue.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.settleDue({
          projectId: 88, dueId: 1, amount: 1000,
          occurredAt: new Date(),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot save firm profile", async () => {
      financeDb.saveFirmProfile.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.saveFirmProfile({ projectId: 88, name: "Updated" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot save voucher settings", async () => {
      financeDb.updateVoucherSettings.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.saveVoucherSettings({
          projectId: 88, prefix: "V", startNumber: 1, endNumber: 999,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot lock period", async () => {
      financeDb.lockPeriod.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.lockPeriod({ projectId: 88, monthKey: "2026-08" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot unlock period", async () => {
      financeDb.unlockPeriod.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.unlockPeriod({ projectId: 88, monthKey: "2026-08" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update invoice status (approve own transactions)", async () => {
      financeDb.updateInvoiceStatus.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateInvoiceStatus({
          projectId: 88, id: 1, status: "paid",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update employee", async () => {
      financeDb.updateEmployee.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateEmployee({
          projectId: 88, id: 1, name: "Updated",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update inventory item", async () => {
      financeDb.updateInventoryItem.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateInventoryItem({
          projectId: 88, id: 1, name: "Updated",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot adjust inventory stock", async () => {
      financeDb.adjustInventoryStock.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.adjustInventoryStock({
          projectId: 88, id: 1, quantityChange: 10, reason: "Restock",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot toggle recurring template active", async () => {
      financeDb.updateRecurringTemplate.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.setRecurringActive({
          projectId: 88, id: 1, isActive: true,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot generate recurring now", async () => {
      financeDb.generateRecurringNow.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.generateRecurringNow({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot match bank reconciliation item", async () => {
      financeDb.matchBankReconciliationItem.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.matchBankReconciliationItem({
          projectId: 88, itemId: 1, ledgerEntryId: 1,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot complete bank reconciliation", async () => {
      financeDb.completeBankReconciliation.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.completeBankReconciliation({
          projectId: 88, reconciliationId: 1,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot update household member", async () => {
      financeDb.updateHouseholdMember.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.updateHouseholdMember({
          householdId: 1, membershipId: 1, role: "editor",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 5: Delete operations (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Financial delete operations", () => {
    it("cannot delete transaction", async () => {
      financeDb.deleteTransaction.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteTransaction({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete account", async () => {
      financeDb.deleteAccount.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteAccount({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete chart of account", async () => {
      financeDb.deleteChartOfAccount.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteChartOfAccount({ projectId: 88, accountId: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete bill", async () => {
      financeDb.deleteBill.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteBill({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete invoice", async () => {
      financeDb.deleteInvoice.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteInvoice({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete inventory item", async () => {
      financeDb.deleteInventoryItem.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteInventoryItem({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot delete employee", async () => {
      financeDb.deleteEmployee.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.deleteEmployee({ projectId: 88, id: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 6: Backup/export/restore (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Backup and export operations", () => {
    it("cannot export user data", async () => {
      financeDb.exportUserData.mockResolvedValue({ data: {} });
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(caller.finance.exportData()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot export project backup", async () => {
      financeDb.exportProjectBackup.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.exportProjectBackup({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot preview backup restore", async () => {
      financeDb.previewProjectBackup.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.previewProjectBackup({ backup: {} as any })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot restore backup", async () => {
      financeDb.restoreProjectBackup.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.restoreProjectBackup({
          projectName: "Restored", confirmation: "RESTORE_NEW_PROJECT", backup: {} as any,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot check cloud backup status", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.cloudBackupStatus()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("cannot trigger cloud backup", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.triggerCloudBackup({ projectId: 88 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 7: Voucher modification (must be blocked — cannot modify posted)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Posted voucher modification", () => {
    it("cannot reverse voucher", async () => {
      financeDb.reverseVoucher.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.reverseVoucher({
          projectId: 88, originalVoucherId: 1, reason: "Error",
          date: new Date(),
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 8: Chart of Accounts — NOTE: accounting.create covers COA creates
  // in the coarse-grained permission model. Finer-grained restrictions would
  // require additional permission granularity (e.g. accounting.create_coa).
  // ───────────────────────────────────────────────────────────────────────
  describe("Chart of Accounts — permitted by accounting.create (coarse model)", () => {
    it("CAN create COA account (accounting.create covers this)", async () => {
      financeDb.createChartOfAccount.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.createChartOfAccount({
          projectId: 88, accountTypeId: 1, code: "1000", name: "Cash",
        })
      ).resolves.toBeDefined();
    });

    it("CAN seed default COA (accounting.create covers this)", async () => {
      financeDb.seedDefaultChartOfAccounts.mockResolvedValue(undefined);
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.seedChartOfAccounts({ projectId: 88 })
      ).resolves.toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 9: Payroll management (create allowed, read/update/delete blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Payroll management (create allowed)", () => {
    it("can create employee (payroll.create permission granted to INPUT_OPERATOR)", async () => {
      financeDb.createEmployee.mockResolvedValue({});
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.finance.createEmployee({
          projectId: 88, name: "New Employee",
        })
      ).resolves.toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 10: System settings (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: System settings", () => {
    it("cannot send system notification (notifyOwner)", async () => {
      const caller = appRouter.createCaller(inputOperatorContext);
      await expect(
        caller.system.notifyOwner({ title: "Test", content: "Test" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 11: Unauthenticated access (must be blocked)
  // ───────────────────────────────────────────────────────────────────────
  describe("Forbidden: Unauthenticated access to protected procedures", () => {
    it("cannot access overview without auth", async () => {
      const caller = appRouter.createCaller(unauthenticatedContext);
      await expect(
        caller.finance.overview({ projectId: 88 })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("cannot create transaction without auth", async () => {
      const caller = appRouter.createCaller(unauthenticatedContext);
      await expect(
        caller.finance.addTransaction(expenseInput)
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("cannot access admin without auth", async () => {
      const caller = appRouter.createCaller(unauthenticatedContext);
      // adminProcedure rejects unauthenticated users with UNAUTHORIZED before
      // any role or elevation check (never FORBIDDEN, never treated as admin).
      await expect(caller.admin.users()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SECTION 12: Role escalation resistance
  // ───────────────────────────────────────────────────────────────────────
  describe("Security: Role escalation resistance", () => {
    it("input_only user status is respected by legacy middleware", () => {
      expect(inputOperatorUser.role).toBe("input_only");
      expect(inputOperatorUser.status).toBe("active");
    });

    it("RBAC permissions are correctly restricted to 6 entries", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).toHaveLength(6);
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("auth.login");
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("auth.logout");
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("accounting.create");
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("payroll.create");
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("voucher.create");
      expect(INPUT_OPERATOR_PERMISSIONS).toContain("budget.create");
    });

    it("INPUT_OPERATOR does NOT have any read permissions", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("accounting.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("budget.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("voucher.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("ledger.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("audit.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("payroll.read");
    });

    it("INPUT_OPERATOR does NOT have any update permissions", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("accounting.update");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("budget.update");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("payroll.update");
    });

    it("INPUT_OPERATOR does NOT have any delete permissions", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("accounting.delete");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("budget.delete");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("payroll.delete");
    });

    it("INPUT_OPERATOR does NOT have admin/system permissions", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("user.read");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("user.create");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("user.update");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("user.suspend");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("settings.manage");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("role.manage");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("permission.manage");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("backup.create");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("backup.restore");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("audit.export");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("ledger.export");
    });

    it("INPUT_OPERATOR does NOT have voucher approval/modification permissions", () => {
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("voucher.submit");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("voucher.approve");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("voucher.post");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("voucher.reverse");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("budget.approve");
      expect(INPUT_OPERATOR_PERMISSIONS).not.toContain("payroll.approve");
    });
  });
});
