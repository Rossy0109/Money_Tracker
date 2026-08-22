import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const automationSource = readFileSync(resolve(process.cwd(), "client/src/pages/FinanceAutomation.tsx"), "utf8");
const sidebarSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

describe("finance automation workspace wiring", () => {
  it("uses the selected project for recurring templates, reminders, and debt or receivable ageing", () => {
    expect(automationSource).toContain("trpc.finance.automationOverview.useQuery({ projectId }");
    expect(automationSource).toContain("trpc.finance.addRecurringTemplate.useMutation");
    expect(automationSource).toContain("trpc.finance.enableBillReminder.useMutation");
    expect(automationSource).toContain("trpc.finance.generateRecurringNow.useMutation");
    expect(automationSource).toContain("দেনা ও পাওনার বয়সভিত্তিক অবস্থা");
  });

  it("keeps primary controls practical for mobile touch use and exposes sidebar navigation", () => {
    expect(automationSource).toContain("className=\"h-11 rounded-xl");
    expect(automationSource).toContain("sm:grid-cols-2");
    expect(sidebarSource).toContain('href: "/automation"');
    expect(sidebarSource).toContain("নিয়মিত হিসাব ও বিল");
  });
});
