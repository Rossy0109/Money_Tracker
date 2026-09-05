import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
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

const OPEN_IDS = ["e2e-owner", "e2e-editor", "e2e-viewer", "e2e-outsider", "e2e-admin"] as const;
const currentMonth = new Date().toISOString().slice(0, 7);

let owner: E2eUser;
let editor: E2eUser;
let viewer: E2eUser;
let outsider: E2eUser;
let administrator: E2eUser;

function caller(user: E2eUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn() },
  } as any);
}

function assertIsolatedDatabase() {
  const databaseName = process.env.ISOLATED_E2E_DATABASE_NAME ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseHost = new URL(databaseUrl).hostname;
  if (process.env.ISOLATED_E2E_DATABASE !== "true" || !/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(databaseName) || !databaseUrl.includes(`/${databaseName}`) || !["127.0.0.1", "localhost"].includes(databaseHost)) {
    throw new Error("এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেসে চালানো যাবে");
  }
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");

  await db.insert(users).values([
    { openId: "e2e-owner", name: "E2E Owner", email: "owner@e2e.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "e2e-editor", name: "E2E Editor", email: "editor@e2e.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "e2e-viewer", name: "E2E Viewer", email: "viewer@e2e.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "e2e-outsider", name: "E2E Outsider", email: "outsider@e2e.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "e2e-admin", name: "E2E Administrator", email: "administrator@e2e.test", loginMethod: "e2e", role: "admin", status: "active" },
  ]);

  const rows = await db.select().from(users).where(inArray(users.openId, [...OPEN_IDS]));
  const byOpenId = new Map(rows.map(row => [row.openId, row as E2eUser]));
  owner = byOpenId.get("e2e-owner")!;
  editor = byOpenId.get("e2e-editor")!;
  viewer = byOpenId.get("e2e-viewer")!;
  outsider = byOpenId.get("e2e-outsider")!;
  administrator = byOpenId.get("e2e-admin")!;
  if ([owner, editor, viewer, outsider, administrator].some(user => !user)) throw new Error("E2E পরিচয় তৈরি করা যায়নি");
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("isolated role, invitation, and restoration E2E", () => {
  it("enforces platform administrator access through the real tRPC procedure and isolated database", async () => {
    const password = process.env.ADMIN_ACCESS_PASSWORD;
    if (!password) throw new Error("ADMIN_ACCESS_PASSWORD ছাড়া administrator E2E পরীক্ষা চালানো যাবে না");

    await expect(caller(owner).admin.users({ password })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(administrator).admin.users({ password })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "owner@e2e.test", role: "user" })])
    );
  });

  it("enforces owner, editor, viewer, and normalized-email invitation boundaries end to end", async () => {
    const ownerCaller = caller(owner);
    const editorCaller = caller(editor);
    const viewerCaller = caller(viewer);
    const outsiderCaller = caller(outsider);
    const created = await ownerCaller.finance.createHousehold({ name: "E2E পারিবারিক প্রোফাইল" });
    const householdId = created.household.id;

    await expect(viewerCaller.finance.householdOverview({ householdId })).rejects.toThrow("এই পারিবারিক প্রোফাইলে আপনার অনুমতি নেই");
    await expect(editorCaller.finance.inviteHouseholdMember({ householdId, email: "viewer@e2e.test", role: "viewer" })).rejects.toThrow("এই পারিবারিক প্রোফাইলে আপনার অনুমতি নেই");

    const editorInvitationId = await ownerCaller.finance.inviteHouseholdMember({ householdId, email: " Editor@E2E.Test ", displayName: "সম্পাদক", role: "editor" });
    await expect(outsiderCaller.finance.acceptHouseholdInvitation({ membershipId: editorInvitationId })).rejects.toThrow("এই আমন্ত্রণ গ্রহণের অনুমতি আপনার নেই");
    expect(await editorCaller.finance.householdInvitations()).toEqual(expect.arrayContaining([expect.objectContaining({ membershipId: editorInvitationId, role: "editor" })]));

    const editorOverview = await editorCaller.finance.acceptHouseholdInvitation({ membershipId: editorInvitationId });
    expect(editorOverview.currentRole).toBe("editor");
    await expect(editorCaller.finance.inviteHouseholdMember({ householdId, email: "viewer@e2e.test", role: "viewer" })).rejects.toThrow("এই কাজটি করার অনুমতি আপনার নেই");
    await expect(ownerCaller.finance.inviteHouseholdMember({ householdId, email: "editor@e2e.test", role: "editor" })).rejects.toThrow("এই সদস্য ইতিমধ্যে যুক্ত আছেন");
    await expect(editorCaller.finance.saveSharedHouseholdBudget({ householdId, label: "খাদ্য", monthKey: currentMonth, amount: 1000 })).rejects.toThrow("এই কাজটি করার অনুমতি আপনার নেই");

    await ownerCaller.finance.saveSharedHouseholdBudget({ householdId, label: "খাদ্য", monthKey: currentMonth, amount: 1000 });
    const ownerOverview = await ownerCaller.finance.householdOverview({ householdId });
    const budgetId = ownerOverview.sharedBudgets.find(budget => budget.label === "খাদ্য")?.id;
    expect(budgetId).toBeTypeOf("number");
    await editorCaller.finance.addSharedHouseholdExpense({ householdId, budgetId: budgetId!, amount: 250, note: "E2E editor entry", occurredAt: new Date() });

    const viewerInvitationId = await ownerCaller.finance.inviteHouseholdMember({ householdId, email: "viewer@e2e.test", displayName: "দর্শক", role: "viewer" });
    const viewerOverview = await viewerCaller.finance.acceptHouseholdInvitation({ membershipId: viewerInvitationId });
    expect(viewerOverview.currentRole).toBe("viewer");
    await expect(viewerCaller.finance.addSharedHouseholdExpense({ householdId, budgetId: budgetId!, amount: 50, note: "viewer blocked", occurredAt: new Date() })).rejects.toThrow("এই কাজটি করার অনুমতি আপনার নেই");

    const refreshedOwnerOverview = await ownerCaller.finance.householdOverview({ householdId });
    expect(refreshedOwnerOverview.recentExpenses).toEqual(expect.arrayContaining([expect.objectContaining({ contributorUserId: editor.id, amount: "250.00" })]));
  });

  it("previews backups without mutation, requires confirmation, restores into a new project, and preserves the source project", async () => {
    const ownerCaller = caller(owner);
    const sourceProject = await ownerCaller.projects.create({ name: "E2E উৎস হিসাবখাতা" });
    const sourceProjectId = sourceProject.id;
    await ownerCaller.finance.addAccount({ projectId: sourceProjectId, name: "E2E নগদ", type: "cash", openingBalance: 1000 });
    const preparedSource = await ownerCaller.finance.overview({ projectId: sourceProjectId });
    const expenseCategory = preparedSource.categories.find(category => category.type === "expense");
    const account = preparedSource.accounts.find(item => item.name === "E2E নগদ");
    expect(expenseCategory?.id).toBeTypeOf("number");
    expect(account?.id).toBeTypeOf("number");
    await ownerCaller.finance.addTransaction({ projectId: sourceProjectId, categoryId: expenseCategory!.id, accountId: account!.id, type: "expense", amount: 125, paymentMethod: "cash", note: "E2E পুনরুদ্ধার উৎস", occurredAt: new Date() });

    const backup = await ownerCaller.finance.exportProjectBackup({ projectId: sourceProjectId });
    const preview = await ownerCaller.finance.previewProjectBackup({ backup });
    expect(preview).toMatchObject({ sourceProjectName: "E2E উৎস হিসাবখাতা", counts: { accounts: 1, transactions: 1 } });
    await expect(caller(outsider).finance.exportProjectBackup({ projectId: sourceProjectId })).rejects.toThrow("Project not found or access denied");

    const projectsBeforeRejectedRestore = await ownerCaller.projects.list();
    await expect(ownerCaller.finance.restoreProjectBackup({ projectName: "E2E পুনরুদ্ধার", confirmation: "NOT_CONFIRMED" as any, backup })).rejects.toBeTruthy();
    expect((await ownerCaller.projects.list()).map(project => project.id)).toEqual(projectsBeforeRejectedRestore.map(project => project.id));

    const transactionFailureBackup = structuredClone(backup);
    transactionFailureBackup.transactions[0].amount = "999999999999999999999999999999999.99";
    await expect(ownerCaller.finance.restoreProjectBackup({ projectName: "E2E রোলব্যাক", confirmation: "RESTORE_NEW_PROJECT", backup: transactionFailureBackup })).rejects.toBeTruthy();
    expect((await ownerCaller.projects.list()).map(project => project.id)).toEqual(projectsBeforeRejectedRestore.map(project => project.id));

    const restoration = await ownerCaller.finance.restoreProjectBackup({ projectName: "E2E পুনরুদ্ধার", confirmation: "RESTORE_NEW_PROJECT", backup });
    expect(restoration.projectId).not.toBe(sourceProjectId);
    const restoredBackup = await ownerCaller.finance.exportProjectBackup({ projectId: restoration.projectId });
    expect(restoredBackup.project.name).toBe("E2E পুনরুদ্ধার");
    expect(restoredBackup.accounts).toHaveLength(backup.accounts.length);
    expect(restoredBackup.transactions).toHaveLength(backup.transactions.length);
    expect((await ownerCaller.finance.exportProjectBackup({ projectId: sourceProjectId })).project.name).toBe("E2E উৎস হিসাবখাতা");
    await expect(ownerCaller.finance.restoreProjectBackup({ projectName: "E2E পুনরুদ্ধার", confirmation: "RESTORE_NEW_PROJECT", backup })).rejects.toThrow("এই নামে একটি প্রজেক্ট ইতিমধ্যে আছে");

    const db = await getDb();
    if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ হারিয়েছে");
    const [restoredProject] = await db.select().from(users).where(eq(users.id, owner.id)).limit(1);
    expect(restoredProject?.openId).toBe("e2e-owner");
  });
});
