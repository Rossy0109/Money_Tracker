import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const activeProject = read("client/src/lib/activeProject.ts");
const main = read("client/src/main.tsx");
const vouchers = read("client/src/pages/Vouchers.tsx");
const automation = read("client/src/pages/FinanceAutomation.tsx");

/**
 * DashboardLayout mounts useOfflineSync -> useActiveProject on every route,
 * including the logged-out landing page. Ungated, tRPC batched projects.list
 * with auth.me and the 401 surfaced as a console error plus a "Please login"
 * toast for a visitor who had simply not signed in. Protected queries must
 * wait for the session to resolve, while genuine failures stay visible.
 */
describe("protected query session gating", () => {
  it("waits for the session before requesting projects in useActiveProject", () => {
    expect(activeProject).toContain("enabled: isAuthenticated");
    expect(activeProject).toContain("retry: false");
    expect(activeProject).toContain(
      "activeProjectId: isAuthenticated ? activeProjectId : null"
    );
    // the session stays authoritative — no optimistic "assume logged in" path
    expect(activeProject).not.toMatch(/enabled:\s*true/);
  });

  it("gates the standalone project queries on the other two call sites", () => {
    expect(vouchers).toContain("enabled: isAuthenticated");
    expect(automation).toContain("enabled: isAuthenticated");
    expect(automation).toContain("useAuth()");
  });

  it("keeps real query failures visible instead of silencing them", () => {
    expect(main).toContain('console.error("[API Query Error]", error)');
    expect(main).toContain("notifyNetworkError(error, dispatchToast");
  });
});
