import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(resolve(import.meta.dirname, "db.ts"), "utf8");

function functionSource(name: string) {
  const start = dbSource.indexOf(`export async function ${name}`);
  const end = dbSource.indexOf("\nexport async function ", start + 1);
  expect(start, `${name} should exist in the finance data layer`).toBeGreaterThanOrEqual(0);
  return dbSource.slice(start, end === -1 ? undefined : end);
}

describe("household authorization and accounting boundaries", () => {
  it("requires a pending invitation to match the signed-in user's normalized email before acceptance", () => {
    const source = functionSource("acceptHouseholdInvitation");
    expect(source).toContain('membership.status !== "pending"');
    expect(source).toContain("normalizeEmail(currentUser.email) !== normalizeEmail(membership.inviteeEmail)");
    expect(source).toContain("status: \"active\"");
  });

  it("keeps member, invite, and budget management owner-only while limiting expense entry to owners and editors", () => {
    for (const name of ["inviteHouseholdMember", "updateHouseholdMember", "saveSharedBudget"]) {
      expect(functionSource(name)).toContain('requireHouseholdRole(access.role, ["owner"])');
    }
    expect(functionSource("addSharedExpense")).toContain('requireHouseholdRole(access.role, ["owner", "editor"])');
    expect(dbSource).toContain('if (!allowed.includes(role)) throw new Error("এই কাজটি করার অনুমতি আপনার নেই")');
  });

  it("counts and displays only expenses in the current month for the current household budget set", () => {
    const source = functionSource("getHouseholdOverview");
    expect(source).toContain("const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`)");
    expect(source).toContain("gte(financeSharedExpenses.occurredAt, monthStart)");
    expect(source).toContain("lt(financeSharedExpenses.occurredAt, nextMonthStart)");
    expect(source).toContain("activeBudgetIds.has(expense.budgetId)");
    expect(source).toContain("recentExpenses: expenses.slice(0, 20)");
  });
});
