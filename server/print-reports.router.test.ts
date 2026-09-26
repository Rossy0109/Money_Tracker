import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const { financeDb } = vi.hoisted(() => ({
  financeDb: {
    getDb: vi.fn().mockResolvedValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
      }),
    }),
    databaseRequired: vi.fn((db: any) => db),
    getStatementData: vi.fn(async () => ({
      project: { id: 5, name: "খাতা" },
      firm: {
        name: "Ahmed's Financial Accounting",
        tagline: "",
        phone: "",
        email: "",
        address: "",
      },
      items: [],
      accounts: [],
      totals: {
        count: 0,
        income: 0,
        expense: 0,
        netAmount: 0,
        openingBalance: 0,
        closingBalance: 0,
      },
    })),
    getVoucherPrintData: vi.fn(async () => ({
      project: { id: 5, name: "খাতা" },
      firm: {
        name: "Ahmed's Financial Accounting",
        tagline: "",
        phone: "",
        email: "",
        address: "",
      },
      transaction: {
        id: 3,
        projectId: 5,
        accountId: null,
        categoryId: 1,
        type: "expense",
        amount: "100.00",
        voucherNo: "V-001",
        reason: null,
        paymentMethod: "cash",
        note: "বিবরণ",
        occurredAt: new Date("2026-09-15T06:00:00.000Z"),
        createdAt: new Date("2026-09-15T06:00:00.000Z"),
        categoryName: "খরচ",
        accountName: null,
      },
    })),
    getFirmProfile: vi.fn(async () => ({
      name: "Ahmed's Financial Accounting",
      tagline: "",
      phone: "",
      email: "",
      address: "",
    })),
    saveFirmProfile: vi.fn(async () => ({
      name: "My Firm",
      tagline: "",
      phone: "",
      email: "",
      address: "",
    })),
    listProjects: vi.fn(async () => []),
  },
}));

vi.mock("./db", () => financeDb);

vi.mock("./accounting-core", () => ({
  assertPeriodNotLocked: vi.fn().mockResolvedValue(undefined),
  generateTrialBalance: vi.fn(),
  generateIncomeStatement: vi.fn(),
  generateBalanceSheet: vi.fn(),
  generateAccountingReport: vi.fn(),
  createFiscalPeriod: vi.fn(),
  listFiscalPeriods: vi.fn(),
  closeFiscalPeriod: vi.fn(),
}));

vi.mock("./_core/rbac", () => ({
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
  isAdminRoleUser: vi.fn().mockResolvedValue(false),
  hasPermission: vi.fn().mockResolvedValue(true),
  hasAnyPermission: vi.fn().mockResolvedValue(true),
  hasAllPermissions: vi.fn().mockResolvedValue(true),
  hasRole: vi.fn().mockResolvedValue(true),
  getUserPermissions: vi.fn().mockResolvedValue([]),
  getUserRoles: vi.fn().mockResolvedValue([]),
}));

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "local:test@example.com",
      name: "মিথিলা",
      email: "test@example.com",
      passwordHash: null,
      loginMethod: "password",
      role: "user",
      status: "active",
      failedLoginAttempts: 0,
      lockedUntil: null,
      resetToken: null,
      resetTokenExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    adminElevation: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("print/report endpoints authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the server-derived user id, never a client-supplied id, to statementData", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await caller.finance.statementData({ projectId: 5 });
    expect(financeDb.getStatementData).toHaveBeenCalledTimes(1);
    expect(financeDb.getStatementData).toHaveBeenCalledWith(7, {
      projectId: 5,
    });
  });

  it("passes project scoping plus the transaction id for voucher print", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const result = await caller.finance.voucherPrint({
      projectId: 5,
      transactionId: 3,
    });
    expect(financeDb.getVoucherPrintData).toHaveBeenCalledWith(7, {
      projectId: 5,
      transactionId: 3,
    });
    expect(result.transaction.voucherNo).toBe("V-001");
  });

  it("rejects an inverse date range before reaching the database layer", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.finance.statementData({
        projectId: 5,
        from: new Date("2026-09-20T00:00:00.000Z"),
        to: new Date("2026-09-01T00:00:00.000Z"),
      })
    ).rejects.toThrow();
    expect(financeDb.getStatementData).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller({
      user: null,
      adminElevation: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        cookie: vi.fn(),
        clearCookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    });
    await expect(
      caller.finance.statementData({ projectId: 5 })
    ).rejects.toThrow();
    expect(financeDb.getStatementData).not.toHaveBeenCalled();
  });

  it("persists firm header updates scoped to the authenticated user", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const saved = await caller.finance.saveFirmProfile({
      projectId: 5,
      name: "My Firm",
    });
    expect(financeDb.saveFirmProfile).toHaveBeenCalledWith(7, 5, {
      projectId: 5,
      name: "My Firm",
    });
    expect(saved.name).toBe("My Firm");
  });
});
