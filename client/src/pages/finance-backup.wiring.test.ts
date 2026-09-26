import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { containsSnippet } from "@shared/sourceText";

const backupSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/FinanceBackup.tsx"),
  "utf8"
);
const sidebarSource = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);

describe("project backup and restoration wiring", () => {
  it("uses project-scoped export, validation preview, and confirmation-gated restoration", () => {
    expect(
      containsSnippet(backupSource, "trpc.finance.exportProjectBackup.useQuery")
    ).toBe(true);
    // Project-scoped: the query is keyed by the active project, never a global.
    expect(containsSnippet(backupSource, "{ projectId }")).toBe(true);
    expect(backupSource).toContain(
      "trpc.finance.previewProjectBackup.useMutation()"
    );
    expect(backupSource).toContain(
      "trpc.finance.restoreProjectBackup.useMutation"
    );
    expect(backupSource).toContain("RESTORE_NEW_PROJECT");
    expect(backupSource).toContain("বিদ্যমান হিসাব বদলাবে না");
  });

  it("keeps backup and restoration discoverable in the Bengali dashboard navigation", () => {
    expect(sidebarSource).toContain('href: "/backup"');
    expect(sidebarSource).toContain("ব্যাকআপ ও পুনরুদ্ধার");
  });

  it("gates the backup page and actions on backup permissions, not a legacy admin flag", () => {
    expect(backupSource).toContain('"backup.view"');
    expect(backupSource).toContain('"backup.create"');
    expect(backupSource).toContain('"backup.restore"');
    expect(backupSource).not.toContain("isAdminUser");
  });
});
