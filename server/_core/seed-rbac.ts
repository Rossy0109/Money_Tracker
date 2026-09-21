import { databaseRequired, getDb, logAudit } from "../db";
import { eq } from "drizzle-orm";
import { roles, permissions, rolePermissions } from "../../drizzle/schema";
import { ROLE_PERMISSIONS, ROLE_NAMES, PERMISSION_GROUPS, categoryForPermission } from "@shared/rbac";
import { clearRBACCache } from "./rbac";

const SYSTEM_ROLE_NAMES = new Set<string>([ROLE_NAMES.SUPER_ADMIN, ROLE_NAMES.SYSTEM_ADMIN]);

/** "accounting.create" → "Accounting Create"; "auth.login" → "Auth Login". */
function displayNameForPermission(permission: string): string {
  const [resource, action] = permission.split(".");
  if (!action) return permission;
  const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${capitalized(resource)} ${capitalized(action)}`.trim();
}

/**
 * Seed (and continually reconcile) the default RBAC roles, permissions and
 * role→permission grants.
 *
 * Self-healing by design:
 *  - Unlike the original implementation it does NOT early-return when a role
 *    row already exists; on every run it upserts the full catalog derived from
 *    `shared/rbac.ts` so previously-missed grants (e.g. `accounting.*`,
 *    `budget.*`, `payroll.*` for INPUT_OPERATOR) are repaired automatically.
 *  - It is strictly additive: it never deletes roles, permissions, or grants.
 *    Administrator-customized grants are preserved.
 */
export async function seedDefaultRBAC() {
  const db = databaseRequired(await getDb());

  const allPermissionNames = Object.values(PERMISSION_GROUPS).flat();
  const usedPermissionNames = Object.values(ROLE_PERMISSIONS).flat();
  const catalog = Array.from(new Set([...allPermissionNames, ...usedPermissionNames]));

  let changed = false;

  // Upsert permissions from the shared catalog.
  for (const permName of catalog) {
    const result = await db.insert(permissions).values({
      name: permName,
      displayName: displayNameForPermission(permName),
      description: null,
      category: categoryForPermission(permName),
    }).onDuplicateKeyUpdate({
      set: {
        displayName: displayNameForPermission(permName),
        category: categoryForPermission(permName),
      },
    });
    if (Number(result[0]?.affectedRows ?? 0) > 0) changed = true;
  }

  // Upsert roles.
  const roleIdMap = new Map<string, number>();
  for (const roleName of Object.values(ROLE_NAMES)) {
    await db.insert(roles).values({
      name: roleName,
      displayName: roleName,
      description: "",
      isSystem: SYSTEM_ROLE_NAMES.has(roleName),
    }).onDuplicateKeyUpdate({ set: { name: roleName, isSystem: SYSTEM_ROLE_NAMES.has(roleName) } });
    const [inserted] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleName)).limit(1);
    if (inserted) roleIdMap.set(roleName, inserted.id);
  }

  // Upsert role→permission grants from the shared matrix.
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdMap.get(roleName);
    if (!roleId) continue;
    for (const permName of perms) {
      const [perm] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.name, permName))
        .limit(1);
      if (!perm) continue;
      await db.insert(rolePermissions).values({
        roleId,
        permissionId: perm.id,
      }).onDuplicateKeyUpdate({ set: { roleId, permissionId: perm.id } });
    }
  }

  // Keep the runtime RBAC cache in sync with the (possibly repaired) DB state.
  clearRBACCache();

  if (changed) {
    await logAudit({
      actorUserId: 0,
      action: "create",
      entityType: "rbac_seed",
      summary: "Default RBAC roles, permissions and grants reconciled from shared catalog",
    });
  }
}