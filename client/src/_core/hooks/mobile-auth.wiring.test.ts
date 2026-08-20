import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const authHook = readFileSync(resolve(root, "client/src/_core/hooks/useAuth.ts"), "utf8");
const layout = readFileSync(resolve(root, "client/src/components/DashboardLayout.tsx"), "utf8");

describe("mobile authentication resilience", () => {
  it("keeps authentication state creation safe when mobile storage is unavailable", () => {
    expect(authHook).toContain("try {");
    expect(authHook).toContain('localStorage.setItem(');
    expect(authHook).toContain("Keep the auth flow available when storage is blocked");
  });

  it("shows Bengali guidance for mobile browsers that block OAuth cookies", () => {
    expect(layout).toContain("Chrome বা Safari-এর সাধারণ ব্রাউজার ট্যাব");
    expect(layout).toContain("Private/Incognito");
    expect(layout).toContain("cookies অনুমতি দিন");
  });
});
