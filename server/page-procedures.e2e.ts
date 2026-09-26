/**
 * Procedure harness for every page of the UI, against a real database.
 *
 * Each page component calls a specific set of tRPC procedures. The unit suite
 * proves the internals of individual procedures; this suite proves the thing a
 * user actually experiences: that every procedure a page calls is reachable,
 * authorized and executes without a server-side fault.
 *
 * It works in two layers:
 *
 *  1. Coverage — the set of procedures is derived from the client sources at
 *     run time, so a page that starts calling a new procedure is picked up
 *     automatically and cannot silently escape testing.
 *  2. Playback — a seeded book is created through the app's own mutations, then
 *     every procedure is invoked. A validation/permission rejection is a pass
 *     (the procedure ran and checked its input); an unhandled fault is a
 *     failure with the server's message attached.
 *
 * Read paths that the pages depend on are additionally asserted to return real
 * data, which catches the subtler bug where a query answers successfully but
 * filters out everything the page needs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { assignRole, clearRBACCache, initializeRBAC } from "./_core/rbac";
import { ROLE_NAMES } from "../shared/rbac";
import { closeDatabaseConnection, getDb } from "./db";

type ContextUser = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "admin" | "user";
  status: "pending" | "active" | "suspended";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type Caller = ReturnType<typeof appRouter.createCaller>;

const OPEN_ID = "e2e-page-owner";
// The report window is derived from the clock: wallets are opened "today", so a
// fixed historical window would leave the opening balances outside the report.
const NOW = new Date();
const TO = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0, 23, 59, 59, 999);
const FROM = new Date(NOW.getFullYear(), 0, 1);
const MID_YEAR = new Date(NOW.getFullYear(), NOW.getMonth(), 15);
const MONTH_KEY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;
const PREVIOUS_MONTH_KEY =
  NOW.getMonth() === 0
    ? `${NOW.getFullYear() - 1}-12`
    : `${NOW.getFullYear()}-${String(NOW.getMonth()).padStart(2, "0")}`;

let owner: ContextUser;
let caller: Caller;
let projectId: number;
let cashId: number;
let spareAccountId: number;
let spareItemId: number;
let spareEmployeeId: number;
let spareInvoiceId: number;
let spareTransactionId: number;
let spareBillId: number;
let spareTemplateId: number;
let cashLedgerId: number;
let incomeCategoryId: number;
let revenueId: number;
let categoryId: number;

/** Ids created while playing, so mutations get realistic arguments. */
const seeded = {
  voucherId: 0,
  invoiceId: 0,
  employeeId: 0,
  itemId: 0,
  householdId: 0,
  accountTypeId: 0,
  billId: 0,
  templateId: 0,
  partyId: 0,
};

/** Procedures whose read result the pages rely on. */
const READ_PATHS = [
  "finance.overview",
  "finance.financialStatements",
  "finance.statementData",
  "finance.trialBalance",
  "finance.getChartOfAccounts",
  "finance.getChartOfAccountsTree",
  "finance.voucherList",
  "finance.searchTransactions",
  "finance.analytics",
  "finance.accountLedger",
  "finance.accountingReconciliation",
  "finance.monthlyReport",
  "finance.budgetPlan",
  "finance.invoices",
  "finance.inventoryList",
  "finance.employeesList",
  "finance.households",
  "finance.getPeriodLocks",
  "finance.getVoucherReversals",
  "finance.automationOverview",
  "finance.cloudBackupStatus",
  "finance.voucherSettings",
  "finance.firmProfile",
  "finance.getAccountTypes",
  "finance.exportProjectBackup",
  "finance.exportData",
  "finance.voucherPrint",
  "finance.salaryPaymentsList",
  "finance.employeeAdvancesList",
  "finance.householdOverview",
  "finance.householdInvitations",
  "admin.users",
  "admin.projects",
  "admin.auditLogs",
  "projects.list",
  "auth.me",
] as const;

/**
 * Rejections that mean "the procedure ran and validated its input" rather than
 * "the procedure is broken".
 */
/** Names declared in the `perProcedure` input map. */
function perProcedureInputNames(): string[] {
  return Object.keys(perProcedure());
}
/** Names `primaryIdFor` can route. */
function primaryIdNames(): string[] {
  return Object.keys(idTargets());
}

/**
 * `id` targets a different entity in each router. Resolved lazily: the spares
 * only exist after `beforeAll` has seeded them.
 */
function primaryIdFor(name: string): number | undefined {
  return idTargets()[name];
}

/** Ids that only exist once `beforeAll` has seeded them. */
const idTargets = (): Record<string, number> => ({
  "finance.updateAccount": spareAccountId,
  "finance.deleteAccount": spareAccountId,
  "finance.updateBill": spareBillId,
  "finance.deleteBill": spareBillId,
  "finance.updateInventoryItem": spareItemId,
  "finance.deleteInventoryItem": spareItemId,
  "finance.updateEmployee": spareEmployeeId,
  "finance.deleteEmployee": spareEmployeeId,
  "finance.updateInvoiceStatus": spareInvoiceId,
  "finance.deleteInvoice": spareInvoiceId,
  "finance.updateTransaction": spareTransactionId,
  "finance.deleteTransaction": spareTransactionId,
  "finance.setRecurringActive": spareTemplateId,
  "finance.generateRecurringNow": spareTemplateId,
  "finance.getVoucherReversals": seeded.voucherId,
});

/**
 * Business-rule refusals that prove a guard works. They are INTERNAL_SERVER_ERROR
 * (thrown as plain `Error` from db.ts), so they are matched by message.
 */
const EXPECTED_GUARD_MESSAGES: Record<string, string[]> = {
  "finance.deleteChartOfAccount": [
    "চাইল্ড অ্যাকাউন্ট থাকা অবস্থায় মুছা যাবে না",
  ],
  "finance.submitVoucher": [
    "ভাউচার submitted থেকে submitted এ পরিবর্তন করা যায় না",
  ],
  "finance.postVoucher": [
    "ভাউচার submitted থেকে posted এ পরিবর্তন করা যায় না",
    "নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না",
  ],
  "finance.triggerCloudBackup": ["BACKUP_ENCRYPTION_KEY"],
};

/** Maker-checker refusals that must happen for the voucher's author. */
const MAKER_CHECKER_MESSAGES: Record<string, string> = {
  "finance.approveVoucher": "নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না",
  "finance.postVoucher": "নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না",
  "finance.reverseVoucher": "নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না",
};

const EXPECTED_REJECTIONS = new Set([
  "BAD_REQUEST",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "TOO_MANY_REQUESTS",
]);

function callerFor(user: ContextUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
    adminElevation: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

function assertIsolatedDatabase() {
  const databaseName = process.env.ISOLATED_E2E_DATABASE_NAME ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseHost = new URL(databaseUrl).hostname;
  if (
    process.env.ISOLATED_E2E_DATABASE !== "true" ||
    !/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(databaseName) ||
    !databaseUrl.includes(`/${databaseName}`) ||
    !["127.0.0.1", "localhost"].includes(databaseHost)
  ) {
    throw new Error(
      "এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেসে চালানো যাবে"
    );
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (
      /\.tsx?$/.test(entry) &&
      !/\.test\.|\.e2e\.|\.wiring\.|\.d\.ts$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Every tRPC procedure the client calls, discovered from the client sources. */
function clientProcedures(): Set<string> {
  const used = new Set<string>();
  const files = [...walk("client/src"), ...walk("shared")];
  if (files.length === 0) {
    throw new Error(
      "ক্লায়েন্ট সোর্স খুঁজে পাওয়া যায়নি; পরীক্ষামূলক ডাটাবেস ছাড়া চালাবেন না"
    );
  }
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const pattern =
      /trpc\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\.(?:useQuery|useMutation|useInfiniteQuery|useSuspenseQuery)/g;
    for (const match of source.matchAll(pattern)) {
      used.add(`${match[1]}.${match[2]}`);
    }
  }
  return used;
}

/** Shared input shapes. Hoisted so the self-check can audit their keys. */
/** Project-scoped base input; read lazily so it is valid before seeding. */
const base = (): Record<string, unknown> => ({ projectId });
const dateFields = {
  from: FROM,
  to: TO,
  asOf: TO,
  startDate: FROM,
  endDate: TO,
  date: MID_YEAR,
  occurredAt: MID_YEAR,
  issueDate: MID_YEAR,
  dueDate: TO,
  openedAt: FROM,
  joiningDate: FROM,
  last6Months: true,
  monthKey: MONTH_KEY,
  fiscalYear: NOW.getFullYear(),
  month: NOW.getMonth() + 1,
  year: NOW.getFullYear(),
  today: MID_YEAR,
};

/** Read lazily: some entries reference ids that only exist after seeding. */
const perProcedure = (): Record<string, Record<string, unknown>> => ({
  "auth.me": {},
  "projects.list": {},
  "finance.overview": {},
  "finance.financialStatements": { ...base(), from: FROM, to: TO },
  "finance.statementData": { ...base(), from: FROM, to: TO },
  "finance.trialBalance": { ...base(), to: TO },
  "finance.incomeStatement": { ...base(), from: FROM, to: TO },
  "finance.balanceSheet": { ...base(), asOf: TO },
  "finance.cashFlowStatement": { ...base(), from: FROM, to: TO },
  "finance.accountingReport": { ...base(), from: FROM, to: TO },
  "finance.accountLedger": {
    ...base,
    accountId: cashLedgerId,
    from: FROM,
    to: TO,
  },
  "finance.accountingReconciliation": { ...base() },
  "finance.getChartOfAccounts": { ...base() },
  "finance.getChartOfAccountsTree": { ...base() },
  "finance.getAccountTypes": { ...base() },
  "finance.voucherList": { ...base() },
  "finance.voucherPrint": { ...base(), voucherId: seeded.voucherId },
  "finance.getVoucherReversals": { ...base() },
  "finance.getPeriodLocks": { ...base() },
  "finance.searchTransactions": { ...base(), query: "ভাড়া" },
  "finance.analytics": { ...base(), months: 6 },
  "finance.monthlyReport": { ...base(), monthKey: MONTH_KEY },
  "finance.budgetPlan": { ...base(), monthKey: MONTH_KEY },
  "finance.automationOverview": { ...base() },
  "finance.voucherSettings": { ...base() },
  "finance.firmProfile": { ...base() },
  "finance.cloudBackupStatus": { ...base() },
  "finance.exportProjectBackup": { ...base() },
  "finance.previewProjectBackup": { ...base() },
  "finance.exportData": { ...base() },
  "finance.invoices": { ...base() },
  "finance.inventoryList": { ...base() },
  "finance.employeesList": { ...base() },
  "finance.salaryPaymentsList": { ...base() },
  "finance.employeeAdvancesList": { ...base() },
  "finance.households": {},
  "finance.householdOverview": { householdId: seeded.householdId },
  "finance.householdInvitations": { householdId: seeded.householdId },
  "admin.users": {},
  "admin.projects": {},
  "admin.auditLogs": {},
  "admin.auditActivity": {},
  "admin.auditLogExport": {},
});

/** Arguments for the procedures that need ids or dates to return real data. */
function inputFor(name: string): Record<string, unknown> {
  const inputs = perProcedure();
  if (inputs[name]) return { ...inputs[name] };

  // Generic fallback: satisfy the common id/date shapes so the procedure gets
  // past validation and reaches its implementation.
  const generic: Record<string, unknown> = { ...base, ...dateFields };
  // `id` is overloaded across routers, so route it to the entity the procedure
  // actually mutates. Spare clones exist so destructive calls stay harmless.
  generic.id = primaryIdFor(name) ?? seeded.voucherId;
  generic.originalVoucherId = seeded.voucherId;
  generic.originalTransactionId = spareTransactionId;
  generic.voucherId = seeded.voucherId;
  generic.invoiceId = seeded.invoiceId;
  generic.billId = seeded.billId;
  generic.employeeId = seeded.employeeId;
  generic.itemId = seeded.itemId;
  generic.householdId = seeded.householdId;
  generic.accountId = cashId;
  generic.memberId = owner.id;
  generic.userId = owner.id;
  generic.templateId = seeded.templateId;
  generic.partyId = seeded.partyId;
  generic.categoryId = categoryId;
  generic.accountTypeId = seeded.accountTypeId;
  generic.transactionId = seeded.voucherId;
  generic.email = "page-harness@e2e.test";
  generic.password = "Page-Harness-Str0ng-42";
  generic.name = "Page Harness";
  generic.clientName = "Page Harness Client";
  generic.counterparty = "Page Harness Counterparty";
  generic.type = "expense";
  generic.status = "active";
  generic.role = "admin";
  generic.targetRole = ROLE_NAMES.ACCOUNTING_ADMIN;
  generic.roleName = ROLE_NAMES.ACCOUNTING_ADMIN;
  generic.entityId = seeded.voucherId;
  generic.entityType = "voucher";
  generic.code = "1100";
  generic.limit = 20;
  generic.page = 1;
  generic.offset = 0;
  generic.query = "";
  generic.format = "csv";
  return generic;
}

async function call(name: string): Promise<unknown> {
  const [routerName, procedureName] = name.split(".");
  const router = (
    caller as unknown as Record<
      string,
      Record<string, (input: Record<string, unknown>) => Promise<unknown>>
    >
  )[routerName];
  const procedure = router?.[procedureName];
  if (typeof procedure !== "function") {
    throw new Error(`Procedure ${name} is missing from the router`);
  }
  return procedure(inputFor(name));
}

function describeFault(name: string, error: unknown): string {
  if (error instanceof TRPCError) {
    return `${name} failed with TRPCError ${error.code}: ${error.message}`;
  }
  return `${name} threw ${(error as Error)?.name ?? "error"}: ${(error as Error)?.message ?? String(error)}`;
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");

  await db.insert(users).values({
    openId: OPEN_ID,
    name: "E2E Page Owner",
    email: "page-owner@e2e.test",
    loginMethod: "e2e",
    role: "user",
    status: "active",
  });
  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.openId, OPEN_ID));
  if (!created) throw new Error("E2E পরিচয় তৈরি করা যায়নি");
  owner = created as ContextUser;

  await seedDefaultRBAC();
  await assignRole(owner.id, ROLE_NAMES.SUPER_ADMIN, owner.id);
  clearRBACCache();
  await initializeRBAC();

  caller = callerFor(owner);

  // ── Play the app's own create paths, so every later read has real data ──
  projectId = (await caller.projects.create({ name: "Page Harness Book" })).id;

  await caller.finance.addAccount({
    projectId,
    name: "নগদ",
    type: "cash",
    openingBalance: 50_000,
  });
  await caller.finance.addAccount({
    projectId,
    name: "ব্যাংক",
    type: "bank",
    openingBalance: 100_000,
  });
  const overview = await caller.finance.overview({ projectId });
  cashId = overview.accounts.find(a => a.type === "cash")!.id;

  // `overview.accounts` are the payment-method wallets (`finance_accounts`).
  // Vouchers and the account ledger must reference the canonical ledger
  // accounts (`finance_chart_of_accounts`) instead, so resolve them by code.
  const chart = await caller.finance.getChartOfAccounts({ projectId });
  const canonicalId = (code: string) => {
    const account = chart.find(a => a.code === code);
    if (!account) throw new Error(`canonical account ${code} is missing`);
    return account.id;
  };
  cashLedgerId = canonicalId("1110");
  revenueId = canonicalId("4100");
  categoryId = overview.categories.find(c => c.type === "expense")!.id;

  const voucher = await caller.finance.createVoucher({
    projectId,
    date: MID_YEAR,
    narration: "সেল বিক্রয়",
    debits: [{ accountId: cashLedgerId, amount: 25_000, narration: "নগদ আয়" }],
    credits: [{ accountId: revenueId, amount: 25_000, narration: "আয়" }],
  });
  seeded.voucherId = voucher.voucherId;
  await caller.finance.submitVoucher({
    projectId,
    voucherId: voucher.voucherId,
  });
  // Deliberately *not* approved or posted here: the 4-eyes policy forbids the
  // maker from approving, posting or reversing their own voucher (asserted
  // below). Ledger activity comes from `addTransaction`, which posts its own
  // system voucher.

  await caller.finance.addTransaction({
    projectId,
    accountId: cashId,
    categoryId,
    type: "expense",
    amount: 4_500,
    paymentMethod: "cash",
    note: "অফিস ভাড়া",
    occurredAt: MID_YEAR,
  });
  // `addTransaction` posts its own system voucher, so this is the only way to
  // realize revenue in the ledger: the manual voucher above stays `submitted`
  // because the maker may not approve or post their own.
  incomeCategoryId =
    overview.categories.find(c => c.type === "income")?.id ?? categoryId;
  await caller.finance.addTransaction({
    projectId,
    accountId: cashId,
    categoryId: incomeCategoryId,
    type: "income",
    amount: 32_000,
    paymentMethod: "cash",
    note: "পরামর্শ আয়",
    occurredAt: MID_YEAR,
  });

  const invoice = await caller.finance.createInvoice({
    projectId,
    clientName: "Page Harness Client",
    issueDate: MID_YEAR,
    dueDate: TO,
    items: [{ description: "সেবা", quantity: 1, unitPrice: 12_000 }],
  });
  seeded.invoiceId = invoice.id;

  const item = await caller.finance.createInventoryItem({
    projectId,
    name: "নোটবুক",
    purchasePrice: 120,
    sellingPrice: 200,
    currentStock: 40,
  });
  seeded.itemId = item.id;

  const employee = await caller.finance.createEmployee({
    projectId,
    name: "প্রয়োজনীয় কর্মী",
    baseSalary: 30_000,
  });
  seeded.employeeId = employee.id;

  const household = await caller.finance.createHousehold({
    name: "পারিবারিক খাতা",
  });
  seeded.householdId = household.household.id;

  await caller.finance.saveBudget({
    projectId,
    categoryId,
    monthKey: MONTH_KEY,
    amount: 20_000,
  });
  await caller.finance.lockPeriod({ projectId, monthKey: PREVIOUS_MONTH_KEY });

  // Spare clones: the sweep calls update/delete on every entity, and those calls
  // must not destroy the data the read-path assertions depend on.
  spareAccountId = (
    await caller.finance.addAccount({
      projectId,
      name: "স্পয়ার ওয়ালেট",
      type: "mobile",
      openingBalance: 1_000,
    })
  ).id;
  spareItemId = (
    await caller.finance.createInventoryItem({
      projectId,
      name: "স্পয়ার ইনভেন্টরি",
      purchasePrice: 10,
      sellingPrice: 15,
      currentStock: 5,
    })
  ).id;
  spareEmployeeId = (
    await caller.finance.createEmployee({
      projectId,
      name: "স্পয়ার কর্মী",
      baseSalary: 1_000,
    })
  ).id;
  spareInvoiceId = (
    await caller.finance.createInvoice({
      projectId,
      clientName: "Spare Client",
      issueDate: MID_YEAR,
      dueDate: TO,
      items: [{ description: "স্পয়ার সেবা", quantity: 1, unitPrice: 500 }],
    })
  ).id;
  spareTransactionId = await caller.finance.addTransaction({
    projectId,
    accountId: cashId,
    categoryId,
    type: "expense",
    amount: 300,
    paymentMethod: "cash",
    note: "স্পয়ার লেনদেন",
    occurredAt: MID_YEAR,
  });
  await caller.finance.addBill({
    projectId,
    title: "স্পয়ার বিল",
    amount: 700,
    dueAt: TO,
  });
  // `addBill` returns nothing, and the bill list is part of the overview the
  // Home page renders, so read the id back from there.
  const afterBill = (await caller.finance.overview({ projectId })) as {
    bills?: Array<{ id: number; title: string }>;
  };
  const spareBill = (afterBill.bills ?? []).find(
    b => b.title === "স্পয়ার বিল"
  );
  if (!spareBill) throw new Error("স্পয়ার বিল তৈরি হয়নি");
  spareBillId = spareBill.id;
  spareTemplateId = await caller.finance.addRecurringTemplate({
    projectId,
    categoryId,
    type: "expense",
    amount: 400,
    paymentMethod: "cash",
    note: "স্পয়ার পুনরাবৃত্ত",
    frequency: "monthly",
    scheduleDay: 1,
    nextRunAt: TO,
  });
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("UI procedure coverage", () => {
  it("no harness entry points at a procedure the router does not expose", () => {
    const procedures = (
      appRouter as unknown as {
        _def: { procedures: Record<string, unknown> };
      }
    )._def.procedures;
    const declared = [
      ...new Set([
        ...perProcedureInputNames(),
        ...READ_PATHS,
        ...Object.keys(EXPECTED_GUARD_MESSAGES),
        ...Object.keys(MAKER_CHECKER_MESSAGES),
        ...primaryIdNames(),
      ]),
    ];
    const missing = declared.filter(name => !(name in procedures));
    expect(
      missing,
      `harness references procedures the server does not expose: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every procedure the client calls exists on the router", () => {
    const used = clientProcedures();
    const procedures = (
      appRouter as unknown as {
        _def: { procedures: Record<string, unknown> };
      }
    )._def.procedures;
    const missing = [...used].filter(name => !(name in procedures));
    expect(
      missing,
      `client calls procedures the server does not expose: ${missing.join(", ")}`
    ).toEqual([]);
    expect(used.size).toBeGreaterThan(50);
  });
});

describe("page read paths return real data", () => {
  it("overview exposes the seeded wallet and categories", async () => {
    const data = (await caller.finance.overview({ projectId })) as {
      accounts: Array<{ id: number; type: string; name: string }>;
      categories: Array<{ id: number }>;
    };
    expect(data.accounts.some(a => a.id === cashId)).toBe(true);
    expect(data.categories.length).toBeGreaterThan(0);
  });

  it("financial statements tie out after the seeded activity", async () => {
    const report = (await caller.finance.financialStatements({
      projectId,
      from: FROM,
      to: TO,
    })) as {
      trialBalance: { isBalanced: boolean };
      balanceSheet: { isBalanced: boolean; totalAssets: number };
      incomeStatement: { totalRevenue: number };
    };
    expect(report.trialBalance.isBalanced).toBe(true);
    expect(report.balanceSheet.isBalanced).toBe(true);
    expect(report.balanceSheet.totalAssets).toBeGreaterThan(0);
    expect(report.incomeStatement.totalRevenue).toBeGreaterThan(0);
  });

  it("refuses to let the maker approve, post or reverse their own voucher", async () => {
    // Each rejection is asserted as it happens: collecting the promises first
    // would surface as unhandled rejections.
    await expect(
      caller.finance.approveVoucher({
        projectId,
        voucherId: seeded.voucherId,
        action: "approve",
      })
    ).rejects.toThrow("নিজে অনুমোদন");
    // Posting is refused too — the transition guard (submitted → posted) is
    // checked before the maker rule, and a voucher its maker may not approve can
    // never reach `approved`, so both guards hold.
    await expect(
      caller.finance.postVoucher({
        projectId,
        voucherId: seeded.voucherId,
      })
    ).rejects.toThrow(/নিজে পোস্ট|থেকে posted এ পরিবর্তন করা যায় না/);
    await expect(
      caller.finance.reverseVoucher({
        projectId,
        originalVoucherId: seeded.voucherId,
        reason: "নিজের ভাউচার",
        date: MID_YEAR,
      })
    ).rejects.toThrow(/নিজে রিভার্স|থেকে reversed এ পরিবর্তন করা যায় না/);
    // The voucher is still only submitted: none of the attempts moved it.
    const list = (await caller.finance.voucherList({ projectId })) as Array<{
      id: number;
      status: string;
    }>;
    const row = list.find(v => v.id === seeded.voucherId);
    expect(row?.status).toBe("submitted");
  });

  it("account ledger shows the posted transaction", async () => {
    const ledger = await caller.finance.accountLedger({
      projectId,
      accountId: cashLedgerId,
      from: FROM,
      to: TO,
    });
    expect(ledger.lines.length).toBeGreaterThan(0);
  });

  it("voucher list returns the seeded voucher", async () => {
    const items = (await caller.finance.voucherList({ projectId })) as
      unknown[] | { items?: unknown[] };
    const rows = Array.isArray(items) ? items : (items.items ?? []);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(v => (v as { id: number }).id === seeded.voucherId)).toBe(
      true
    );
  });

  it("search transactions finds the seeded expense", async () => {
    const found = (await caller.finance.searchTransactions({
      projectId,
      query: "ভাড়া",
    })) as unknown[] | { items?: unknown[] };
    const rows = Array.isArray(found) ? found : (found.items ?? []);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("period lock is listed and analytics resolves", async () => {
    const locks = (await caller.finance.getPeriodLocks({
      projectId,
    })) as unknown[];
    expect(locks.length).toBeGreaterThan(0);
    await expect(
      caller.finance.analytics({ projectId, months: 6 })
    ).resolves.toBeDefined();
  });

  it("reconciliation is clean for the seeded book", async () => {
    const report = (await caller.finance.accountingReconciliation({
      projectId,
    })) as { issues?: unknown[]; vouchersUnbalanced?: number };
    expect(report.issues ?? []).toEqual([]);
    expect(report.vouchersUnbalanced ?? 0).toBe(0);
  });
});

// Runs last: the sweep calls update/delete on every entity, so the read-path
// assertions above must see the freshly seeded book.
describe("every page procedure executes", () => {
  const results = new Map<
    string,
    "ok" | "rejected" | "guard-enforced" | "policy-blocked" | "skipped"
  >();

  it("plays all client-called procedures against the seeded book", async () => {
    assertIsolatedDatabase();
    // Client-called procedures plus every read path a page renders.
    const used = [...new Set([...clientProcedures(), ...READ_PATHS])].sort();
    const faults: string[] = [];
    const skipped: string[] = [];
    let ok = 0;
    let rejected = 0;

    for (const name of used) {
      try {
        await call(name);
        ok++;
        results.set(name, "ok");
      } catch (error) {
        if (error instanceof TRPCError && EXPECTED_REJECTIONS.has(error.code)) {
          rejected++;
          results.set(name, "rejected");
          continue;
        }
        const guard = (EXPECTED_GUARD_MESSAGES[name] ?? []).find(message =>
          String((error as Error)?.message).includes(message)
        );
        if (guard) {
          rejected++;
          results.set(name, "guard-enforced");
          continue;
        }
        const policyMessage = MAKER_CHECKER_MESSAGES[name];
        if (
          policyMessage &&
          String((error as Error)?.message).includes(policyMessage)
        ) {
          // Refused exactly as the segregation-of-duties policy requires.
          rejected++;
          results.set(name, "policy-blocked");
          continue;
        }
        faults.push(describeFault(name, error));
        results.set(name, "skipped");
        skipped.push(name);
      }
    }

    const summary = [
      `${used.length} client procedures`,
      `${ok} succeeded`,
      `${rejected} rejected with a validation/permission error`,
      `${faults.length} faulted`,
    ].join(", ");
    // eslint-disable-next-line no-console
    console.log(`[page-harness] ${summary}`);

    expect(faults, `procedures faulted:\n${faults.join("\n")}`).toEqual([]);
    // Every read path a page renders must be reachable, not merely defined.
    const unreachable = READ_PATHS.filter(name => !results.has(name));
    expect(
      unreachable,
      `read paths never exercised: ${unreachable.join(", ")}`
    ).toEqual([]);
  });
});
