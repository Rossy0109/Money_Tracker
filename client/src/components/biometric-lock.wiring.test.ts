import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lockSource = readFileSync(resolve(process.cwd(), "client/src/components/BiometricLock.tsx"), "utf8");
const layoutSource = readFileSync(resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"), "utf8");

describe("biometric lock security wiring", () => {
  it("implements WebAuthn platform authenticator verification and challenge generation", () => {
    expect(lockSource).toContain("PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable");
    expect(lockSource).toContain("navigator.credentials.create");
    expect(lockSource).toContain("navigator.credentials.get");
    expect(lockSource).toContain("userVerification: \"required\"");
    expect(lockSource).toContain("authenticatorAttachment: \"platform\"");
  });

  it("integrates biometric toggle and full-screen lock screen into DashboardLayout", () => {
    expect(layoutSource).toContain("useBiometricLock(user?.email)");
    expect(layoutSource).toContain("<BiometricLockScreen onUnlock={unlockApp} />");
    expect(layoutSource).toContain("ফিঙ্গারপ্রিন্ট লক");
    expect(layoutSource).toContain("lockApp");
  });
});
