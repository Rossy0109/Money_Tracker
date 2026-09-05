import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const payrollSource = readFileSync(
  new URL("Payroll.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../App.tsx", import.meta.url),
  "utf8"
);
const dashboardLayoutSource = readFileSync(
  new URL("../components/DashboardLayout.tsx", import.meta.url),
  "utf8"
);

describe("Payroll (কর্মচারী ও বেতন ব্যবস্থাপনা) wiring and capabilities", () => {
  it("registers /payroll route and sidebar navigation", () => {
    expect(appSource).toContain('path={"/payroll"} component={Payroll}');
    expect(dashboardLayoutSource).toContain('label: "কর্মচারী ও বেতন", href: "/payroll"');
  });

  it("includes employee list, salary disbursement, advances and payslip download", () => {
    expect(payrollSource).toContain("কর্মচারী ও বেতন ব্যবস্থাপনা (Payroll)");
    expect(payrollSource).toContain("trpc.finance.employeesList.useQuery");
    expect(payrollSource).toContain("trpc.finance.salaryPaymentsList.useQuery");
    expect(payrollSource).toContain("trpc.finance.employeeAdvancesList.useQuery");
    expect(payrollSource).toContain("trpc.finance.disburseSalary.useMutation");
    expect(payrollSource).toContain("generatePayslipPdf");
  });
});
