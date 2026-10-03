import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection } from "mysql2/promise";
// @ts-expect-error - helper script without type declarations
import { getIsolatedE2EDatabaseUrl } from "../scripts/e2e-database.mjs";
// @ts-expect-error - helper script without type declarations
import { bootstrapLocalE2eSchema } from "../scripts/bootstrap-local-e2e-schema.mjs";
import { closeDatabaseConnection } from "./_core/dbConnection";

const savedDatabaseUrl = process.env.DATABASE_URL;

function resolveBaseUrl(): string | null {
  try {
    return getIsolatedE2EDatabaseUrl().toString();
  } catch {
    return null;
  }
}

const baseUrl = resolveBaseUrl();

async function localDbReachable(): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const connection = await createConnection(baseUrl);
    await connection.ping();
    await connection.destroy();
    return true;
  } catch {
    return false;
  }
}

// Top-level probe: the suite runs only with a reachable disposable MariaDB
// (local runs). CI's unit job has no database service and skips cleanly.
const enabled = await localDbReachable();

const scratchDatabase = `money_tracker_dbunit_${Date.now().toString(36)}_${process.pid}`;
const scratchUrl = enabled
  ? (() => {
      const url = new URL(baseUrl as string);
      url.pathname = `/${scratchDatabase}`;
      return url.toString();
    })()
  : "";

describe.runIf(enabled)("db.ts hermetic flows (disposable MariaDB)", () => {
  let userId = 0;
  let projectId = 0;
  let incomeId = 0;

  beforeAll(async () => {
    const admin = await createConnection(baseUrl as string);
    await admin.query(`CREATE DATABASE \`${scratchDatabase}\``);
    await admin.destroy();
    await bootstrapLocalE2eSchema(scratchUrl);
    process.env.DATABASE_URL = scratchUrl;
  }, 60000);

  afterAll(async () => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    await closeDatabaseConnection();
    const admin = await createConnection(baseUrl as string);
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDatabase}\``);
    await admin.destroy();
  }, 60000);

  it(
    "upserts a user and reads it back",
    async () => {
      const { upsertUser, getUserByOpenId, getUserIdByOpenId } = await import(
        "./db"
      );
      await upsertUser({ openId: "dbunit:hermetic" });
      const user = await getUserByOpenId("dbunit:hermetic");
      expect(user?.openId).toBe("dbunit:hermetic");
      const id = await getUserIdByOpenId("dbunit:hermetic");
      expect(id).toBeGreaterThan(0);
      if (!id) throw new Error("User id missing after upsert");
      userId = id;
    },
    30000
  );

  it(
    "createProject seeds the 16 default categories",
    async () => {
      const { createProject, getOverview } = await import("./db");
      const project = await createProject(userId, "Hermetic");
      expect(project.id).toBeGreaterThan(0);
      if (!project.id) throw new Error("Project creation returned no id");
      projectId = project.id;
      const overview = await getOverview(userId, projectId);
      expect(overview.categories).toHaveLength(16);
      expect(
        overview.categories.some(
          c => c.type === "income" && c.name === "পাওনা আদায়"
        )
      ).toBe(true);
      expect(
        overview.categories.filter(c => c.type === "income")
      ).toHaveLength(4);
      expect(overview.categories.map(c => c.name)).toContain("বেতন");
    },
    30000
  );

  it(
    "income and expense move the account balance",
    async () => {
      const { createAccount, createTransaction, getOverview } = await import(
        "./db"
      );
      const account = await createAccount(userId, {
        projectId,
        name: "Cash",
        type: "cash",
        openingBalance: 1000,
      });
      const incomeCat = (
        await getOverview(userId, projectId)
      ).categories.find(c => c.type === "income");
      const expenseCat = (
        await getOverview(userId, projectId)
      ).categories.find(c => c.type === "expense");
      expect(incomeCat).toBeDefined();
      expect(expenseCat).toBeDefined();

      incomeId = await createTransaction(userId, {
        projectId,
        categoryId: incomeCat!.id,
        accountId: account.id,
        type: "income",
        amount: 500,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      let overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1500);

      const expenseId = await createTransaction(userId, {
        projectId,
        categoryId: expenseCat!.id,
        accountId: account.id,
        type: "expense",
        amount: 200,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1300);

      const { deleteTransaction } = await import("./db");
      await deleteTransaction(userId, projectId, expenseId);
      overview = await getOverview(userId, projectId);
      expect(overview.transactions).toHaveLength(1);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(1500);
    },
    60000
  );

  it(
    "updating a transaction rebalances the account",
    async () => {
      const { updateTransaction, getOverview } = await import("./db");
      const overview0 = await getOverview(userId, projectId);
      const incomeCat = overview0.categories.find(c => c.type === "income")!;
      const account = overview0.accounts[0];
      const before = Number(account.currentBalance);

      await updateTransaction(userId, Number(incomeId), {
        projectId,
        categoryId: incomeCat.id,
        accountId: account.id,
        type: "income",
        amount: 700,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      const overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 500 + 700);
    },
    60000
  );

  it(
    "rejects non-positive amounts",
    async () => {
      const { createTransaction, getOverview } = await import("./db");
      const cat = (await getOverview(userId, projectId)).categories[0];
      await expect(
        createTransaction(userId, {
          projectId,
          categoryId: cat.id,
          type: cat.type as "income" | "expense",
          amount: 0,
          paymentMethod: "cash",
          occurredAt: new Date(),
        })
      ).rejects.toThrow("লেনদেনের পরিমাণ");
    },
    30000
  );

  it(
    "runs the session lifecycle",
    async () => {
      const {
        createUserSession,
        getSessionByRefreshToken,
        countActiveSessions,
        revokeSession,
        revokeAllUserSessions,
        findRevokedSessionByToken,
        cleanupExpiredSessions,
      } = await import("./db");
      const future = new Date(Date.now() + 3600_000);
      await createUserSession(
        userId,
        "sess-hermetic-1",
        "refresh-hermetic-1",
        "vitest",
        "127.0.0.1",
        future,
        future
      );
      const session = await getSessionByRefreshToken("refresh-hermetic-1");
      expect(session?.userId).toBe(userId);
      expect(await countActiveSessions(userId)).toBe(1);

      await revokeSession("refresh-hermetic-1");
      expect(await countActiveSessions(userId)).toBe(0);
      const revoked = await findRevokedSessionByToken("sess-hermetic-1");
      expect(revoked.length).toBe(1);

      await createUserSession(
        userId,
        "sess-hermetic-2",
        "refresh-hermetic-2",
        "vitest",
        "127.0.0.1",
        future,
        future
      );
      await revokeAllUserSessions(userId);
      expect(await countActiveSessions(userId)).toBe(0);

      const past = new Date(Date.now() - 3600_000);
      await createUserSession(
        userId,
        "sess-hermetic-3",
        "refresh-hermetic-3",
        "vitest",
        "127.0.0.1",
        past,
        past
      );
      await cleanupExpiredSessions();
      expect(
        await getSessionByRefreshToken("refresh-hermetic-3")
      ).toBeUndefined();
    },
    60000
  );

  it(
    "enforces the voucher state machine",
    async () => {
      const {
        getChartOfAccounts,
        createVoucherWithEntries,
        submitVoucher,
        approveVoucher,
      } = await import("./db");
      const chart = await getChartOfAccounts(userId, projectId);
      const debitCoa = chart.find(a => a.code === "1110");
      const creditCoa = chart.find(a => a.code === "4100");
      expect(debitCoa?.id).toBeGreaterThan(0);
      expect(creditCoa?.id).toBeGreaterThan(0);
      if (!debitCoa || !creditCoa)
        throw new Error("Canonical chart accounts missing");

      await expect(
        createVoucherWithEntries(userId, {
          projectId,
          date: new Date(),
          narration: "unbalanced",
          debits: [{ accountId: debitCoa.id, amount: 100 }],
          credits: [{ accountId: creditCoa.id, amount: 99 }],
        })
      ).rejects.toThrow();

      const { voucherId } = await createVoucherWithEntries(userId, {
        projectId,
        date: new Date(),
        narration: "hermetic draft",
        debits: [{ accountId: debitCoa.id, amount: 100 }],
        credits: [{ accountId: creditCoa.id, amount: 100 }],
      });
      expect(voucherId).toBeGreaterThan(0);

      const submitted = await submitVoucher(userId, projectId, voucherId);
      expect(submitted.status).toBe("submitted");
      // Double submit is an illegal transition.
      await expect(
        submitVoucher(userId, projectId, voucherId)
      ).rejects.toThrow();
      // Maker cannot check their own voucher.
      await expect(
        approveVoucher(userId, projectId, voucherId, "approve")
      ).rejects.toThrow();
      // Return to draft, then submit again.
      await approveVoucher(userId, projectId, voucherId, "return");
      const resubmitted = await submitVoucher(userId, projectId, voucherId);
      expect(resubmitted.status).toBe("submitted");
    },
    60000
  );

  it(
    "builds the monthly report from recorded transactions",
    async () => {
      const { getMonthlyReport } = await import("./db");
      const monthKey = new Date().toISOString().slice(0, 7);
      const report = await getMonthlyReport(userId, projectId, monthKey);
      // State so far: one income txn of 700, expense deleted.
      expect(report.totalIncome).toBe(700);
      expect(report.totalExpense).toBe(0);
      expect(report.netAmount).toBe(700);
      expect(report.transactionCount).toBe(1);
      expect(report.monthKey).toBe(monthKey);
      expect(report.financialPosition.accountBalance).toBe(1700);
    },
    60000
  );

  it(
    "creates and partially settles a debt",
    async () => {
      const { createDue, settleDue, getOverview, getMonthlyReport } =
        await import("./db");
      const account = (await getOverview(userId, projectId)).accounts[0];
      const before = Number(account.currentBalance);
      const due = await createDue(userId, {
        projectId,
        type: "debt",
        counterparty: "Hermetic Lender",
        amount: 300,
        openedAt: new Date(),
      });
      expect(Number(due.outstandingAmount)).toBe(300);

      // Overpaying must be rejected.
      await expect(
        settleDue(userId, {
          projectId,
          dueId: due.id,
          accountId: account.id,
          amount: 500,
          occurredAt: new Date(),
        })
      ).rejects.toThrow();

      await settleDue(userId, {
        projectId,
        dueId: due.id,
        accountId: account.id,
        amount: 100,
        occurredAt: new Date(),
      });
      const monthKey = new Date().toISOString().slice(0, 7);
      const report = await getMonthlyReport(userId, projectId, monthKey);
      expect(report.totalDebt).toBe(200);
      const overview = await getOverview(userId, projectId);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 100);
    },
    60000
  );

  it(
    "generates a due recurring run",
    async () => {
      const {
        createRecurringTemplate,
        generateRecurringNow,
        getOverview,
      } = await import("./db");
      const overview0 = await getOverview(userId, projectId);
      const expenseCat = overview0.categories.find(
        c => c.type === "expense"
      )!;
      const account = overview0.accounts[0];
      const before = Number(account.currentBalance);
      const txnCount = overview0.transactions.length;

      const templateId = await createRecurringTemplate(userId, {
        projectId,
        accountId: account.id,
        categoryId: expenseCat.id,
        type: "expense",
        amount: 50,
        paymentMethod: "cash",
        frequency: "monthly",
        scheduleDay: 1,
        nextRunAt: new Date(Date.now() - 86_400_000),
      });
      const result = await generateRecurringNow(
        userId,
        projectId,
        templateId,
        new Date()
      );
      expect(result.created).toBeGreaterThanOrEqual(1);

      const overview = await getOverview(userId, projectId);
      expect(overview.transactions.length).toBeGreaterThan(txnCount);
      expect(
        Number(
          overview.accounts.find(a => a.id === account.id)?.currentBalance
        )
      ).toBe(before - 50 * result.created);
    },
    60000
  );

  it(
    "upserts monthly budgets",
    async () => {
      const { upsertBudget, getBudgetPlan, getOverview } = await import(
        "./db"
      );
      const expenseCat = (
        await getOverview(userId, projectId)
      ).categories.find(c => c.type === "expense")!;
      const monthKey = new Date().toISOString().slice(0, 7);

      await upsertBudget(userId, {
        projectId,
        categoryId: expenseCat.id,
        monthKey,
        amount: 5000,
      });
      const plan1 = await getBudgetPlan(userId, projectId, monthKey);
      expect(
        plan1.plans.find(p => p.categoryId === expenseCat.id)?.currentBudget
      ).toBe(5000);

      await upsertBudget(userId, {
        projectId,
        categoryId: expenseCat.id,
        monthKey,
        amount: 6000,
      });
      const plan2 = await getBudgetPlan(userId, projectId, monthKey);
      expect(
        plan2.plans.find(p => p.categoryId === expenseCat.id)?.currentBudget
      ).toBe(6000);
    },
    60000
  );

  it(
    "runs the bill reminder lifecycle",
    async () => {
      const {
        createBill,
        updateBill,
        setBillPaid,
        deleteBill,
        getAutomationOverview,
      } = await import("./db");
      const dueAt = new Date(Date.now() + 7 * 86_400_000);
      await createBill(userId, {
        projectId,
        title: "Hermetic power bill",
        amount: 1200,
        dueAt,
      });
      const created = (
        await getAutomationOverview(userId, projectId)
      ).bills.find(b => b.title === "Hermetic power bill");
      expect(created?.amount).toBe(1200);
      expect(created?.isPaid).toBe(false);
      if (!created) throw new Error("Bill not found after creation");

      await updateBill(userId, projectId, created.id, {
        title: "Hermetic power bill v2",
        amount: 1300,
        dueAt,
        isPaid: false,
      });
      await setBillPaid(userId, projectId, created.id, true);
      const paid = (await getAutomationOverview(userId, projectId)).bills.find(
        b => b.id === created.id
      );
      expect(paid?.title).toBe("Hermetic power bill v2");
      expect(paid?.amount).toBe(1300);
      expect(paid?.isPaid).toBe(true);

      await deleteBill(userId, projectId, created.id);
      const after = (await getAutomationOverview(userId, projectId)).bills.find(
        b => b.id === created.id
      );
      expect(after).toBeUndefined();
      await expect(
        updateBill(userId, projectId, created.id, {
          title: "gone",
          amount: 1,
          dueAt,
          isPaid: false,
        })
      ).rejects.toThrow("Bill not found");
    },
    60000
  );

  it(
    "updates accounts and guards deleting accounts with transactions",
    async () => {
      const { createAccount, updateAccount, deleteAccount, getOverview } =
        await import("./db");
      const account = (await getOverview(userId, projectId)).accounts[0];
      const before = Number(account.currentBalance);

      await updateAccount(userId, account.id, {
        projectId,
        name: "Hermetic Cash v2",
        type: "cash",
        openingBalance: 1200,
      });
      const updated = (await getOverview(userId, projectId)).accounts.find(
        a => a.id === account.id
      );
      expect(updated?.name).toBe("Hermetic Cash v2");
      // Opening moved 1000 -> 1200, so the live balance follows by +200.
      expect(Number(updated?.currentBalance)).toBe(before + 200);

      const spare = await createAccount(userId, {
        projectId,
        name: "Spare",
        type: "bank",
        openingBalance: 0,
      });
      await deleteAccount(userId, projectId, spare.id);
      const after = (await getOverview(userId, projectId)).accounts.find(
        a => a.id === spare.id
      );
      expect(after).toBeUndefined();

      await expect(
        deleteAccount(userId, projectId, account.id)
      ).rejects.toThrow();
    },
    60000
  );

  it(
    "locks and unlocks fiscal periods",
    async () => {
      const {
        lockPeriod,
        unlockPeriod,
        isPeriodLocked,
        getPeriodLocks,
        assertPeriodNotLocked,
      } = await import("./db");
      const monthKey = "2000-01";
      expect(await isPeriodLocked(userId, projectId, monthKey)).toBe(false);

      await lockPeriod(userId, projectId, monthKey, "hermetic audit");
      expect(await isPeriodLocked(userId, projectId, monthKey)).toBe(true);
      expect(
        (await getPeriodLocks(userId, projectId)).some(
          l => l.monthKey === monthKey
        )
      ).toBe(true);
      await expect(lockPeriod(userId, projectId, monthKey)).rejects.toThrow();
      await expect(
        assertPeriodNotLocked(userId, projectId, new Date(`${monthKey}-15`))
      ).rejects.toThrow();

      await unlockPeriod(userId, projectId, monthKey);
      expect(await isPeriodLocked(userId, projectId, monthKey)).toBe(false);
      await assertPeriodNotLocked(
        userId,
        projectId,
        new Date(`${monthKey}-15`)
      );
    },
    60000
  );

  it(
    "reads and updates voucher settings",
    async () => {
      const { getVoucherSettings, updateVoucherSettings } = await import(
        "./db"
      );
      const defaults = await getVoucherSettings(userId, projectId);
      expect(defaults.nextNumber).toBeGreaterThanOrEqual(
        defaults.startNumber
      );

      await expect(
        updateVoucherSettings(userId, {
          projectId,
          prefix: "T",
          startNumber: 100,
          endNumber: 50,
        })
      ).rejects.toThrow();

      const updated = await updateVoucherSettings(userId, {
        projectId,
        prefix: "T",
        startNumber: 1,
        endNumber: 9999,
      });
      expect(updated.prefix).toBe("T");
      expect(updated.startNumber).toBe(1);
      expect(updated.endNumber).toBe(9999);
    },
    60000
  );

  it(
    "runs the invoice lifecycle with totals math",
    async () => {
      const {
        createInvoice,
        getInvoiceById,
        listInvoices,
        updateInvoiceStatus,
        deleteInvoice,
      } = await import("./db");
      await expect(
        createInvoice(userId, {
          projectId,
          clientName: "   ",
          issueDate: new Date(),
          dueDate: new Date(),
          items: [{ description: "x", quantity: 1, unitPrice: 10 }],
        })
      ).rejects.toThrow();
      await expect(
        createInvoice(userId, {
          projectId,
          clientName: "Hermetic Co",
          issueDate: new Date(),
          dueDate: new Date(),
          items: [],
        })
      ).rejects.toThrow();

      // 2x100 +10% VAT = 220; 1x50 +0% = 50; subtotal 250, vat 20,
      // discount 30 -> grand total 240.
      const invoice = await createInvoice(userId, {
        projectId,
        clientName: "Hermetic Co",
        issueDate: new Date(),
        dueDate: new Date(),
        discountAmount: 30,
        items: [
          { description: "Widget", quantity: 2, unitPrice: 100, vatRate: 10 },
          { description: "Gadget", quantity: 1, unitPrice: 50 },
        ],
      });
      expect(Number(invoice.subtotal)).toBe(250);
      expect(Number(invoice.vatAmount)).toBe(20);
      expect(Number(invoice.grandTotal)).toBe(240);
      expect(invoice.status).toBe("unpaid");
      expect(invoice.invoiceNumber.length).toBeGreaterThan(0);

      const fetched = await getInvoiceById(
        userId,
        projectId,
        invoice.id
      );
      expect(fetched?.clientName).toBe("Hermetic Co");
      expect(
        (await listInvoices(userId, projectId)).some(i => i.id === invoice.id)
      ).toBe(true);

      const paid = await updateInvoiceStatus(userId, projectId, invoice.id, {
        status: "paid",
        paidAmount: 240,
      });
      expect(paid?.status).toBe("paid");
      expect(Number(paid?.paidAmount)).toBe(240);

      await deleteInvoice(userId, projectId, invoice.id);
      expect(
        (await listInvoices(userId, projectId)).some(i => i.id === invoice.id)
      ).toBe(false);
    },
    60000
  );

  it(
    "runs the chart-of-accounts lifecycle",
    async () => {
      const {
        seedDefaultAccountTypes,
        getAccountTypes,
        getChartOfAccounts,
        createChartOfAccount,
        getChartOfAccountById,
        updateChartOfAccount,
        deleteChartOfAccount,
      } = await import("./db");
      await seedDefaultAccountTypes();
      await seedDefaultAccountTypes();
      const types = await getAccountTypes();
      expect(types.map(t => t.code)).toEqual(
        expect.arrayContaining(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])
      );
      const assetType = types.find(t => t.code === "ASSET")!;

      const created = await createChartOfAccount(userId, {
        projectId,
        accountTypeId: assetType.id,
        code: "1900",
        name: "Hermetic Test Asset",
      });
      expect(created?.code).toBe("1900");
      await expect(
        createChartOfAccount(userId, {
          projectId,
          accountTypeId: assetType.id,
          code: "1900",
          name: "Duplicate",
        })
      ).rejects.toThrow();

      const renamed = await updateChartOfAccount(userId, projectId, created!.id, {
        name: "Hermetic Test Asset v2",
      });
      expect(renamed?.name).toBe("Hermetic Test Asset v2");

      // Canonical cash (1110) is referenced by voucher entries — protected.
      const cash = (await getChartOfAccounts(userId, projectId)).find(
        a => a.code === "1110"
      );
      if (cash) {
        await expect(
          deleteChartOfAccount(userId, projectId, cash.id)
        ).rejects.toThrow();
      }

      await deleteChartOfAccount(userId, projectId, created!.id);
      expect(
        await getChartOfAccountById(userId, projectId, created!.id)
      ).toBeUndefined();
    },
    60000
  );

  it(
    "runs the account-group lifecycle",
    async () => {
      const {
        getAccountTypes,
        createAccountGroup,
        listAccountGroups,
        updateAccountGroup,
        deleteAccountGroup,
      } = await import("./db");
      const assetType = (await getAccountTypes()).find(t => t.code === "ASSET")!;

      const { id } = await createAccountGroup(userId, {
        projectId,
        accountTypeId: assetType.id,
        code: "GRP-1",
        name: "Hermetic Group",
      });
      await expect(
        createAccountGroup(userId, {
          projectId,
          accountTypeId: assetType.id,
          code: "GRP-1",
          name: "Duplicate",
        })
      ).rejects.toThrow();
      expect(
        (await listAccountGroups(userId, projectId)).some(g => g.id === id)
      ).toBe(true);

      await updateAccountGroup(userId, projectId, id, {
        name: "Hermetic Group v2",
      });
      expect(
        (await listAccountGroups(userId, projectId)).find(g => g.id === id)?.name
      ).toBe("Hermetic Group v2");

      await deleteAccountGroup(userId, projectId, id);
      expect(
        (await listAccountGroups(userId, projectId)).some(g => g.id === id)
      ).toBe(false);
      await expect(deleteAccountGroup(userId, projectId, id)).rejects.toThrow();
    },
    60000
  );

  it(
    "runs employees, salary, advances, and the delete guard",
    async () => {
      const {
        createEmployee,
        getEmployees,
        updateEmployee,
        disburseSalary,
        getSalaryPayments,
        createEmployeeAdvance,
        getEmployeeAdvances,
        deleteEmployee,
        getOverview,
      } = await import("./db");
      const account = (await getOverview(userId, projectId)).accounts[0];
      await expect(
        createEmployee(userId, { projectId, name: "   ", baseSalary: 0 })
      ).rejects.toThrow();

      const { id } = await createEmployee(userId, {
        projectId,
        name: "Hermetic Worker",
        designation: "Clerk",
        baseSalary: 10000,
      });
      expect((await getEmployees(userId, projectId)).some(e => e.id === id)).toBe(
        true
      );
      await updateEmployee(userId, projectId, id, { designation: "Senior Clerk" });
      expect(
        (await getEmployees(userId, projectId)).find(e => e.id === id)?.designation
      ).toBe("Senior Clerk");

      const monthKey = new Date().toISOString().slice(0, 7);
      const salary = await disburseSalary(userId, {
        projectId,
        employeeId: id,
        monthKey,
        baseSalary: 10000,
        bonusAmount: 1000,
        accountId: account.id,
      });
      expect(salary.success).toBe(true);
      const payments = await getSalaryPayments(userId, projectId, monthKey);
      const mine = payments.find(p => p.employeeName === "Hermetic Worker");
      expect(mine?.status).toBe("paid");
      expect(Number(mine?.netPayable)).toBe(11000);

      await createEmployeeAdvance(userId, {
        projectId,
        employeeId: id,
        amount: 2000,
        accountId: account.id,
      });
      expect(
        (await getEmployeeAdvances(userId, projectId, id)).some(
          a => a.employeeName === "Hermetic Worker"
        )
      ).toBe(true);

      // Financial history blocks the delete.
      await expect(deleteEmployee(userId, projectId, id)).rejects.toThrow();
      const { id: cleanId } = await createEmployee(userId, {
        projectId,
        name: "Hermetic Temp",
        baseSalary: 5000,
      });
      expect((await deleteEmployee(userId, projectId, cleanId)).success).toBe(
        true
      );
    },
    90000
  );

  it(
    "runs the inventory lifecycle with floored stock",
    async () => {
      const {
        createInventoryItem,
        listInventoryItems,
        updateInventoryItem,
        adjustInventoryStock,
        deleteInventoryItem,
      } = await import("./db");
      const { id } = await createInventoryItem({
        userId,
        projectId,
        name: "Hermetic Widget",
        unit: "pcs",
        purchasePrice: 60,
        sellingPrice: 100,
        currentStock: 20,
      });
      expect(
        (await listInventoryItems(userId, projectId)).some(i => i.id === id)
      ).toBe(true);

      await updateInventoryItem(userId, projectId, id, { sellingPrice: 120 });
      expect(
        (await listInventoryItems(userId, projectId)).find(i => i.id === id)
          ?.sellingPrice
      ).toBe("120.00");

      const afterSale = await adjustInventoryStock(
        userId,
        projectId,
        id,
        -5,
        "hermetic sale"
      );
      expect(afterSale.currentStock).toBe(15);
      const floored = await adjustInventoryStock(
        userId,
        projectId,
        id,
        -100,
        "hermetic overdraw"
      );
      expect(floored.currentStock).toBe(0);

      await deleteInventoryItem(userId, projectId, id);
      expect(
        (await listInventoryItems(userId, projectId)).some(i => i.id === id)
      ).toBe(false);
      await expect(
        adjustInventoryStock(userId, projectId, id, 1, "gone")
      ).rejects.toThrow();
    },
    60000
  );

  it(
    "saves and merges the firm profile",
    async () => {
      const { getFirmProfile, saveFirmProfile } = await import("./db");
      const defaults = await getFirmProfile(userId, projectId);
      expect(defaults.name).toBe("");

      await saveFirmProfile(userId, projectId, {
        name: "Hermetic Traders",
        phone: "01000000000",
      });
      const saved = await getFirmProfile(userId, projectId);
      expect(saved.name).toBe("Hermetic Traders");
      expect(saved.phone).toBe("01000000000");

      await saveFirmProfile(userId, projectId, { address: "Dhaka" });
      const merged = await getFirmProfile(userId, projectId);
      expect(merged.name).toBe("Hermetic Traders");
      expect(merged.address).toBe("Dhaka");
    },
    30000
  );

  it(
    "searches and paginates transactions",
    async () => {
      const { searchTransactions, listTransactionsPaginated } = await import(
        "./db"
      );
      const income = await searchTransactions(userId, {
        projectId,
        type: "income",
        minAmount: 100,
        limit: 10,
      });
      expect(income.length).toBeGreaterThanOrEqual(1);
      expect(income.every(t => t.type === "income")).toBe(true);
      expect(income[0].categoryName.length).toBeGreaterThan(0);

      const cheapExpenses = await searchTransactions(userId, {
        projectId,
        type: "expense",
        maxAmount: 60,
        limit: 10,
      });
      expect(cheapExpenses.some(t => Number(t.amount) === 50)).toBe(true);

      const page = await listTransactionsPaginated(userId, {
        projectId,
        page: 1,
        pageSize: 2,
      });
      expect(page.items.length).toBeLessThanOrEqual(2);
      expect(page.pagination.total).toBeGreaterThanOrEqual(2);
      expect(page.pagination.totalPages).toBeGreaterThanOrEqual(1);
      expect(page.aggregations.totalIncome).toBeGreaterThanOrEqual(700);
      expect(page.aggregations.netAmount).toBe(
        page.aggregations.totalIncome - page.aggregations.totalExpense
      );
    },
    60000
  );

  it(
    "guards voucher posting and reversal transitions",
    async () => {
      const {
        getChartOfAccounts,
        createVoucherWithEntries,
        postVoucher,
        reverseVoucher,
      } = await import("./db");
      const chart = await getChartOfAccounts(userId, projectId);
      const debitCoa = chart.find(a => a.code === "1110")!;
      const creditCoa = chart.find(a => a.code === "4100")!;
      const { voucherId } = await createVoucherWithEntries(userId, {
        projectId,
        date: new Date(),
        narration: "hermetic guard draft",
        debits: [{ accountId: debitCoa.id, amount: 10 }],
        credits: [{ accountId: creditCoa.id, amount: 10 }],
      });

      // Draft can be neither posted nor reversed.
      await expect(postVoucher(userId, projectId, voucherId)).rejects.toThrow();
      await expect(
        reverseVoucher(userId, projectId, {
          originalVoucherId: voucherId,
          reason: "must fail",
          date: new Date(),
        })
      ).rejects.toThrow();
    },
    60000
  );

  it(
    "creates, renames, and deletes custom categories with guards",
    async () => {
      const {
        createCategory,
        updateCategory,
        deleteCategory,
        createTransaction,
        getOverview,
      } = await import("./db");
      await expect(
        createCategory(userId, {
          projectId,
          type: "income",
          name: "   ",
        })
      ).rejects.toThrow();

      const created = await createCategory(userId, {
        projectId,
        type: "expense",
        name: "Hermetic Snacks",
      });
      expect(created?.isDefault).toBe(false);
      await expect(
        createCategory(userId, {
          projectId,
          type: "expense",
          name: "Hermetic Snacks",
        })
      ).rejects.toThrow();
      // Same name in the other type is a different category.
      const twin = await createCategory(userId, {
        projectId,
        type: "income",
        name: "Hermetic Snacks",
      });
      expect(twin?.type).toBe("income");

      const renamed = await updateCategory(userId, projectId, created!.id, {
        name: "Hermetic Snacks v2",
      });
      expect(renamed?.name).toBe("Hermetic Snacks v2");
      expect(
        (await getOverview(userId, projectId)).categories.some(
          c => c.id === created!.id && c.name === "Hermetic Snacks v2"
        )
      ).toBe(true);

      // Default categories are protected.
      const overview = await getOverview(userId, projectId);
      const salaryCat = overview.categories.find(c => c.name === "বেতন")!;
      await expect(
        deleteCategory(userId, projectId, salaryCat.id)
      ).rejects.toThrow();

      // Categories in use are protected: post a transaction first.
      const account = overview.accounts[0];
      await createTransaction(userId, {
        projectId,
        categoryId: created!.id,
        accountId: account.id,
        type: "expense",
        amount: 25,
        paymentMethod: "cash",
        occurredAt: new Date(),
      });
      await expect(
        deleteCategory(userId, projectId, created!.id)
      ).rejects.toThrow();

      // Unused custom categories delete cleanly.
      await deleteCategory(userId, projectId, twin!.id);
      expect(
        (await getOverview(userId, projectId)).categories.some(
          c => c.id === twin!.id
        )
      ).toBe(false);
      await expect(
        deleteCategory(userId, projectId, twin!.id)
      ).rejects.toThrow();
    },
    60000
  );
  it(
    "project backup round-trips period controls, account groups and voucher audit",
    async () => {
      const {
        createProject,
        createVoucherWithEntries,
        createAccountGroup,
        getChartOfAccounts,
        seedDefaultAccountTypes,
        lockPeriod,
        exportProjectBackup,
        restoreProjectBackup,
        getDb,
        databaseRequired,
      } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const {
        financeFiscalPeriods,
        financeVoucherReversals,
        financeVoucherReferences,
        financeVoucherAudit,
        financePeriodLocks,
        financeAccountGroups,
        financeAccountTypes,
        financeVouchers,
      } = await import("../drizzle/schema");

      await seedDefaultAccountTypes();
      const scopeProject = await createProject(userId, "Backup scope");
      if (!scopeProject.id) throw new Error("Scope project missing");
      const scopeId = scopeProject.id;
      const db = databaseRequired(await getDb());

      const [periodRow] = await db
        .insert(financeFiscalPeriods)
        .values({
          userId,
          projectId: scopeId,
          name: "2026",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
          status: "closed",
          closedAt: new Date("2026-06-30T00:00:00.000Z"),
          closedBy: userId,
        })
        .execute();
      const periodId = Number(periodRow.insertId);

      const chart = await getChartOfAccounts(userId, scopeId);
      const debitCoa = chart.find(a => a.code === "1110");
      const creditCoa = chart.find(a => a.code === "4100");
      if (!debitCoa || !creditCoa)
        throw new Error("Canonical chart accounts missing");

      const { voucherId: originalId } = await createVoucherWithEntries(
        userId,
        {
          projectId: scopeId,
          date: new Date("2026-02-01T00:00:00.000Z"),
          narration: "scope original",
          debits: [{ accountId: debitCoa.id, amount: 100 }],
          credits: [{ accountId: creditCoa.id, amount: 100 }],
          references: [
            {
              refType: "cheque",
              refNumber: "CHQ-77",
              refDate: new Date("2026-02-01T00:00:00.000Z"),
            },
          ],
          fiscalPeriodId: periodId,
        }
      );
      const { voucherId: reversalId } = await createVoucherWithEntries(
        userId,
        {
          projectId: scopeId,
          date: new Date("2026-02-02T00:00:00.000Z"),
          narration: "scope reversal",
          debits: [{ accountId: debitCoa.id, amount: 100 }],
          credits: [{ accountId: creditCoa.id, amount: 100 }],
        }
      );
      await db
        .insert(financeVoucherReversals)
        .values({
          userId,
          projectId: scopeId,
          originalVoucherId: originalId,
          reversalVoucherId: reversalId,
          reason: "স্কোপ রিভার্সাল",
          reversedAt: new Date("2026-03-01T00:00:00.000Z"),
          reversedBy: userId,
        })
        .execute();

      const [assetType] = await db
        .select()
        .from(financeAccountTypes)
        .where(eq(financeAccountTypes.code, "ASSET"))
        .limit(1);
      if (!assetType) throw new Error("System account types missing");
      const parentGroup = await createAccountGroup(userId, {
        projectId: scopeId,
        accountTypeId: assetType.id,
        code: "SCOP",
        name: "Scope parent",
      });
      const childGroup = await createAccountGroup(userId, {
        projectId: scopeId,
        accountTypeId: assetType.id,
        parentId: parentGroup.id,
        code: "SCHL",
        name: "Scope child",
      });
      await lockPeriod(userId, scopeId, "2026-03", "স্কোপ লক");

      const backup = await exportProjectBackup(userId, scopeId);
      expect(backup.fiscalPeriods).toHaveLength(1);
      expect(backup.periodLocks).toHaveLength(1);
      expect(backup.accountGroups).toHaveLength(2);
      expect(backup.voucherReversals).toHaveLength(1);
      expect(backup.voucherReferences).toHaveLength(1);
      // One "create" audit row per voucher; the reversal row is inserted directly.
      expect(backup.voucherAudit).toHaveLength(2);

      const restored = await restoreProjectBackup(userId, {
        projectName: "Backup scope restored",
        backup,
      });
      const restoredId = restored.projectId;
      expect(restoredId).toBeGreaterThan(0);

      const restoredPeriods = await db
        .select()
        .from(financeFiscalPeriods)
        .where(eq(financeFiscalPeriods.projectId, restoredId));
      expect(restoredPeriods).toHaveLength(1);
      expect(restoredPeriods[0].name).toBe("2026");
      expect(restoredPeriods[0].status).toBe("closed");
      expect(restoredPeriods[0].closedAt).not.toBeNull();
      // The source actor may not exist in a fresh database.
      expect(restoredPeriods[0].closedBy).toBeNull();

      const restoredLocks = await db
        .select()
        .from(financePeriodLocks)
        .where(eq(financePeriodLocks.projectId, restoredId));
      expect(restoredLocks).toHaveLength(1);
      expect(restoredLocks[0].monthKey).toBe("2026-03");
      expect(restoredLocks[0].reason).toBe("স্কোপ লক");
      expect(restoredLocks[0].lockedBy).toBe(userId);

      const restoredGroups = await db
        .select()
        .from(financeAccountGroups)
        .where(eq(financeAccountGroups.projectId, restoredId));
      expect(restoredGroups).toHaveLength(2);
      const restoredParent = restoredGroups.find(g => g.code === "SCOP");
      const restoredChild = restoredGroups.find(g => g.code === "SCHL");
      if (!restoredParent || !restoredChild)
        throw new Error("Restored account groups missing");
      expect(restoredChild.parentId).toBe(restoredParent.id);
      expect(restoredChild.parentId).not.toBe(childGroup.id);

      const restoredVouchers = await db
        .select()
        .from(financeVouchers)
        .where(eq(financeVouchers.projectId, restoredId));
      expect(restoredVouchers).toHaveLength(2);
      const restoredVoucherIds = new Set(restoredVouchers.map(v => v.id));
      const restoredOriginal = restoredVouchers.find(
        v => v.narration === "scope original"
      );
      expect(restoredOriginal?.fiscalPeriodId).toBe(restoredPeriods[0].id);

      const restoredReversals = await db
        .select()
        .from(financeVoucherReversals)
        .where(eq(financeVoucherReversals.projectId, restoredId));
      expect(restoredReversals).toHaveLength(1);
      expect(restoredReversals[0].reason).toBe("স্কোপ রিভার্সাল");
      expect(
        restoredVoucherIds.has(restoredReversals[0].originalVoucherId)
      ).toBe(true);
      expect(
        restoredVoucherIds.has(restoredReversals[0].reversalVoucherId)
      ).toBe(true);
      expect(restoredReversals[0].originalVoucherId).not.toBe(originalId);
      expect(restoredReversals[0].reversedBy).toBe(userId);

      const restoredRefs = await db
        .select()
        .from(financeVoucherReferences)
        .innerJoin(
          financeVouchers,
          eq(financeVoucherReferences.voucherId, financeVouchers.id)
        )
        .where(eq(financeVouchers.projectId, restoredId));
      expect(restoredRefs).toHaveLength(1);
      expect(restoredRefs[0].finance_voucher_references.refNumber).toBe(
        "CHQ-77"
      );

      const restoredAudit = await db
        .select()
        .from(financeVoucherAudit)
        .innerJoin(
          financeVouchers,
          eq(financeVoucherAudit.voucherId, financeVouchers.id)
        )
        .where(eq(financeVouchers.projectId, restoredId));
      expect(restoredAudit.length).toBe(backup.voucherAudit?.length);
      expect(restoredAudit[0].finance_voucher_audit.action).toBe("create");
      expect(restoredAudit[0].finance_voucher_audit.actorUserId).toBe(userId);
    },
    120000
  );

  it(
    "restore drill hook counts rows inside the transaction and rolls back",
    async () => {
      const {
        createProject,
        exportProjectBackup,
        restoreProjectBackup,
        getDb,
        databaseRequired,
      } = await import("./db");
      const { countProjectRecords } = await import("./backupDb");
      const { eq } = await import("drizzle-orm");
      const { financeProjects, auditLogs } = await import("../drizzle/schema");

      const source = await createProject(userId, "Drill source");
      if (!source.id) throw new Error("Drill source project missing");
      const backup = await exportProjectBackup(userId, source.id);

      let drillCounts: Record<string, number> | null = null;
      let hookProjectId = 0;
      await expect(
        restoreProjectBackup(
          userId,
          { projectName: "Drill rehearsal", backup },
          {
            insideTransaction: async (tx, id) => {
              hookProjectId = id;
              drillCounts = await countProjectRecords(userId, id, {
                executor: tx,
                skipOwnershipCheck: true,
              });
              throw new Error("DRILL_ROLLBACK");
            },
          }
        )
      ).rejects.toThrow("DRILL_ROLLBACK");

      // The hook saw every restored row before the rollback.
      expect(hookProjectId).toBeGreaterThan(0);
      expect(drillCounts).toEqual(await countProjectRecords(userId, source.id));

      // The rehearsal left nothing behind: no project, no restore audit row.
      const db = databaseRequired(await getDb());
      const [leftoverProject] = await db
        .select({ id: financeProjects.id })
        .from(financeProjects)
        .where(eq(financeProjects.name, "Drill rehearsal"))
        .limit(1);
      expect(leftoverProject).toBeUndefined();

      const [leftoverAudit] = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          eq(auditLogs.summary, "Project restored safely from backup: Drill rehearsal")
        )
        .limit(1);
      expect(leftoverAudit).toBeUndefined();
    },
    120000
  );
});
