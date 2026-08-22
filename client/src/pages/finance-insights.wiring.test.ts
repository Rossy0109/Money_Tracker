import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/FinanceInsights.tsx"), "utf8");

describe("finance insights workspace wiring", () => {
  it("uses protected project-scoped planning, analytics, and transaction-search queries", () => {
    expect(source).toContain("trpc.finance.budgetPlan.useQuery");
    expect(source).toContain("trpc.finance.analytics.useQuery");
    expect(source).toContain("trpc.finance.searchTransactions.useQuery");
    expect(source).toContain("projectId");
  });

  it("keeps plan adoption user-controlled and exposes Bengali search filters", () => {
    expect(source).toContain("আপনার ক্লিক ছাড়া কোনো বাজেট বদলানো হবে না");
    expect(source).toContain("প্রস্তাব নিন");
    expect(source).toContain("বিবরণ বা ভাউচার নম্বর");
    expect(source).toContain("ফিল্টার প্রয়োগ করুন");
  });
});
