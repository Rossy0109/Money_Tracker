import { databaseRequired, getDb } from "./dbConnection";
import { eq, and } from "drizzle-orm";
import { permissions, roles, rolePermissions, userRoles } from "../../drizzle/schema";
import { ROLE_NAMES } from "@shared/rbac";

export { ROLE_NAMES };
export type { RoleName, PermissionName } from "@shared/rbac";

// In-memory cache for role → permissions (populated at startup).
const roleCache: Map<number, { name: string; permissions: string[] }> = new Map();
let initialized = false;

/**
 * Initialize the RBAC cache from database.
 * Call this at application startup.
 */
export async function initializeRBAC(): Promise<void> {
  if (initialized) return;
  
  const db = databaseRequired(await getDb());
  
  // Select explicit columns (never `*`): legacy DBs may have created these
  // tables without `updatedAt`, so a blind `select()` would error on them.
  const allPermissions = await db
    .select({ id: permissions.id, name: permissions.name })
    .from(permissions);
  const allRoles = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles);
  const allRolePermissions = await db
    .select({ roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId })
    .from(rolePermissions);
  
  // Build permission lookup
  const permissionMap = new Map(allPermissions.map(p => [p.id, p.name]));
  
  // Build role -> permissions map
  const rolePermissionMap = new Map<number, string[]>();
  for (const rp of allRolePermissions) {
    const permName = permissionMap.get(rp.permissionId);
    if (permName) {
      const existing = rolePermissionMap.get(rp.roleId) || [];
      existing.push(permName);
      rolePermissionMap.set(rp.roleId, existing);
    }
  }
  
  // Populate caches
  for (const role of allRoles) {
    roleCache.set(role.id, {
      name: role.name,
      permissions: rolePermissionMap.get(role.id) || [],
    });
  }
  
  initialized = true;
}

/**
 * Get all permissions for a user by their userId.
 * Checks user's roles and aggregates permissions.
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  if (!initialized) await initializeRBAC();
  
  const db = databaseRequired(await getDb());
  
  const userRoleRecords = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  
  const permissions = new Set<string>();
  for (const ur of userRoleRecords) {
    const role = roleCache.get(ur.roleId);
    if (role) {
      for (const perm of role.permissions) {
        permissions.add(perm);
      }
    }
  }
  
  return Array.from(permissions);
}

/**
 * Check if user has a specific permission.
 */
export async function hasPermission(userId: number, permissionName: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionName);
}

/**
 * Check if user has any of the given permissions (OR logic).
 */
export async function hasAnyPermission(userId: number, permissionNames: string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionNames.some(p => permissions.includes(p));
}

/**
 * Check if user has all of the given permissions (AND logic).
 */
export async function hasAllPermissions(userId: number, permissionNames: string[]): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionNames.every(p => permissions.includes(p));
}

/**
 * Get all roles for a user.
 */
export async function getUserRoles(userId: number): Promise<string[]> {
  if (!initialized) await initializeRBAC();
  
  const db = databaseRequired(await getDb());
  
  const userRoleRecords = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  
  const roleNames: string[] = [];
  for (const ur of userRoleRecords) {
    const role = roleCache.get(ur.roleId);
    if (role) roleNames.push(role.name);
  }
  
  return roleNames;
}

/**
 * Check if user has a specific role.
 */
export async function hasRole(userId: number, roleName: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(roleName);
}

/**
 * Assign a role to a user.
 */
export async function assignRole(userId: number, roleName: string, assignedBy: number): Promise<void> {
  const db = databaseRequired(await getDb());
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  
  if (!role) throw new Error(`Role not found: ${roleName}`);
  
  await db.insert(userRoles).values({
    userId,
    roleId: role.id,
    assignedBy,
  }).onDuplicateKeyUpdate({ set: { roleId: role.id, assignedBy } });
}

/**
 * Remove a role from a user.
 */
export async function removeRole(userId: number, roleName: string): Promise<void> {
  const db = databaseRequired(await getDb());
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  
  if (!role) throw new Error(`Role not found: ${roleName}`);
  
  await db
    .delete(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, role.id)
      )
    );
}

/**
 * Clear the RBAC cache (useful after role/permission changes).
 */
export function clearRBACCache(): void {
  roleCache.clear();
  initialized = false;
}

/**
 * Role helper predicates. Each resolves the user's current RBAC roles from the
 * DB-backed cache; prefer these over the legacy `users.role` column.
 */
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
  return hasRole(userId, ROLE_NAMES.SUPER_ADMIN) || hasRole(userId, ROLE_NAMES.ACCOUNTING_ADMIN);
}

/** Super or system administrator — the administrative role set. */
export async function isAdminRoleUser(userId: number): Promise<boolean> {
  return hasRole(userId, ROLE_NAMES.SUPER_ADMIN) || hasRole(userId, ROLE_NAMES.SYSTEM_ADMIN);
}