import { ROLE_NAMES } from "@shared/rbac";

export interface AuthGatingUser {
  name?: string | null;
  email?: string | null;
  status?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
}

const ADMIN_ROLES: Set<string> = new Set([ROLE_NAMES.SUPER_ADMIN, ROLE_NAMES.SYSTEM_ADMIN]);

export function getUserRoles(user: AuthGatingUser | null | undefined): string[] {
  return Array.isArray(user?.roles) ? user.roles : [];
}

export function getUserPermissions(user: AuthGatingUser | null | undefined): string[] {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

export function hasRole(user: AuthGatingUser | null | undefined, roleName: string): boolean {
  return getUserRoles(user).includes(roleName);
}

export function hasAnyRole(user: AuthGatingUser | null | undefined, roleNames: string[]): boolean {
  const roles = getUserRoles(user);
  return roleNames.some(r => roles.includes(r));
}

export function hasPermission(user: AuthGatingUser | null | undefined, permission: string): boolean {
  return getUserPermissions(user).includes(permission);
}

export function hasAnyPermission(user: AuthGatingUser | null | undefined, permissions: string[]): boolean {
  const perms = getUserPermissions(user);
  return permissions.some(p => perms.includes(p));
}

export function hasAllPermissions(user: AuthGatingUser | null | undefined, permissions: string[]): boolean {
  const perms = getUserPermissions(user);
  return permissions.every(p => perms.includes(p));
}

export function isAdminUser(user: AuthGatingUser | null | undefined): boolean {
  if (user?.role === "admin") return true;
  if (getUserRoles(user).some(r => ADMIN_ROLES.has(r))) return true;
  return getUserPermissions(user).some(p =>
    p === "settings.manage" || p === "role.manage" || p === "permission.manage" ||
    p === "user.manage" || p.startsWith("backup.") || p.startsWith("audit.")
  );
}

export function isInputOnlyUser(user: AuthGatingUser | null | undefined): boolean {
  if (user?.role === "input_only") return true;
  if (getUserRoles(user).includes(ROLE_NAMES.INPUT_OPERATOR)) return true;
  const perms = getUserPermissions(user);
  if (perms.length === 0) return false;
  return perms.every(p => p.startsWith("auth.") || p.endsWith(".create"));
}

export function isFinanceAdmin(user: AuthGatingUser | null | undefined): boolean {
  if (user?.role === "admin") return true;
  const roles = getUserRoles(user);
  return roles.includes(ROLE_NAMES.SUPER_ADMIN) || roles.includes(ROLE_NAMES.ACCOUNTING_ADMIN);
}

export function getDisplayRole(user: AuthGatingUser | null | undefined): string {
  const roles = getUserRoles(user);
  if (roles.includes(ROLE_NAMES.SUPER_ADMIN)) return "সুইট অ্যাডমিন";
  if (roles.includes(ROLE_NAMES.SYSTEM_ADMIN)) return "সিস্টেম অ্যাডমিন";
  if (roles.includes(ROLE_NAMES.ACCOUNTING_ADMIN)) return "হিসাব অ্যাডমিন";
  if (roles.includes(ROLE_NAMES.HR_ADMIN)) return "এইচআর অ্যাডমিন";
  if (roles.includes(ROLE_NAMES.MANAGER)) return "ম্যানেজার";
  if (roles.includes(ROLE_NAMES.INPUT_OPERATOR)) return "ইনপুট অপারেটর";
  if (roles.includes(ROLE_NAMES.VIEWER)) return "দর্শক";
  if (user?.role === "admin") return "অ্যাডমিন (Legacy)";
  if (user?.role === "input_only") return "ইনপুট অপারেটর (Legacy)";
  return "ইউজার";
}