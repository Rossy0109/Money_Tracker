import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const getCombinedHomeSource = () => {
  const home = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
  const dashboardDir = resolve(import.meta.dirname, "../client/src/components/dashboard");
  const dialogsDir = resolve(dashboardDir, "dialogs");
  let combined = home;
  for (const dir of [dashboardDir, dialogsDir]) {
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          combined += "\n" + readFileSync(resolve(dir, file), "utf8");
        }
      }
    } catch {}
  }
  return combined;
};

const homeSource = getCombinedHomeSource();

describe("administrator dashboard wiring", () => {
  it("keeps admin data views gated by verified in-memory password state", () => {
    expect(homeSource).toContain("const [adminVerified, setAdminVerified] = useState(false)");
    expect(homeSource).toContain("trpc.admin.verifyAccess.useMutation");
    expect(homeSource).toContain("trpc.admin.auditLogs.useQuery");
    expect(homeSource).toContain("trpc.admin.auditLogExport.useQuery");
    expect(homeSource).toContain("trpc.admin.auditActivity.useQuery");
    expect(homeSource).toContain("trpc.admin.projects.useQuery");
    expect(homeSource).toContain("const canViewAdminData = canLoadAdminData");
    expect(homeSource).toContain("enabled: canViewAdminData");
    expect(homeSource).toContain("সাম্প্রতিক Audit log");
    expect(homeSource).toContain("const [auditDateRange, setAuditDateRange] = useState<DateRange | undefined>");
    expect(homeSource).toContain("setAuditDateRange");
    expect(homeSource).toContain("const [auditSearch, setAuditSearch] = useState(\"\")");
    expect(homeSource).toContain("const [auditActorUserId, setAuditActorUserId] = useState(\"all\")");
    expect(homeSource).toContain("ফিল্টার পরিষ্কার করুন");
    expect(homeSource).toContain("সব ব্যবহারকারী");
    expect(homeSource).toContain("কাজ বা কিওয়ার্ড খুঁজুন");
    expect(homeSource).toContain('mode="range"');
    expect(homeSource).toContain("ব্যবহারকারী বা ভূমিকা");
    expect(homeSource).toContain("কোন কাজ বেশি হয়েছে");
    expect(homeSource).toContain("auditActorRole");
    expect(homeSource).toContain("প্রোফাইলের প্রজেক্ট");
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
