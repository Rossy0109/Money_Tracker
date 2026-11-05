import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/ProjectMembers.tsx"),
  "utf8"
);
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

describe("project membership (W-1) wiring", () => {
  it("covers invite, accept, list, revoke and shared-project navigation", () => {
    expect(pageSource).toContain("trpc.finance.projectInvitations.useQuery");
    expect(pageSource).toContain("trpc.finance.projectMembers.useQuery");
    expect(pageSource).toContain(
      "trpc.finance.inviteProjectMember.useMutation"
    );
    expect(pageSource).toContain(
      "trpc.finance.acceptProjectInvitation.useMutation"
    );
    expect(pageSource).toContain(
      "trpc.finance.updateProjectMember.useMutation"
    );
    expect(pageSource).toContain('href="/vouchers"');
  });

  it("labels the maker and checker roles", () => {
    expect(pageSource).toContain("প্রস্তুতকারক");
    expect(pageSource).toContain("অনুমোদনকারী");
  });

  it("is reachable from routing and the dashboard navigation", () => {
    expect(routerSource).toContain('path={"/project-members"}');
    expect(sidebarSource).toContain('href: "/project-members"');
  });

  it("shows member projects in the voucher workspace selector", () => {
    expect(vouchersSource).toContain("project.role");
    expect(vouchersSource).toContain("প্রস্তুতকারক");
    expect(vouchersSource).toContain("অনুমোদনকারী");
  });
});
