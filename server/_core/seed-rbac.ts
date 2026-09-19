import { databaseRequired, getDb, logAudit } from "../db";
import { eq } from "drizzle-orm";
import { roles, permissions, rolePermissions, userRoles } from "../../drizzle/schema";
import { ROLE_PERMISSIONS, ROLE_NAMES } from "./permissions";

/**
 * Seed default RBAC roles and permissions.
 * This function is idempotent - can be run multiple times safely.
 */
export async function seedDefaultRBAC() {
  const db = databaseRequired(await getDb());

  // Check if already seeded
  const existingRoles = await db.select().from(roles).limit(1);
  if (existingRoles.length > 0) return;

  // Collect all unique permissions from ROLE_PERMISSIONS
  const allPermissionNamesSet = new Set<string>();
  for (const perms of Object.values(ROLE_PERMISSIONS)) {
    for (const p of perms) allPermissionNamesSet.add(p);
  }
  const allPermissionNames = Array.from(allPermissionNamesSet);

  // Permission metadata
  const permissionMeta: Record<string, { displayName: string; category: string; description: string }> = {
    "auth.login": { displayName: "Login", category: "auth", description: "User login" },
    "auth.logout": { displayName: "Logout", category: "auth", description: "User logout" },
    "voucher.read": { displayName: "Read Voucher", category: "voucher", description: "View vouchers" },
    "voucher.create": { displayName: "Create Voucher", category: "voucher", description: "Create vouchers" },
    "voucher.submit": { displayName: "Submit Voucher", category: "voucher", description: "Submit vouchers for approval" },
    "voucher.approve": { displayName: "Approve Voucher", category: "voucher", description: "Approve vouchers" },
    "voucher.post": { displayName: "Post Voucher", category: "voucher", description: "Post vouchers to ledger" },
    "voucher.reverse": { displayName: "Reverse Voucher", category: "voucher", description: "Reverse posted vouchers" },
    "ledger.read": { displayName: "Read Ledger", category: "ledger", description: "View ledger entries" },
    "ledger.export": { displayName: "Export Ledger", category: "ledger", description: "Export ledger data" },
    "audit.read": { displayName: "Read Audit", category: "audit", description: "View audit logs" },
    "audit.export": { displayName: "Export Audit", category: "audit", description: "Export audit logs" },
    "user.read": { displayName: "Read Users", category: "user", description: "View users" },
    "user.create": { displayName: "Create Users", category: "user", description: "Create users" },
    "user.update": { displayName: "Update Users", category: "user", description: "Update users" },
    "user.suspend": { displayName: "Suspend Users", category: "user", description: "Suspend/activate users" },
    "backup.create": { displayName: "Create Backup", category: "backup", description: "Create backups" },
    "backup.restore": { displayName: "Restore Backup", category: "backup", description: "Restore from backup" },
    "settings.manage": { displayName: "Manage Settings", category: "settings", description: "Manage system settings" },
  };

  // Insert permissions
  for (const permName of allPermissionNames) {
    const meta = permissionMeta[permName];
    if (!meta) continue;
    await db.insert(permissions).values({
      name: permName,
      displayName: meta.displayName,
      category: meta.category,
      description: meta.description,
    }).onDuplicateKeyUpdate({
      set: {
        displayName: meta.displayName,
        description: meta.description,
        category: meta.category,
      },
    });
  }

  // Insert roles
  const SYSTEM_ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN"] as const;

  const roleIdMap = new Map<string, number>();
  for (const roleName of Object.values(ROLE_NAMES)) {
    await db.insert(roles).values({
      name: roleName,
      displayName: roleName,
      description: "",
      isSystem: ["SUPER_ADMIN", "SYSTEM_ADMIN"].includes(roleName),
    }).onDuplicateKeyUpdate({ set: { name: roleName } });
    const [inserted] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName)).limit(1);
    if (inserted) roleIdMap.set(roleName, inserted.id);
  }

  // Role-permission mappings
  const rolePermissionMap: Record<string, string[]> = {
    SUPER_ADMIN: [
      "auth.login", "auth.logout", "user.read", "user.create", "user.update", "user.suspend",
      "accounting.read", "accounting.create", "accounting.update", "accounting.delete",
      "budget.read", "budget.create", "budget.update", "budget.approve",
      "payroll.read", "payroll.create", "payroll.update", "payroll.approve",
      "voucher.read", "voucher.create", "voucher.submit", "voucher.approve", "voucher.post", "voucher.reverse",
      "ledger.read", "ledger.export",
      "audit.read", "audit.export",
      "backup.create", "backup.restore",
      "settings.manage", "role.manage", "permission.manage",
    ],
    SYSTEM_ADMIN: [
      "auth.login", "auth.logout", "user.read", "user.create", "user.update", "user.suspend",
      "backup.create", "backup.restore", "settings.manage",
      "role.manage", "permission.manage",
    ],
    ACCOUNTING_ADMIN: [
      "accounting.read", "accounting.create", "accounting.update", "accounting.delete",
      "budget.read", "budget.create", "budget.update", "budget.approve",
      "voucher.read", "voucher.create", "voucher.submit", "voucher.approve", "voucher.post", "voucher.reverse",
      "ledger.read", "ledger.export",
      "audit.read", "audit.export",
    ],
    HR_ADMIN: [
      "user.read", "user.create", "user.update", "user.suspend",
      "payroll.read", "payroll.create", "payroll.update", "payroll.approve",
    ],
    MANAGER: [
      "accounting.read", "accounting.create", "accounting.update",
      "budget.read", "budget.create", "budget.update",
      "voucher.read", "voucher.create", "voucher.submit", "voucher.approve",
      "ledger.read",
      "audit.read",
    ],
    INPUT_OPERATOR: [
      "auth.login",
      "auth.logout",
      "accounting.create",
      "payroll.create",
      "voucher.create",
      "budget.create",
    ],
    VIEWER: [
      "accounting.read",
      "budget.read",
      "voucher.read",
      "ledger.read",
      "audit.read",
    ],
  };

  // Assign permissions to roles
  for (const [roleName, perms] of Object.entries(rolePermissionMap)) {
    const roleId = roleIdMap.get(roleName);
    if (!roleId) continue;

    for (const permName of perms) {
      const [perm] = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, permName)).limit(1);
      if (perm) {
        await db.insert(rolePermissions).values({
          roleId,
          permissionId: perm.id,
        }).onDuplicateKeyUpdate({ set: { roleId, permissionId: perm.id } });
      }
    }
  }

  await logAudit({
    actorUserId: 0,
    action: "create",
    entityType: "rbac_seed",
    summary: "Default RBAC roles and permissions seeded",
  });
}