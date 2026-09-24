import { describe, expect, it } from "vitest";
import { getPermissionsForRole } from "../shared/rbac";

/**
 * Backup self-service contract: the finance power role can export and
 * restore its own project backups (all backup procedures are additionally
 * ownership-scoped server-side), while read-only and create-only roles
 * cannot. The self-healing seed (seedDefaultRBAC) propagates this catalog
 * to every database on boot — no migration needed.
 */
describe("backup permission grants", () => {
  it("lets ACCOUNTING_ADMIN export and restore backups", () => {
    const perms = getPermissionsForRole("ACCOUNTING_ADMIN");
    expect(perms).toContain("backup.view");
    expect(perms).toContain("backup.create");
    expect(perms).toContain("backup.restore");
  });

  it("keeps platform admins fully capable", () => {
    for (const role of ["SUPER_ADMIN", "SYSTEM_ADMIN"] as const) {
      const perms = getPermissionsForRole(role);
      expect(perms).toEqual(
        expect.arrayContaining([
          "backup.view",
          "backup.create",
          "backup.restore",
        ])
      );
    }
  });

  it("withholds backup mutation from viewer, manager, and input roles", () => {
    for (const role of [
      "VIEWER",
      "MANAGER",
      "INPUT_OPERATOR",
      "HR_ADMIN",
    ] as const) {
      const perms = getPermissionsForRole(role);
      expect(perms).not.toContain("backup.create");
      expect(perms).not.toContain("backup.restore");
    }
  });
});
