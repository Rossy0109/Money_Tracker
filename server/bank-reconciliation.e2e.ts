/**
 * Bank reconciliation certification (docs/04-READINESS-VERDICT.md §3).
 *
 * `finance-lifecycle.e2e.ts` already covers the happy path (create → add →
 * match → unmatch → complete). This suite closes the certification gaps the
 * audit could only review statically:
 *   - cross-tenant isolation of reconciliation *items*: item ids are
 *     sequential, so an unaudited lookup would let any project owner
 *     match/unmatch another user's statement lines;
 *   - statement lines can only match ledger entries of the same bank
 *     account in the same project;
 *   - the completion tolerance boundary (0.01 allowed, 0.02 blocked);
 *   - list ordering, notes and account joins.
 *
 * Runner: `pnpm test:e2e:isolated`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  financeChartOfAccounts,
  financeBankReconciliationItems,
  users,
} from "../drizzle/schema";
import { appRouter } from "./routers";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { assignRole, clearRBACCache, initializeRBAC } from "./_core/rbac";
import { ROLE_NAMES } from "../shared/rbac";
import { closeDatabaseConnection, getDb } from "./db";

type E2eUser = {
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

let owner: E2eUser;
let stranger: E2eUser;

function caller(user: E2eUser) {
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
      "এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডাটাবেসে চালানো যাবে"
    );
  }
}

async function createUser(openId: string, name: string): Promise<E2eUser> {
  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডাটাবেস সংযোগ পাওয়া যায়নি");
  await db.insert(users).values({
    openId,
    name,
    email: `${openId}@e2e.test`,
    loginMethod: "e2e",
    role: "user",
    status: "active",
  });
  const [created] = await db.select().from(users).where(eq(users.openId, openId));
  if (!created) throw new Error("E2E পরিচয় তৈরি করা যায়নি");
  return created as E2eUser;
}

beforeAll(async () => {
  assertIsolatedDatabase();
  owner = await createUser("e2e-bankrec-owner", "E2E Bank Rec Owner");
  stranger = await createUser("e2e-bankrec-stranger", "E2E Bank Rec Stranger");

  await seedDefaultRBAC();
  await assignRole(owner.id, ROLE_NAMES.MANAGER, owner.id);
  await assignRole(stranger.id, ROLE_NAMES.MANAGER, stranger.id);
  clearRBACCache();
  await initializeRBAC();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

type BankBook = {
  projectId: number;
  bankCoaId: number;
  cashCoaId: number;
  depositLedgerId: number;
  cashLedgerId: number;
  bookBalanceCents: number;
};

/**
 * Seed a project with a bank wallet (canonical CoA 1120) funded with an
 * opening balance, a bank deposit, and a separate cash wallet (canonical CoA
 * 1110) so a foreign-account ledger entry exists for the negative tests.
 */
async function seedBook(user: E2eUser, suffix: string): Promise<BankBook> {
  const c = caller(user);
  const projectId = (await c.projects.create({ name: `E2E রিকন ${suffix}` })).id;

  await c.finance.addAccount({
    projectId,
    name: `ব্যাংক ${suffix}`,
    type: "bank",
    openingBalance: 1000,
  });
  await c.finance.addAccount({
    projectId,
    name: `নগদ ${suffix}`,
    type: "cash",
    openingBalance: 100,
  });
  const overview = await c.finance.overview({ projectId });
  const bankWallet = overview.accounts.find(
    item => item.name === `ব্যাংক ${suffix}`
  )!;
  const incomeCategory = overview.categories.find(
    item => item.type === "income"
  )!;
  await c.finance.addTransaction({
    projectId,
    categoryId: incomeCategory.id,
    accountId: bankWallet.id,
    type: "income",
    amount: 500,
    paymentMethod: "bank",
    note: `E2E আয় ${suffix}`,
    occurredAt: new Date(),
  });

  const db = await getDb();
  if (!db) throw new Error("ডাটাবেস সংযোগ নেই");
  const coas = await db
    .select()
    .from(financeChartOfAccounts)
    .where(eq(financeChartOfAccounts.projectId, projectId));
  const bankCoa = coas.find(coa => coa.code === "1120");
  const cashCoa = coas.find(coa => coa.code === "1110");
  if (!bankCoa || !cashCoa)
    throw new Error("ক্যাননিক্যাল ব্যাংক/নগদ হিসাবখাতা পাওয়া যায়নি");

  const bankEntries = await c.finance.getLedgerEntriesForReconciliation({
    projectId,
    accountId: bankCoa.id,
  });
  const deposit = bankEntries.find(
    entry => entry.entryType === "debit" && Number(entry.amount) === 500
  );
  if (!deposit) throw new Error("ব্যাংক জমার লেজার এন্ট্রি পাওয়া যায়নি");

  const cashEntries = await c.finance.getLedgerEntriesForReconciliation({
    projectId,
    accountId: cashCoa.id,
  });
  if (!cashEntries[0]) throw new Error("নগদ লেজার এন্ট্রি পাওয়া যায়নি");

  return {
    projectId,
    bankCoaId: bankCoa.id,
    cashCoaId: cashCoa.id,
    depositLedgerId: deposit.id,
    cashLedgerId: cashEntries[0].id,
    // 1000 opening + 500 deposit, integer cents.
    bookBalanceCents: 150_000,
  };
}

describe("bank reconciliation certification (§3 runtime evidence)", () => {
  it("persists notes, joins the account, and lists newest statement first", async () => {
    const book = await seedBook(owner, "তালিকা");
    const c = caller(owner);

    const older = await c.finance.createBankReconciliation({
      projectId: book.projectId,
      accountId: book.bankCoaId,
      statementDate: new Date("2026-01-31T00:00:00Z"),
      statementBalance: 1500,
      notes: "জানুয়ারি স্টেটমেন্ট",
    });
    const newer = await c.finance.createBankReconciliation({
      projectId: book.projectId,
      accountId: book.bankCoaId,
      statementDate: new Date("2026-02-28T00:00:00Z"),
      statementBalance: 1500,
    });

    const list = await c.finance.getBankReconciliations({
      projectId: book.projectId,
    });
    expect(list.map(row => row.id)).toEqual([newer.id, older.id]);
    expect(list[0]?.accountCode).toBe("1120");
    expect(list[1]?.notes).toBe("জানুয়ারি স্টেটমেন্ট");
  });

  it("allows a 0.01 difference but blocks 0.02 at completion", async () => {
    const book = await seedBook(owner, "সহনশীলতা");
    const c = caller(owner);

    // 0.02 short → two cents of difference → blocked.
    const blocked = await c.finance.createBankReconciliation({
      projectId: book.projectId,
      accountId: book.bankCoaId,
      statementDate: new Date(),
      statementBalance: 1500.02,
    });
    expect(Math.round(Number(blocked.difference) * 100)).toBe(2);
    await expect(
      c.finance.completeBankReconciliation({
        projectId: book.projectId,
        reconciliationId: blocked.id,
      })
    ).rejects.toThrow("ডিফারেন্স");

    // 0.01 short → one cent of difference → tolerated by the gate.
    const tolerated = await c.finance.createBankReconciliation({
      projectId: book.projectId,
      accountId: book.bankCoaId,
      statementDate: new Date(),
      statementBalance: 1500.01,
    });
    expect(Math.round(Number(tolerated.difference) * 100)).toBe(1);
    await c.finance.completeBankReconciliation({
      projectId: book.projectId,
      reconciliationId: tolerated.id,
    });
    const done = await c.finance.getBankReconciliation({
      projectId: book.projectId,
      reconciliationId: tolerated.id,
    });
    expect(done.status).toBe("completed");
    expect(done.reconciledBy).toBe(owner.id);
  });

  it("rejects matching a statement line to another account's ledger entry", async () => {
    const book = await seedBook(owner, "ভিন্ন-হিসাব");
    const c = caller(owner);

    const rec = await c.finance.createBankReconciliation({
      projectId: book.projectId,
      accountId: book.bankCoaId,
      statementDate: new Date(),
      // Statement includes the 500 deposit as the line being reconciled
      // (same model as finance-lifecycle.e2e.ts): matching the debit must
      // bring the difference to zero.
      statementBalance: 2000,
    });
    const itemId = await c.finance.addBankReconciliationItem({
      projectId: book.projectId,
      reconciliationId: rec.id,
      statementRef: "E2E-STMT-CROSS-ACCOUNT",
      statementDate: new Date(),
      statementAmount: 500,
      statementType: "debit",
    });

    await expect(
      c.finance.matchBankReconciliationItem({
        projectId: book.projectId,
        itemId,
        ledgerEntryId: book.cashLedgerId,
      })
    ).rejects.toThrow("লেজার এন্ট্রি");

    // The failed match must not have mutated the item.
    const db = await getDb();
    if (!db) throw new Error("ডাটাবেস সংযোগ নেই");
    const [row] = await db
      .select()
      .from(financeBankReconciliationItems)
      .where(eq(financeBankReconciliationItems.id, itemId));
    expect(row?.matched).toBe(false);
    expect(row?.ledgerEntryId).toBeNull();

    // The positive path still works on the right account.
    await c.finance.matchBankReconciliationItem({
      projectId: book.projectId,
      itemId,
      ledgerEntryId: book.depositLedgerId,
    });
    const current = await c.finance.getBankReconciliation({
      projectId: book.projectId,
      reconciliationId: rec.id,
    });
    expect(Number(current.difference)).toBe(0);

    // Adding an item pre-matched to a foreign account is rejected too.
    await expect(
      c.finance.addBankReconciliationItem({
        projectId: book.projectId,
        reconciliationId: rec.id,
        ledgerEntryId: book.cashLedgerId,
        statementRef: "E2E-STMT-PREMATCHED",
        statementDate: new Date(),
        statementAmount: 100,
        statementType: "debit",
      })
    ).rejects.toThrow("লেজার এন্ট্রি");
  });

  it("blocks cross-tenant item mutation while the victim's item stays untouched", async () => {
    const victimBook = await seedBook(owner, "ভিকটিম");
    const attackerBook = await seedBook(stranger, "আক্রমণকারী");
    const victimCaller = caller(owner);
    const attackerCaller = caller(stranger);

    const victimRec = await victimCaller.finance.createBankReconciliation({
      projectId: victimBook.projectId,
      accountId: victimBook.bankCoaId,
      statementDate: new Date(),
      statementBalance: 2000,
    });
    const victimItemId = await victimCaller.finance.addBankReconciliationItem({
      projectId: victimBook.projectId,
      reconciliationId: victimRec.id,
      statementRef: "E2E-VICTIM-001",
      statementDate: new Date(),
      statementAmount: 500,
      statementType: "debit",
    });

    // The attacker owns a project (so ownership assertions pass) and knows
    // the sequential item id; the joined scope must still reject it.
    await expect(
      attackerCaller.finance.matchBankReconciliationItem({
        projectId: attackerBook.projectId,
        itemId: victimItemId,
        ledgerEntryId: attackerBook.depositLedgerId,
      })
    ).rejects.toThrow("পাওয়া যায়নি");

    await expect(
      attackerCaller.finance.unmatchBankReconciliationItem({
        projectId: attackerBook.projectId,
        itemId: victimItemId,
      })
    ).rejects.toThrow("পাওয়া যায়নি");

    // Read paths for the victim's reconciliation are closed as well.
    await expect(
      attackerCaller.finance.getBankReconciliationItems({
        reconciliationId: victimRec.id,
      })
    ).rejects.toThrow();
    // A foreign reconciliation id is simply not found inside the attacker's
    // own project scope (the API returns undefined rather than leaking).
    await expect(
      attackerCaller.finance.getBankReconciliation({
        projectId: attackerBook.projectId,
        reconciliationId: victimRec.id,
      })
    ).resolves.toBeUndefined();
    await expect(
      attackerCaller.finance.createBankReconciliation({
        projectId: attackerBook.projectId,
        accountId: victimBook.bankCoaId,
        statementDate: new Date(),
        statementBalance: 1500,
      })
    ).rejects.toThrow();

    // The victim's item is exactly as they left it.
    const db = await getDb();
    if (!db) throw new Error("ডাটাবেস সংযোগ নেই");
    const [row] = await db
      .select()
      .from(financeBankReconciliationItems)
      .where(eq(financeBankReconciliationItems.id, victimItemId));
    expect(row?.matched).toBe(false);
    expect(row?.ledgerEntryId).toBeNull();

    // …and the victim can still complete their own reconciliation.
    await victimCaller.finance.matchBankReconciliationItem({
      projectId: victimBook.projectId,
      itemId: victimItemId,
      ledgerEntryId: victimBook.depositLedgerId,
    });
    await victimCaller.finance.completeBankReconciliation({
      projectId: victimBook.projectId,
      reconciliationId: victimRec.id,
    });
    const done = await victimCaller.finance.getBankReconciliation({
      projectId: victimBook.projectId,
      reconciliationId: victimRec.id,
    });
    expect(done.status).toBe("completed");
  });
});
