import { databaseRequired, getDb } from "./dbConnection";
import { eq, and } from "drizzle-orm";
import {
  permissions,
  roles,
  rolePermissions,
  userRoles,
} from "../../drizzle/schema";
import { ROLE_NAMES } from "@shared/rbac";

export { ROLE_NAMES };
export type { RoleName, PermissionName } from "@shared/rbac";

let rbacStartupDenied = false;

export function markRBACUnavailable(): void {
  rbacStartupDenied = true;
}

export function markRBACReady(): void {
  rbacStartupDenied = false;
}

function assertRBACReady(): void {
  if (rbacStartupDenied) throw new Error("RBAC initialization unavailable");
}

export async function initializeRBAC(): Promise<void> {
  markRBACReady();
}

/**
 * Get all permissions for a user by their userId.
 * Checks user's roles and aggregates permissions.
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  assertRBACReady();

  const db = databaseRequired(await getDb());
  const records = await db
    .select({ name: permissions.name })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  // Sorted: the join has no guaranteed order, and `auth.me` is a client-facing
  // contract that tests and UI lists compare as a whole.
  return Array.from(new Set(records.map(record => record.name))).sort();
}

/**
 * Check if user has a specific permission.
 */
export async function hasPermission(
  userId: number,
  permissionName: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionName);
}

/**
 * Check if user has any of the given permissions (OR logic).
 */
export async function hasAnyPermission(
  userId: number,
  permissionNames: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionNames.some(p => permissions.includes(p));
}

/**
 * Check if user has all of the given permissions (AND logic).
 */
export async function hasAllPermissions(
  userId: number,
  permissionNames: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionNames.every(p => permissions.includes(p));
}

/**
 * Get all roles for a user.
 */
export async function getUserRoles(userId: number): Promise<string[]> {
  assertRBACReady();

  const db = databaseRequired(await getDb());
  const records = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  return Array.from(new Set(records.map(record => record.name))).sort();
}

/**
 * Check if user has a specific role.
 */
export async function hasRole(
  userId: number,
  roleName: string
): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(roleName);
}

/**
 * Assign a role to a user.
 */
export async function assignRole(
  userId: number,
  roleName: string,
  assignedBy: number
): Promise<boolean> {
  const db = databaseRequired(await getDb());
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) throw new Error(`Role not found: ${roleName}`);

  const result = await db
    .insert(userRoles)
    .values({
      userId,
      roleId: role.id,
      assignedBy,
    })
    .onDuplicateKeyUpdate({ set: { roleId: role.id, assignedBy } });
  return Number(result[0]?.affectedRows ?? 0) === 1;
}

/**
 * Remove a role from a user.
 */
export async function removeRole(
  userId: number,
  roleName: string
): Promise<void> {
  const db = databaseRequired(await getDb());
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);

  if (!role) throw new Error(`Role not found: ${roleName}`);

  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
}

export function clearRBACCache(): void {
  return undefined;
}

export async function isSuperAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.SUPER_ADMIN);
}

export async function isSystemAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.SYSTEM_ADMIN);
}

export async function isAccountingAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.ACCOUNTING_ADMIN);
}

export async function isHRAdmin(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.HR_ADMIN);
}

export async function isManager(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.MANAGER);
}

export async function isInputOperator(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.INPUT_OPERATOR);
}

export async function isViewer(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.VIEWER);
}

/**
 * True when the user holds a super-administrative RBAC role. SYSTEM_ADMIN is a
 * privileged admin account (users/backup/settings) but has no financial write
 * authority, so it is deliberately excluded from the "finance admin" set.
 */
export async function isFinanceAdmin(userId: number): Promise<boolean> {
  return (
    hasRole(userId, ROLE_NAMES.SUPER_ADMIN) ||
    hasRole(userId, ROLE_NAMES.ACCOUNTING_ADMIN)
  );
}

/** Super or system administrator — the administrative role set. */
export async function isAdminRoleUser(userId: number): Promise<boolean> {
  return (
    hasRole(userId, ROLE_NAMES.SUPER_ADMIN) ||
    hasRole(userId, ROLE_NAMES.SYSTEM_ADMIN)
  );
}
