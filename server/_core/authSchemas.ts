import { z } from "zod";

/** Shared auth input schemas — raw Express routes and tRPC must agree. */

export const registerInputSchema = z.object({
  name: z.string().trim().min(1, "নাম প্রদান করুন").max(120),
  email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
  password: z
    .string()
    .min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
    .max(100),
});

export const loginInputSchema = z.object({
  email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
  password: z.string().min(1, "পাসওয়ার্ড দিন").max(100),
});

/** `AUTH_MODE` is only "password" when sign-up via email is permitted.
 *  Unset defaults to "password" — same fallback as tRPC auth.register. */
export function isPasswordAuthMode(): boolean {
  return ((process.env.AUTH_MODE as "google" | "password" | undefined) ??
    "password") === "password";
}
