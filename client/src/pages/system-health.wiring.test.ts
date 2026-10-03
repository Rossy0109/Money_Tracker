import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { containsSnippet } from "@shared/sourceText";

const readRepoFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const appSource = readRepoFile("client/src/App.tsx");
const sidebarSource = readRepoFile("client/src/components/DashboardLayout.tsx");
const pageSource = readRepoFile("client/src/pages/SystemHealth.tsx");
const systemRouterSource = readRepoFile("server/_core/systemRouter.ts");

describe("system health panel wiring", () => {
  it("routes /health to the lazily loaded panel", () => {
    expect(appSource).toContain(
      'const SystemHealth = lazy(() => import("./pages/SystemHealth"));'
    );
    expect(appSource).toContain(
      '<Route path={"/health"} component={SystemHealth} />'
    );
  });

  it("keeps the panel discoverable in the Bengali sidebar, gated on settings.view", () => {
    expect(sidebarSource).toContain('href: "/health"');
    expect(sidebarSource).toContain("সিস্টেম হেলথ");
    expect(
      containsSnippet(
        sidebarSource,
        'href: "/health",\n    permission: "settings.view",'
      )
    ).toBe(true);
  });

  it("mirrors that same permission in the page before it asks the API", () => {
    expect(pageSource).toContain('hasPermission(user, "settings.view")');
    expect(pageSource).toContain(
      "trpc.system.healthReport.useQuery(undefined, {"
    );
    expect(pageSource).toContain("enabled: canViewHealth");
    expect(pageSource).toContain("report.refetch()");
    expect(pageSource).not.toContain("isAdminUser");
  });

  it("renders whatever the report contains instead of a fixed check list", () => {
    expect(pageSource).toContain("data.checks.map(");
    expect(pageSource).toContain("Object.entries(data.summary)");
    expect(pageSource).toContain("data?.overallStatus");
    expect(pageSource).toContain("data.integrity");
    expect(pageSource).toContain("responsive-table-container");
    // No hard-coded probe ids: the server owns the list and may grow it.
    expect(pageSource).not.toContain('check.id === "database.read"');
    expect(pageSource).not.toContain('"backup.restoreDrill"');
  });

  it("gates the API procedure on the sidebar's permission for the caller", () => {
    expect(systemRouterSource).toContain(
      'permissionProcedure.require("settings.view")'
    );
    expect(systemRouterSource).toContain("runHealthChecks(ctx.user!.id)");
    expect(systemRouterSource).toContain("protectedProcedure");
  });
});
