import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

describe("Bengali data-entry discoverability", () => {
  it("provides prominent transaction-entry controls that use the shared secure dialog opener", () => {
    expect(homeSource).toContain("function openNewTransaction()");
    expect(homeSource).toContain("লেনদেন যোগ করুন");
    expect(homeSource).toContain("এখনই লেনদেন যোগ করুন");
    expect(homeSource).toContain("onClick={openNewTransaction}");
    expect(homeSource).toContain("onAdd={openNewTransaction}");
  });

  it("explains related data-entry locations and keeps a persistent navigation path", () => {
    expect(homeSource).toContain("দ্রুত ডেটা এন্ট্রি");
    expect(homeSource).toContain("অ্যাকাউন্ট, বাজেট ও বিল যোগ করার বাটন");
    expect(layoutSource).toContain("নতুন লেনদেন যোগ করুন");
    expect(layoutSource).toContain('href="#transactions"');
  });
});
