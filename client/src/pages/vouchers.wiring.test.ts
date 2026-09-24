import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vouchersSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Vouchers.tsx"),
  "utf8"
);
const routerSource = readFileSync(
  resolve(process.cwd(), "client/src/App.tsx"),
  "utf8"
);
const sidebarSource = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);

describe("voucher workspace wiring", () => {
  it("covers the full lifecycle: list, create, submit, approve, post, reverse", () => {
    expect(vouchersSource).toContain("trpc.finance.voucherList.useQuery");
    expect(vouchersSource).toContain("trpc.finance.createVoucher.useMutation");
    expect(vouchersSource).toContain("trpc.finance.submitVoucher.useMutation");
    expect(vouchersSource).toContain("trpc.finance.approveVoucher.useMutation");
    expect(vouchersSource).toContain("trpc.finance.postVoucher.useMutation");
    expect(vouchersSource).toContain("trpc.finance.reverseVoucher.useMutation");
  });

  it("gates actions on voucher permissions and explains maker-checker", () => {
    expect(vouchersSource).toContain('"voucher.submit"');
    expect(vouchersSource).toContain('"voucher.approve"');
    expect(vouchersSource).toContain('"voucher.post"');
    expect(vouchersSource).toContain('"voucher.reverse"');
    expect(vouchersSource).toContain("চার-চোখ");
  });

  it("is reachable from routing and the dashboard navigation", () => {
    expect(routerSource).toContain('path={"/vouchers"}');
    expect(sidebarSource).toContain('href: "/vouchers"');
    expect(sidebarSource).toContain("ভাউচার");
  });
});
