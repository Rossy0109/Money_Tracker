/**
 * RBAC permission constants.
 *
 * DEPRECATED ADAPTER — the single source of truth now lives in `shared/rbac.ts`
 * so that server and client share one permission model. This file re-exports it
 * for backwards compatibility with existing imports; do not add new logic here.
 */
export {
  PERMISSION_CATEGORIES,
  PERMISSIONS,
  ROLES,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  INPUT_OPERATOR_PERMISSIONS,
  getAllPermissions,
  getPermissionsForRole,
  roleHasPermission,
  categoryForPermission,
} from "@shared/rbac";

export type { RoleName, PermissionName } from "@shared/rbac";