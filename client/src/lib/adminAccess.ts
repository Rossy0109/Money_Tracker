export type AdminAccessState = {
  role?: "admin" | "user";
  verified: boolean;
  password: string;
};

/**
 * The UI may request protected admin datasets only after the currently signed-in
 * administrator completes server-side password verification during this session.
 */
export function canLoadAdminData({ role, verified, password }: AdminAccessState) {
  return role === "admin" && verified && password.trim().length > 0;
}
