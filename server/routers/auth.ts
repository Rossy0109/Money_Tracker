import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import * as financeDb from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import {
  hashPassword,
  verifyPasswordConstantTime,
} from "../_core/passwordAuth";
import {
  checkRateLimit,
  resetRateLimit,
  getClientIp,
} from "../_core/rateLimiter";
import { inputOnlyProcedure, publicProcedure, router } from "../_core/trpc";
import { getUserPermissions, getUserRoles } from "../_core/rbac";
import { extractAuditContext } from "../_core/auditContext";

export const authRouter = router({
  me: publicProcedure.query(async opts => {
    const user = opts.ctx.user;
    if (!user) return null;
    const {
      passwordHash: _passwordHash,
      resetToken: _resetToken,
      resetTokenExpiresAt: _resetTokenExpiresAt,
      ...safeUser
    } = user;
    try {
      const [roles, permissions] = await Promise.all([
        getUserRoles(user.id),
        getUserPermissions(user.id),
      ]);
      return { ...safeUser, roles, permissions };
    } catch {
      return { ...safeUser, roles: [], permissions: [] };
    }
  }),
  register: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "নাম প্রদান করুন").max(120),
        email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
        password: z
          .string()
          .min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clientIp = getClientIp(ctx.req);
      checkRateLimit(String(clientIp), {
        windowMs: 15 * 60 * 1000,
        max: 20,
        keyPrefix: "auth-register",
        message:
          "খুব বেশি চেষ্টার কারণে সাময়িকভাবে রেজিস্ট্রেশন বন্ধ রাখা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
      });

      try {
        const passwordHash = await hashPassword(input.password);
        const user = await financeDb.createPasswordUser({
          name: input.name,
          email: input.email,
          passwordHash,
        });

        if (user.status === "pending") {
          return {
            success: true,
            pendingApproval: true,
            message:
              "রেজিস্ট্রেশন সফল হয়েছে! আপনার অ্যাকাউন্টটি বর্তমানে অ্যাডমিন অনুমোদনের অপেক্ষায় রয়েছে। অনুমোদন পাওয়ার পর আপনি লগইন করতে পারবেন।",
            user: null,
          };
        }

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || user.email || "",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        const [roles, permissions] = await Promise.all([
          getUserRoles(user.id).catch(() => []),
          getUserPermissions(user.id).catch(() => []),
        ]);
        return {
          success: true,
          pendingApproval: false,
          message: "সফলভাবে নিবন্ধিত ও লগইন হয়েছে।",
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            role: user.role,
            roles,
            permissions,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "রেজিস্ট্রেশন ব্যর্থ হয়েছে",
        });
      }
    }),
  login: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
        password: z.string().min(1, "পাসওয়ার্ড দিন").max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clientIp = getClientIp(ctx.req);
      checkRateLimit(String(clientIp), {
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyPrefix: "auth-login",
        message:
          "খুব বেশি চেষ্টার কারণে সাময়িকভাবে লগইন বন্ধ রাখা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
      });

      try {
        const lockout = await financeDb.isLockedOut(
          input.email,
          String(clientIp)
        );
        if (lockout.locked) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "অতিরিক্ত ভুল পাসওয়ার্ডের কারণে লগইন সাময়িকভাবে বন্ধ। ১৫ মিনিট পর আবার চেষ্টা করুন।",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
      }

      const user = await financeDb.getUserByEmail(input.email);
      const credentialsValid = await verifyPasswordConstantTime(
        input.password,
        user?.passwordHash
      );
      if (!user || !credentialsValid) {
        try {
          await financeDb.recordFailedLoginAttempt(
            input.email,
            String(clientIp)
          );
          if (user) {
            await financeDb.recordLoginHistory(
              user.id,
              "password",
              String(clientIp),
              typeof ctx.req?.headers?.["user-agent"] === "string"
                ? ctx.req.headers["user-agent"]
                : null,
              false,
              "invalid_credentials"
            );
          }
        } catch {
          void 0;
        }
        try {
          await financeDb.logAudit({
            actorUserId: user?.id ?? (await financeDb.systemActorUserId()),
            actorRole: user?.role ?? "anonymous",
            action: "login_failed",
            entityType: "auth",
            summary: `Failed login attempt for email: ${input.email}`,
            auditContext: extractAuditContext(ctx.req),
          });
        } catch {
          void 0;
        }
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "ভুল ইমেইল অথবা পাসওয়ার্ড। আবার চেষ্টা করুন।",
        });
      }

      if (user.status === "pending") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
        });
      }

      if (user.status === "suspended") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
        });
      }

      resetRateLimit(String(clientIp), "auth-login");
      try {
        await financeDb.clearFailedLoginAttempts(input.email, String(clientIp));
        await financeDb.recordLoginHistory(
          user.id,
          "password",
          String(clientIp),
          typeof ctx.req?.headers?.["user-agent"] === "string"
            ? ctx.req.headers["user-agent"]
            : null,
          true
        );
      } catch {
        void 0;
      }
      await financeDb.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });
      try {
        await financeDb.logAudit({
          actorUserId: user.id,
          actorRole: user.role,
          action: "login",
          entityType: "auth",
          entityId: user.id,
          summary: `User logged in: ${user.email ?? user.name ?? user.id}`,
          auditContext: extractAuditContext(ctx.req),
        });
      } catch {
        void 0;
      }
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });
      try {
        const expiresAt = new Date(Date.now() + ONE_YEAR_MS);
        await financeDb.createUserSession(
          user.id,
          sessionToken,
          sessionToken,
          typeof ctx.req?.headers?.["user-agent"] === "string"
            ? ctx.req.headers["user-agent"]
            : null,
          getClientIp(ctx.req),
          expiresAt,
          expiresAt
        );
      } catch {
        void 0;
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      const [roles, permissions] = await Promise.all([
        getUserRoles(user.id).catch(() => []),
        getUserPermissions(user.id).catch(() => []),
      ]);
      return {
        success: true,
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          roles,
          permissions,
        },
      };
    }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const cookies = ctx.req?.headers?.cookie;
      if (typeof cookies === "string" && cookies.includes(COOKIE_NAME)) {
        const raw = cookies
          .split(";")
          .map(part => part.trim())
          .find(part => part.startsWith(`${COOKIE_NAME}=`));
        const token = raw?.slice(COOKIE_NAME.length + 1);
        if (token) {
          await financeDb.revokeSessionByToken(decodeURIComponent(token));
        }
      }
    } catch {
      void 0;
    }
    if (ctx.user) {
      try {
        await financeDb.logAudit({
          actorUserId: ctx.user.id,
          actorRole: ctx.user.role,
          action: "logout",
          entityType: "auth",
          entityId: ctx.user.id,
          summary: `User logged out: ${ctx.user.email ?? ctx.user.name ?? ctx.user.id}`,
          auditContext: extractAuditContext(ctx.req),
        });
      } catch {
        void 0;
      }
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
  setPassword: inputOnlyProcedure
    .input(
      z.object({
        password: z
          .string()
          .min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clientIp = getClientIp(ctx.req);
      checkRateLimit(String(clientIp), {
        windowMs: 15 * 60 * 1000,
        max: 5,
        keyPrefix: "auth-set-password",
        message:
          "খুব বেশি চেষ্টার কারণে সাময়িকভাবে পাসওয়ার্ড পরিবর্তন বন্ধ রাখা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
      });

      const passwordHash = await hashPassword(input.password);
      await financeDb.setUserPassword(ctx.user!.openId, passwordHash);
      resetRateLimit(String(clientIp), "auth-set-password");
      return {
        success: true,
        message:
          "পাসওয়ার্ড সফলভাবে সেট করা হয়েছে। এখন ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করতে পারবেন।",
      } as const;
    }),
  forgotPassword: publicProcedure
    .input(
      z.object({
        email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clientIp = getClientIp(ctx.req);
      checkRateLimit(String(clientIp), {
        windowMs: 60 * 60 * 1000,
        max: 5,
        keyPrefix: "auth-forgot-password",
        message:
          "খুব বেশি চেষ্টার কারণে সাময়িকভাবে পাসওয়ার্ড রিসেট বন্ধ রাখা হয়েছে। ১ ঘণ্টা পর আবার চেষ্টা করুন।",
      });

      const { resetToken, resetTokenExpiresAt, user } =
        await financeDb.createPasswordResetToken(input.email);

      const isDev = process.env.NODE_ENV === "development";
      const genericMessage =
        "যদি ইমেইলটি রেজিস্টার্ড থাকে, পাসওয়ার্ড রিসেট লিংকটি পাঠানো হবে।";

      if (!resetToken || !user) {
        return {
          success: true,
          message: genericMessage,
          resetToken: undefined,
        } as const;
      }

      const {
        sendPasswordResetEmail,
        buildPasswordResetUrl,
        isEmailDeliveryConfigured,
      } = await import("../_core/mailer");

      if (!isEmailDeliveryConfigured()) {
        if (isDev) {
          return {
            success: true,
            message: `${genericMessage} (ডেভেলপমেন্ট: টোকেন নিচে দেখানো হয়েছে)`,
            resetToken,
          } as const;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "পাসওয়ার্ড রিসেট ইমেইল ডেলিভারি কনফিগার করা হয়নি (EMAIL_WEBHOOK_URL বা RESEND_API_KEY সেট করুন)।",
        });
      }

      const resetUrl = buildPasswordResetUrl(resetToken);
      const delivered = await sendPasswordResetEmail({
        to: user.email ?? input.email,
        resetUrl,
        token: resetToken,
        expiresAt: resetTokenExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      });

      if (!delivered && !isDev) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "পাসওয়ার্ড রিসেট ইমেইল পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।",
        });
      }

      return {
        success: true,
        message: genericMessage,
        resetToken: isDev ? resetToken : undefined,
      } as const;
    }),
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1, "টোকেন প্রয়োজন"),
        password: z
          .string()
          .min(8, "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে")
          .max(100),
      })
    )
    .mutation(async ({ input }) => {
      const { valid, user } = await financeDb.validatePasswordResetToken(
        input.token
      );

      if (!valid || !user) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "অবৈধ বা মেয়াদোত্তীর্ণ রিসেট টোকেন।",
        });
      }

      const passwordHash = await hashPassword(input.password);
      await financeDb.consumePasswordResetToken(user.openId, passwordHash);

      return {
        success: true,
        message:
          "পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করতে পারবেন।",
      } as const;
    }),
});
