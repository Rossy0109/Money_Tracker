import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const useAuthSource = readFileSync(
  resolve(process.cwd(), "client/src/_core/hooks/useAuth.ts"),
  "utf8"
);
const layoutSource = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);

/**
 * Regression pins for session-check failure handling:
 *  - useAuth must expose the auth.me error separately from
 *    logout failures so a dead session is distinguishable,
 *  - DashboardLayout must forward it to AuthCard with a retry
 *    callback,
 *  - the loading gate must announce itself to assistive
 *    technology instead of being a bare animated icon.
 */
describe("session-check failure surfacing", () => {
  it("useAuth exposes session errors separately from logout errors", () => {
    expect(useAuthSource).toContain(
      "sessionError: meQuery.error?.message ?? null"
    );
  });

  it("DashboardLayout passes the session error and retry to AuthCard", () => {
    expect(layoutSource).toContain(
      "sessionError, refresh } = useAuth()"
    );
    expect(layoutSource).toContain("sessionError={sessionError}");
    expect(layoutSource).toContain("onRetrySession={refresh}");
  });

  it("announces the loading state to assistive technology", () => {
    expect(layoutSource).toContain('role="status"');
    expect(layoutSource).toContain("sr-only");
    expect(layoutSource).toContain("লোড হচ্ছে…");
  });
});
