import type { Permission, Role, UserRole, RolePermission } from "../../drizzle/schema";
import { databaseRequired, getDb } from "../db";
import { eq, and } from "drizzle-orm";
import { permissions, roles, rolePermissions, userRoles } from "../../drizzle/schema";

export type PermissionName = string;
export type RoleName = string;

export const ROLE_NAMES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  ACCOUNTING_ADMIN: "ACCOUNTING_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  MANAGER: "MANAGER",
  INPUT_OPERATOR: "INPUT_OPERATOR",
  VIEWER: "VIEWER",
} as const;

export const PERMISSION_CATEGORIES = {
  ACCOUNTING: "accounting",
  BUDGET: "budget",
  PAYROLL: "payroll",
  VOUCHER: "voucher",
  LEDGER: "ledger",
  AUDIT: "audit",
  USER: "user",
  BACKUP: "backup",
  SETTINGS: "settings",
} as const;

// In-memory cache for permissions (populated at startup)
const permissionCache: Map<string, string[]> = new Map();
const roleCache: Map<number, { name: string; permissions: string[] }> = new Map();
let initialized = false;

/**
 * Initialize the RBAC cache from database.
 * Call this at application startup.
 */
export async function initializeRBAC(): Promise<void> {
  if (initialized) return;
  
  const db = databaseRequired(await getDb());
  
  const allPermissions = await db.select().from(permissions);
  const allRoles = await db.select().from(roles);
  const allRolePermissions = await db.select().from(rolePermissions);
  
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
  permissionCache.clear();
  roleCache.clear();
  initialized = false;
}

export { eq, and } from "drizzle-orm";