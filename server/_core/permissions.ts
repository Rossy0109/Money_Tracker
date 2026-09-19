/**
 * Permission constants for the RBAC system.
 * These are the core permissions used across the application.
 * Keep in sync with the database seed script.
 */

// Permission categories for organization
export const PERMISSION_CATEGORIES = {
  AUTHENTICATION: "authentication",
  USER_MANAGEMENT: "user_management",
  ACCOUNTING: "accounting",
  BUDGET: "budget",
  PAYROLL: "payroll",
  VOUCHER: "voucher",
  LEDGER: "ledger",
  AUDIT: "audit",
  BACKUP: "backup",
  SYSTEM: "system",
} as const;

// All permission names as constants
export const PERMISSIONS = {
  // Authentication
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",

  // User Management
  USER_READ: "user.read",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_SUSPEND: "user.suspend",

  // Accounting
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_CREATE: "accounting.create",
  ACCOUNTING_UPDATE: "accounting.update",
  ACCOUNTING_DELETE: "accounting.delete",

  // Budget
  BUDGET_READ: "budget.read",
  BUDGET_CREATE: "budget.create",
  BUDGET_UPDATE: "budget.update",
  BUDGET_APPROVE: "budget.approve",

  // Payroll
  PAYROLL_READ: "payroll.read",
  PAYROLL_CREATE: "payroll.create",
  PAYROLL_UPDATE: "payroll.update",
  PAYROLL_APPROVE: "payroll.approve",

  // Voucher
  VOUCHER_READ: "voucher.read",
  VOUCHER_CREATE: "voucher.create",
  VOUCHER_SUBMIT: "voucher.submit",
  VOUCHER_APPROVE: "voucher.approve",
  VOUCHER_POST: "voucher.post",
  VOUCHER_REVERSE: "voucher.reverse",

  // Ledger
  LEDGER_READ: "ledger.read",
  LEDGER_EXPORT: "ledger.export",

  // Audit
  AUDIT_READ: "audit.read",
  AUDIT_EXPORT: "audit.export",

  // Backup
  BACKUP_CREATE: "backup.create",
  BACKUP_RESTORE: "backup.restore",

  // System
  SETTINGS_MANAGE: "settings.manage",
  ROLE_MANAGE: "role.manage",
  PERMISSION_MANAGE: "permission.manage",
} as const;

// Role definitions
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  ACCOUNTING_ADMIN: "ACCOUNTING_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  MANAGER: "MANAGER",
  INPUT_OPERATOR: "INPUT_OPERATOR",
  VIEWER: "VIEWER",
} as const;

// Permission groupings by category
export const PERMISSION_GROUPS = {
  AUTHENTICATION: [
    "auth.login",
    "auth.logout",
  ],
  USER_MANAGEMENT: [
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
  ],
  ACCOUNTING: [
    "accounting.read",
    "accounting.create",
    "accounting.update",
    "accounting.delete",
  ],
  BUDGET: [
    "budget.read",
    "budget.create",
    "budget.update",
    "budget.approve",
  ],
  PAYROLL: [
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.approve",
  ],
  VOUCHER: [
    "voucher.read",
    "voucher.create",
    "voucher.submit",
    "voucher.approve",
    "voucher.post",
    "voucher.reverse",
  ],
  LEDGER: [
    "ledger.read",
    "ledger.export",
  ],
  AUDIT: [
    "audit.read",
    "audit.export",
  ],
  BACKUP: [
    "backup.create",
    "backup.restore",
  ],
  SYSTEM: [
    "settings.manage",
    "role.manage",
    "permission.manage",
  ],
} as const;

// Role definitions with their permissions
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    // All permissions
    "auth.login",
    "auth.logout",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "accounting.read",
    "accounting.create",
    "accounting.update",
    "accounting.delete",
    "budget.read",
    "budget.create",
    "budget.update",
    "budget.approve",
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.approve",
    "voucher.read",
    "voucher.create",
    "voucher.submit",
    "voucher.approve",
    "voucher.post",
    "voucher.reverse",
    "ledger.read",
    "ledger.export",
    "audit.read",
    "audit.export",
    "backup.create",
    "backup.restore",
    "settings.manage",
    "role.manage",
    "permission.manage",
  ],
  SYSTEM_ADMIN: [
    "auth.login",
    "auth.logout",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "backup.create",
    "backup.restore",
    "settings.manage",
    "role.manage",
    "permission.manage",
  ],
  ACCOUNTING_ADMIN: [
    "auth.login",
    "auth.logout",
    "accounting.read",
    "accounting.create",
    "accounting.update",
    "accounting.delete",
    "budget.read",
    "budget.create",
    "budget.update",
    "budget.approve",
    "voucher.read",
    "voucher.create",
    "voucher.submit",
    "voucher.approve",
    "voucher.post",
    "voucher.reverse",
    "ledger.read",
    "ledger.export",
    "audit.read",
    "audit.export",
  ],
  HR_ADMIN: [
    "auth.login",
    "auth.logout",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.approve",
  ],
  MANAGER: [
    "auth.login",
    "auth.logout",
    "accounting.read",
    "accounting.create",
    "accounting.update",
    "budget.read",
    "budget.create",
    "budget.update",
    "voucher.read",
    "voucher.create",
    "voucher.submit",
    "voucher.approve",
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
    "auth.login",
    "auth.logout",
    "accounting.read",
    "budget.read",
    "voucher.read",
    "ledger.read",
    "audit.read",
  ],
};

// Role names as constants
export const ROLE_NAMES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  ACCOUNTING_ADMIN: "ACCOUNTING_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  MANAGER: "MANAGER",
  INPUT_OPERATOR: "INPUT_OPERATOR",
  VIEWER: "VIEWER",
} as const;

// Type helpers
export type RoleName = keyof typeof ROLE_NAMES;
export type PermissionName = string;

export function getAllPermissions(): string[] {
  const all = new Set<string>();
  for (const perms of Object.values(ROLE_PERMISSIONS)) {
    for (const p of perms) {
      all.add(p);
    }
  }
  return Array.from(all).sort();
}

export function getPermissionsForRole(roleName: string): string[] {
  return ROLE_PERMISSIONS[roleName as keyof typeof ROLE_PERMISSIONS] || [];
}

export function roleHasPermission(roleName: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[roleName as keyof typeof ROLE_PERMISSIONS];
  return perms?.includes(permission) ?? false;
}