import { isAdminUser, type AuthGatingUser } from "./rbac";

export type AdminAccessState = {
  /** Signed-in user (RBAC roles/permissions are authoritative). */
  user: AuthGatingUser | null | undefined;
  verified: boolean;
  password: string;
};

/**
 * The UI may request protected admin datasets only after:
 *  1. the signed-in user holds an RBAC admin role/permission, AND
 *  2. that administrator completes server-side password verification in-session.
 *
 * Legacy `users.role === "admin"` alone never unlocks admin data.
 */
export function canLoadAdminData({
  user,
  verified,
  password,
}: AdminAccessState) {
  return isAdminUser(user) && verified && password.trim().length > 0;
}
