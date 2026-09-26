/**
 * Single source of truth for the RBAC permission model.
 *
 * Import this from BOTH the server (authorization) and the client (UI gating)
 * so the two sides can never drift apart. Alternatives:
 *   server:  import { PERMISSIONS, ROLE_PERMISSIONS, hasRoleIn } from "@shared/rbac";
 *   client:  import { PERMISSIONS, ROLE_PERMISSIONS } from "@shared/rbac";
 */

export const ROLE_NAMES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SYSTEM_ADMIN: "SYSTEM_ADMIN",
  ACCOUNTING_ADMIN: "ACCOUNTING_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  MANAGER: "MANAGER",
  INPUT_OPERATOR: "INPUT_OPERATOR",
  VIEWER: "VIEWER",
} as const;

export type RoleName = keyof typeof ROLE_NAMES;

/** Backwards-compatible alias (the seed and routers historically used `ROLES`). */
export const ROLES = ROLE_NAMES;

export const ROLE_NAMES_ARRAY = Object.values(ROLE_NAMES);

/** Every distinct permission category used for the `permissions.category` column. */
export const PERMISSION_CATEGORIES = {
  AUTH: "auth",
  USER: "user",
  ACCOUNTING: "accounting",
  BUDGET: "budget",
  PAYROLL: "payroll",
  VOUCHER: "voucher",
  LEDGER: "ledger",
  AUDIT: "audit",
  BACKUP: "backup",
  REPORTS: "reports",
  SETTINGS: "settings",
} as const;

/** All permission names, grouped by category. */
export const PERMISSION_GROUPS = {
  AUTH: ["auth.login", "auth.logout"],
  USER: [
    "user.view",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "user.delete",
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
    "budget.delete",
    "budget.approve",
  ],
  PAYROLL: [
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.delete",
    "payroll.approve",
  ],
  VOUCHER: [
    "voucher.read",
    "voucher.create",
    "voucher.update",
    "voucher.submit",
    "voucher.approve",
    "voucher.reject",
    "voucher.post",
    "voucher.reverse",
    "voucher.delete",
  ],
  LEDGER: ["ledger.read", "ledger.create", "ledger.update", "ledger.export"],
  AUDIT: ["audit.read", "audit.export"],
  BACKUP: ["backup.view", "backup.create", "backup.restore"],
  REPORTS: ["reports.view", "reports.export"],
  SETTINGS: [
    "settings.view",
    "settings.manage",
    "role.manage",
    "permission.manage",
  ],
} as const;

export const PERMISSIONS = {
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  USER_VIEW: "user.view",
  USER_READ: "user.read",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_SUSPEND: "user.suspend",
  USER_DELETE: "user.delete",
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_CREATE: "accounting.create",
  ACCOUNTING_UPDATE: "accounting.update",
  ACCOUNTING_DELETE: "accounting.delete",
  BUDGET_READ: "budget.read",
  BUDGET_CREATE: "budget.create",
  BUDGET_UPDATE: "budget.update",
  BUDGET_DELETE: "budget.delete",
  BUDGET_APPROVE: "budget.approve",
  PAYROLL_READ: "payroll.read",
  PAYROLL_CREATE: "payroll.create",
  PAYROLL_UPDATE: "payroll.update",
  PAYROLL_DELETE: "payroll.delete",
  PAYROLL_APPROVE: "payroll.approve",
  VOUCHER_READ: "voucher.read",
  VOUCHER_CREATE: "voucher.create",
  VOUCHER_UPDATE: "voucher.update",
  VOUCHER_SUBMIT: "voucher.submit",
  VOUCHER_APPROVE: "voucher.approve",
  VOUCHER_REJECT: "voucher.reject",
  VOUCHER_POST: "voucher.post",
  VOUCHER_REVERSE: "voucher.reverse",
  VOUCHER_DELETE: "voucher.delete",
  LEDGER_READ: "ledger.read",
  LEDGER_CREATE: "ledger.create",
  LEDGER_UPDATE: "ledger.update",
  LEDGER_EXPORT: "ledger.export",
  AUDIT_READ: "audit.read",
  AUDIT_EXPORT: "audit.export",
  BACKUP_VIEW: "backup.view",
  BACKUP_CREATE: "backup.create",
  BACKUP_RESTORE: "backup.restore",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  ROLE_MANAGE: "role.manage",
  PERMISSION_MANAGE: "permission.manage",
} as const;

export type PermissionName =
  (typeof PERMISSION_GROUPS)[keyof typeof PERMISSION_GROUPS][number];

/**
 * The complete role → permission matrix.
 *
 * Least-privilege by design:
 *  - INPUT_OPERATOR is input-ONLY: it may create new records but can read nothing.
 *  - Only accounting owners and super/system admins can submit/approve/post/reverse vouchers.
 */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionName[]> = {
  SUPER_ADMIN: [
    "auth.login",
    "auth.logout",
    "user.view",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "user.delete",
    "accounting.read",
    "accounting.create",
    "accounting.update",
    "accounting.delete",
    "budget.read",
    "budget.create",
    "budget.update",
    "budget.delete",
    "budget.approve",
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.delete",
    "payroll.approve",
    "voucher.read",
    "voucher.create",
    "voucher.update",
    "voucher.submit",
    "voucher.approve",
    "voucher.reject",
    "voucher.post",
    "voucher.reverse",
    "voucher.delete",
    "ledger.read",
    "ledger.create",
    "ledger.update",
    "ledger.export",
    "audit.read",
    "audit.export",
    "backup.view",
    "backup.create",
    "backup.restore",
    "reports.view",
    "reports.export",
    "settings.view",
    "settings.manage",
    "role.manage",
    "permission.manage",
  ],
  SYSTEM_ADMIN: [
    "auth.login",
    "auth.logout",
    "user.view",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "user.delete",
    "audit.read",
    "audit.export",
    "backup.view",
    "backup.create",
    "backup.restore",
    "reports.view",
    "reports.export",
    "settings.view",
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
    "budget.delete",
    "budget.approve",
    "voucher.read",
    "voucher.create",
    "voucher.update",
    "voucher.submit",
    "voucher.approve",
    "voucher.reject",
    "voucher.post",
    "voucher.reverse",
    "ledger.read",
    "ledger.create",
    "ledger.update",
    "ledger.export",
    "audit.read",
    "audit.export",
    "backup.view",
    "backup.create",
    "backup.restore",
    "reports.view",
    "reports.export",
  ],
  HR_ADMIN: [
    "auth.login",
    "auth.logout",
    "user.view",
    "user.read",
    "user.create",
    "user.update",
    "user.suspend",
    "user.delete",
    "payroll.read",
    "payroll.create",
    "payroll.update",
    "payroll.delete",
    "payroll.approve",
    "reports.view",
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
    "voucher.update",
    "voucher.submit",
    "voucher.approve",
    "ledger.read",
    "audit.read",
    "reports.view",
  ],
  INPUT_OPERATOR: [
    "auth.login",
    "auth.logout",
    "accounting.create",
    "budget.create",
    "payroll.create",
    "voucher.create",
  ],
  VIEWER: [
    "auth.login",
    "auth.logout",
    "accounting.read",
    "budget.read",
    "voucher.read",
    "ledger.read",
    "audit.read",
    "reports.view",
  ],
};

/** The strict, non-negotiable INPUT_OPERATOR contract. Only these six permissions. */
export const INPUT_OPERATOR_PERMISSIONS: readonly PermissionName[] = [
  "auth.login",
  "auth.logout",
  "accounting.create",
  "budget.create",
  "payroll.create",
  "voucher.create",
];

export function getAllPermissions(): PermissionName[] {
  return Object.values(PERMISSION_GROUPS).flat();
}

export function getPermissionsForRole(roleName: string): PermissionName[] {
  return ROLE_PERMISSIONS[roleName as RoleName] ?? [];
}

export function roleHasPermission(
  roleName: string,
  permission: string
): boolean {
  return getPermissionsForRole(roleName).includes(permission as PermissionName);
}

export function categoryForPermission(permission: string): string {
  for (const [key, list] of Object.entries(PERMISSION_GROUPS)) {
    if ((list as readonly string[]).includes(permission)) {
      return (
        PERMISSION_CATEGORIES[key as keyof typeof PERMISSION_CATEGORIES] ?? key
      );
    }
  }
  return "other";
}
