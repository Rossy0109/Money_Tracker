import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

describe("dashboard biometric lock removal and logo wiring", () => {
  it("verifies fingerprint biometric lock is completely removed from DashboardLayout", () => {
    expect(layoutSource).not.toContain("useBiometricLock");
    expect(layoutSource).not.toContain("<BiometricLockScreen");
    expect(layoutSource).not.toContain("ফিঙ্গারপ্রিন্ট লক");
    expect(layoutSource).not.toContain("lockApp");
  });

  it("integrates custom logo management in DashboardLayout", () => {
    expect(layoutSource).toContain("useAppLogo");
    expect(layoutSource).toContain("logoUrl");
  });
});
