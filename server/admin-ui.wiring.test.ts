import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");

describe("administrator dashboard wiring", () => {
  it("keeps admin data views gated by verified in-memory password state", () => {
    expect(homeSource).toContain("const [adminVerified, setAdminVerified] = useState(false)");
    expect(homeSource).toContain("trpc.admin.verifyAccess.useMutation");
    expect(homeSource).toContain("trpc.admin.auditLogs.useQuery");
    expect(homeSource).toContain("trpc.admin.auditLogExport.useQuery");
    expect(homeSource).toContain("trpc.admin.projects.useQuery");
    expect(homeSource).toContain("const canViewAdminData = canLoadAdminData");
    expect(homeSource).toContain("enabled: canViewAdminData");
    expect(homeSource).toContain("সাম্প্রতিক Audit log");
    expect(homeSource).toContain("const [auditFrom, setAuditFrom] = useState(\"\")");
    expect(homeSource).toContain("const [auditTo, setAuditTo] = useState(\"\")");
    expect(homeSource).toContain("const [auditActorUserId, setAuditActorUserId] = useState(\"all\")");
    expect(homeSource).toContain("ফিল্টার পরিষ্কার করুন");
    expect(homeSource).toContain("সব ব্যবহারকারী");
    expect(homeSource).toContain("const [auditPage, setAuditPage] = useState(1)");
    expect(homeSource).toContain("CSV ডাউনলোড");
    expect(homeSource).toContain("PDF ডাউনলোড");
    expect(homeSource).toContain("আগের পৃষ্ঠা");
    expect(homeSource).toContain("পরের পৃষ্ঠা");
    expect(homeSource).toContain("adminLogs.isError");
    expect(homeSource).toContain("Audit log লোড করা যায়নি");
    expect(homeSource).toContain("সব প্রজেক্ট");
    expect(homeSource).toContain("নিবন্ধিত ব্যবহারকারী");
  });
});
