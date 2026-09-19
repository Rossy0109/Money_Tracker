import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import * as financeDb from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { createHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import { hashPassword, verifyPasswordConstantTime } from "./_core/passwordAuth";
import { checkRateLimit, resetRateLimit } from "./_core/rateLimiter";
import {
  getCloudStorageConfig,
  executeCloudBackup,
} from "./cloudBackupService";
import { systemRouter } from "./_core/systemRouter";
import * as accountingCore from "./accounting-core";
import { adminProcedure, elevatedAdminProcedure, inputOnlyProcedure, protectedProcedure, publicProcedure, router, idempotent } from "./_core/trpc";
import { permissionProcedure } from "./_core/trpc";
import {
  protectedWithPermission,
  inputOnlyWithPermission,
} from "./_core/rbac-procedures";
import { issueAdminToken, setAdminElevationCookie, clearAdminElevationCookie } from "./_core/adminSession";
import { ADMIN_SESSION_TTL_MS } from "../shared/const";

const amount = z.number().finite().positive().max(999999999999.99);
const projectId = z.number().int().positive();
const monthKey = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM format");
const auditFilters = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  actorUserId: z.number().int().positive().optional(),
  actorRole: z.enum(["admin", "user"]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

import { timingSafeCompare } from "./timingSafe";

function hasValidAdminPassword(candidate: string) {
  return timingSafeCompare(candidate, ENV.adminAccessPassword);
}

const transactionDate = z.coerce.date().refine(d => {
  const maxAllowedDate = new Date();
  maxAllowedDate.setDate(maxAllowedDate.getDate() + 30);
  return d <= maxAllowedDate;
}, "ভবিষ্যতের ৩০ দিনের বেশি পরের তারিখ ইনপুট করা যাবে না");

const transactionInput = z.object({
  projectId,
  accountId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  amount,
  paymentMethod: z.string().trim().min(1).max(100),
  note: z.string().max(500).optional(),
  occurredAt: transactionDate,
  idempotencyKey: z.string().trim().max(120).optional(),
});

const voucherEntry = z.object({
  accountId: z.number().int().positive(),
  amount: amount,
  narration: z.string().max(300).optional(),
});

const voucherInput = z.object({
  projectId,
  idempotencyKey: z.string().min(8).max(255).optional(),
  date: transactionDate,
  narration: z.string().max(500).optional(),
  debits: z.array(voucherEntry).min(1, "কমপক্ষে একটি ডেবিট এন্ট্রি দরকার"),
  credits: z.array(voucherEntry).min(1, "কমপক্ষে একটি ক্রেডিট এন্ট্রি দরকার"),
  references: z.array(z.object({
    refType: z.enum(["cheque", "bill", "invoice", "challan", "other"]),
    refNumber: z.string().trim().min(1).max(120),
    refDate: z.coerce.date().optional(),
    relatedEntityType: z.string().max(50).optional(),
    relatedEntityId: z.number().int().positive().optional(),
  })).optional(),
}).superRefine((input, ctx) => {
  const totalDebit = input.debits.reduce((sum, d) => sum + d.amount, 0);
  const totalCredit = input.credits.reduce((sum, c) => sum + c.amount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["credits"],
      message: "ডেবিট ও ক্রেডিটের মোট সমান হতে হবে",
    });
  }
});

const coaAccountInput = z.object({
  projectId,
  accountTypeId: z.number().int().positive(),
  parentId: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
  nameBn: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  isDetail: z.boolean().optional(),
  openingBalance: z.number().finite().optional(),
});

const coaAccountUpdateInput = z.object({
  projectId,
  accountTypeId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  code: z.string().trim().min(1).max(30).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  nameBn: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  isDetail: z.boolean().optional(),
});

const periodLockInput = z.object({
  projectId,
  monthKey,
  reason: z.string().max(300).optional(),
});

const reversalInput = z.object({
  projectId,
  originalVoucherId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  date: transactionDate,
  idempotencyKey: z.string().min(8).max(255).optional(),
});

const bankReconciliationInput = z.object({
  projectId,
  accountId: z.number().int().positive(),
  statementDate: transactionDate,
  statementBalance: amount,
  notes: z.string().max(500).optional(),
});

const bankReconciliationItemInput = z.object({
  projectId,
  reconciliationId: z.number().int().positive(),
  ledgerEntryId: z.number().int().positive().optional(),
  statementRef: z.string().trim().min(1).max(120),
  statementDate: transactionDate,
  statementAmount: amount,
  statementType: z.enum(["debit", "credit"]),
});

const transactionSearchInput = z
  .object({
    projectId,
    query: z.string().trim().min(1).max(180).optional(),
    categoryId: z.number().int().positive().optional(),
    type: z.enum(["income", "expense"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    minAmount: z
      .number()
      .finite()
      .nonnegative()
      .max(999999999999.99)
      .optional(),
    maxAmount: z
      .number()
      .finite()
      .nonnegative()
      .max(999999999999.99)
      .optional(),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "শেষের তারিখ শুরুর তারিখের আগে হতে পারে না",
      });
    if (
      input.minAmount !== undefined &&
      input.maxAmount !== undefined &&
      input.minAmount > input.maxAmount
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxAmount"],
        message: "সর্বোচ্চ পরিমাণ সর্বনিম্ন পরিমাণের চেয়ে কম হতে পারে না",
      });
  });

const paginatedTransactionInput = z
  .object({
    projectId,
    query: z.string().trim().min(1).max(180).optional(),
    categoryId: z.number().int().positive().optional(),
    type: z.enum(["income", "expense"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    minAmount: z
      .number()
      .finite()
      .nonnegative()
      .max(999999999999.99)
      .optional(),
    maxAmount: z
      .number()
      .finite()
      .nonnegative()
      .max(999999999999.99)
      .optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(100).default(15),
  })
  .superRefine((input, context) => {
    if (input.from && input.to && input.from > input.to)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "শেষের তারিখ শুরুর তারিখের আগে হতে পারে না",
      });
    if (
      input.minAmount !== undefined &&
      input.maxAmount !== undefined &&
      input.minAmount > input.maxAmount
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxAmount"],
        message: "সর্বোচ্চ পরিমাণ সর্বনিম্ন পরিমাণের চেয়ে কম হতে পারে না",
      });
  });

const backupAmount = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d+(\.\d{1,2})?$/),
]);
const backupDate = z.coerce.date();
const backupAccount = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["cash", "bank", "mobile"]),
  openingBalance: backupAmount,
  currentBalance: backupAmount,
});
const backupCategory = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["income", "expense"]),
  isDefault: z.boolean().optional().default(false),
});
const backupTransaction = z.object({
  id: z.number().int().positive(),
  accountId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  amount: backupAmount,
  voucherNo: z.string().max(80).nullable().optional(),
  reason: z.string().max(180).nullable().optional(),
  paymentMethod: z.string().trim().min(1).max(100),
  note: z.string().max(500).nullable().optional(),
  occurredAt: backupDate,
});
const backupBudget = z.object({
  id: z.number().int().positive(),
  categoryId: z.number().int().positive(),
  monthKey,
  amount: backupAmount,
});
const backupBill = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(180),
  amount: backupAmount,
  dueAt: backupDate,
  isPaid: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(90).default(3),
  lastReminderAt: backupDate.nullable().optional(),
});
const backupDue = z.object({
  id: z.number().int().positive(),
  type: z.enum(["debt", "receivable"]),
  counterparty: z.string().trim().min(1).max(180),
  originalAmount: backupAmount,
  outstandingAmount: backupAmount,
  voucherNo: z.string().max(80).nullable().optional(),
  reason: z.string().max(180).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  openedAt: backupDate,
  dueAt: backupDate.nullable().optional(),
});
const backupSettlement = z.object({
  id: z.number().int().positive(),
  dueId: z.number().int().positive(),
  accountId: z.number().int().positive().nullable().optional(),
  amount: backupAmount,
  voucherNo: z.string().max(80).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  occurredAt: backupDate,
});
const backupRecurring = z.object({
  id: z.number().int().positive(),
  accountId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  amount: backupAmount,
  paymentMethod: z.string().trim().min(1).max(100),
  note: z.string().max(500).nullable().optional(),
  frequency: z.enum(["weekly", "monthly"]),
  scheduleDay: z.number().int().min(1).max(31),
  nextRunAt: backupDate,
  lastGeneratedAt: backupDate.nullable().optional(),
});
const projectBackupInput = z
  .object({
    formatVersion: z.literal("finance-project-backup-v1"),
    exportedAt: backupDate,
    project: z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(120),
    }),
    accounts: z.array(backupAccount).max(10000),
    categories: z.array(backupCategory).max(10000),
    transactions: z.array(backupTransaction).max(10000),
    budgets: z.array(backupBudget).max(10000),
    bills: z.array(backupBill).max(10000),
    dues: z.array(backupDue).max(10000),
    settlements: z.array(backupSettlement).max(10000),
    recurring: z.array(backupRecurring).max(10000),
    voucherSettings: z
      .object({
        prefix: z.string().max(24),
        startNumber: z.number().int().positive(),
        endNumber: z.number().int().positive(),
        nextNumber: z.number().int().positive(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((backup, context) => {
    if (
      backup.voucherSettings &&
      backup.voucherSettings.startNumber > backup.voucherSettings.endNumber
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["voucherSettings", "endNumber"],
        message: "ভাউচার রেঞ্জ সঠিক নয়",
      });
  });

function userSessionFromRequest(request: { headers: { cookie?: string } }) {
  const entry = request.headers.cookie
    ?.split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE_NAME}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : "";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
        const clientIp =
          ctx.req.ip ||
          (ctx.req.headers["x-forwarded-for"] as string) ||
          "client-ip";
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
          return {
            success: true,
            pendingApproval: false,
            message: "সফলভাবে নিবন্ধিত ও লগইন হয়েছে।",
            user: {
              id: user.id,
              openId: user.openId,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message || "রেজিস্ট্রেশন ব্যর্থ হয়েছে",
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
        const clientIp =
          ctx.req.ip ||
          (ctx.req.headers["x-forwarded-for"] as string) ||
          "client-ip";
        checkRateLimit(String(clientIp), {
          windowMs: 15 * 60 * 1000,
          max: 15,
          keyPrefix: "auth-login",
          message:
            "খুব বেশি চেষ্টার কারণে সাময়িকভাবে লগইন বন্ধ রাখা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
        });

        const user = await financeDb.getUserByEmail(input.email);
        const credentialsValid = await verifyPasswordConstantTime(
          input.password,
          user?.passwordHash
        );
        if (!user || !credentialsValid) {
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
        await financeDb.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || user.email || "",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });
        return {
          success: true,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
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
        const clientIp =
          ctx.req.ip ||
          (ctx.req.headers["x-forwarded-for"] as string) ||
          "client-ip";
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
          message: "পাসওয়ার্ড সফলভাবে সেট করা হয়েছে। এখন ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করতে পারবেন।",
        } as const;
      }),
    forgotPassword: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email("সঠিক ইমেইল ঠিকানা দিন").max(320),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const clientIp =
          ctx.req.ip ||
          (ctx.req.headers["x-forwarded-for"] as string) ||
          "client-ip";
        checkRateLimit(String(clientIp), {
          windowMs: 60 * 60 * 1000,
          max: 5,
          keyPrefix: "auth-forgot-password",
          message:
            "খুব বেশি চেষ্টার কারণে সাময়িকভাবে পাসওয়ার্ড রিসেট বন্ধ রাখা হয়েছে। ১ ঘণ্টা পর আবার চেষ্টা করুন।",
        });

        const { success, resetToken } = await financeDb.createPasswordResetToken(input.email);

        // In production, you would send the resetToken via email
        // For now, we return it in development for testing
        const isDev = process.env.NODE_ENV === "development";
        
        return {
          success: true,
          message: "যদি ইমেইলটি রেজিস্টার্ড থাকে, পাসওয়ার্ড রিসেট লিংকটি পাঠানো হবে।",
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
        const { valid, user } = await financeDb.validatePasswordResetToken(input.token);
        
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
          message: "পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করতে পারবেন।",
        } as const;
      }),
  }),
  admin: router({
    verifyAccess: adminProcedure.input(z.object({ password: z.string().min(1).max(128) })).mutation(({ ctx, input }) => {
      const clientIp = ctx.req?.headers?.["x-forwarded-for"] || ctx.req?.socket?.remoteAddress || ctx.req?.ip || "admin-verify";
      const rateLimitKey = `${ctx.user!.id}:${clientIp}`;

      checkRateLimit(String(rateLimitKey), {
        windowMs: 15 * 60 * 1000,
        max: 5,
        keyPrefix: "admin-verify",
        message: "অ্যাডমিন পাসওয়ার্ড একাধিকবার ভুল দেওয়ার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
      });

      if (!hasValidAdminPassword(input.password)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      }

      resetRateLimit(String(rateLimitKey), "admin-verify");
      const token = issueAdminToken(ctx.user!.id, ctx.user!.openId, ADMIN_SESSION_TTL_MS);
      if (ctx.req && ctx.res) {
        setAdminElevationCookie(ctx.req, ctx.res, token);
      }
      return {
        verified: true,
        token,
        expiresInMs: ADMIN_SESSION_TTL_MS,
      } as const;
    }),
    elevationStatus: adminProcedure.query(({ ctx }) => {
      return {
        elevated: Boolean(ctx.adminElevation && ctx.adminElevation.userId === ctx.user!.id),
        expiresAt: ctx.adminElevation?.expiresAt ?? null,
      };
    }),
    revokeAccess: adminProcedure.mutation(({ ctx }) => {
      if (ctx.req && ctx.res) {
        clearAdminElevationCookie(ctx.req, ctx.res);
      }
      return { revoked: true } as const;
    }),
    users: elevatedAdminProcedure.input(z.object({ password: z.string().max(128).optional() }).optional()).query(() => {
      return financeDb.listUsersForAdmin();
    }),
    updateUserStatus: elevatedAdminProcedure.input(z.object({ password: z.string().max(128).optional(), targetUserId: z.number().int().positive(), status: z.enum(["pending", "active", "suspended"]) })).mutation(async ({ input }) => {
      const updated = await financeDb.updateUserStatus(input.targetUserId, input.status);
      return { success: true, user: updated };
    }),
    projects: elevatedAdminProcedure.input(z.object({ password: z.string().max(128).optional() }).optional()).query(() => {
      return financeDb.listProjectsForAdmin();
    }),
    auditLogs: elevatedAdminProcedure.input(auditFilters.extend({ password: z.string().max(128).optional(), page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(25) })).query(({ input }) => {
      return financeDb.listAuditLogsPage({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search, page: input.page, pageSize: input.pageSize });
    }),
    auditLogExport: elevatedAdminProcedure.input(auditFilters.extend({ password: z.string().max(128).optional() })).query(({ input }) => {
      return financeDb.listAuditLogsForExport({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search });
    }),
    auditActivity: elevatedAdminProcedure.input(auditFilters.extend({ password: z.string().max(128).optional() })).query(({ input }) => {
      return financeDb.getAuditLogActivity({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search });
    }),
  }),
  projects: router({
    list: protectedWithPermission("accounting", "read").query(({ ctx }) =>
      financeDb.listProjects(ctx.user!.id)
    ),
    create: inputOnlyWithPermission("accounting", "create")
      .input(z.object({ name: z.string().trim().min(1).max(120) }))
      .mutation(({ ctx, input }) =>
        financeDb.createProject(ctx.user!.id, input.name)
      ),
    active: inputOnlyWithPermission("accounting", "create").query(async ({ ctx }) => {
      const projects = await financeDb.listProjects(ctx.user!.id);
      if (projects.length > 0) {
        return { id: projects[0].id, name: projects[0].name } as const;
      }
      const created = await financeDb.createProject(ctx.user!.id, "Default");
      return { id: created.id, name: created.name } as const;
    }),
  }),
  finance: router({
    overview: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getOverview(ctx.user!.id, input.projectId)
      ),
    budgetPlan: protectedWithPermission("budget", "read")
      .input(z.object({ projectId, monthKey }))
      .query(({ ctx, input }) =>
        financeDb.getBudgetPlan(ctx.user!.id, input.projectId, input.monthKey)
      ),
    analytics: protectedWithPermission("accounting", "read")
      .input(
        z.object({
          projectId,
          months: z.number().int().min(3).max(12).default(6),
        })
      )
      .query(({ ctx, input }) =>
        financeDb.getFinanceAnalytics(
          ctx.user!.id,
          input.projectId,
          input.months
        )
      ),
    searchTransactions: protectedWithPermission("accounting", "read")
      .input(transactionSearchInput)
      .query(({ ctx, input }) =>
        financeDb.searchTransactions(ctx.user!.id, input)
      ),
    paginatedTransactions: protectedWithPermission("accounting", "read")
      .input(paginatedTransactionInput)
      .query(({ ctx, input }) =>
        financeDb.listTransactionsPaginated(ctx.user!.id, input)
      ),
    automationOverview: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getAutomationOverview(ctx.user!.id, input.projectId)
      ),
    monthlyReport: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId, monthKey }))
      .query(({ ctx, input }) =>
        financeDb.getMonthlyReport(ctx.user!.id, input.projectId, input.monthKey)
      ),
    voucherSettings: protectedWithPermission("voucher", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getVoucherSettings(ctx.user!.id, input.projectId)
      ),
    statementData: protectedWithPermission("accounting", "read")
      .input(
        z
          .object({
            projectId,
            categoryId: z.number().int().positive().optional(),
            accountId: z.number().int().positive().optional(),
            type: z.enum(["income", "expense"]).optional(),
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
          })
          .superRefine((input, context) => {
            if (input.from && input.to && input.from > input.to)
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["to"],
                message: "শেষের তারিখ শুরুর তারিখের আগে হতে পারে না",
              });
          })
      )
      .query(({ ctx, input }) =>
        financeDb.getStatementData(ctx.user!.id, input)
      ),
    voucherPrint: protectedWithPermission("voucher", "read")
      .input(
        z.object({
          projectId,
          transactionId: z.number().int().positive(),
        })
      )
      .query(({ ctx, input }) =>
        financeDb.getVoucherPrintData(ctx.user!.id, input)
      ),
    voucherList: protectedWithPermission("voucher", "read")
      .input(
        z.object({
          projectId,
          status: z.enum(["draft", "submitted", "approved", "posted", "reversed"]).optional(),
          limit: z.number().int().positive().max(500).optional(),
        })
      )
      .query(({ ctx, input }) =>
        financeDb.getVoucherList(ctx.user!.id, input.projectId, input)
      ),
    // Voucher Lifecycle
    submitVoucher: inputOnlyWithPermission("voucher", "update")
      .use(idempotent)
      .input(z.object({ projectId, voucherId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(255).optional() }))
      .mutation(({ ctx, input }) =>
        financeDb.submitVoucher(ctx.user!.id, input.projectId, input.voucherId)
      ),
    approveVoucher: inputOnlyWithPermission("voucher", "update")
      .use(idempotent)
      .input(z.object({
        projectId,
        voucherId: z.number().int().positive(),
        action: z.enum(["approve", "return"]).default("approve"),
        idempotencyKey: z.string().min(8).max(255).optional(),
      }))
      .mutation(({ ctx, input }) =>
        financeDb.approveVoucher(ctx.user!.id, input.projectId, input.voucherId, input.action)
      ),
    postVoucher: inputOnlyWithPermission("voucher", "update")
      .use(idempotent)
      .input(z.object({ projectId, voucherId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:voucher-post`, {
          windowMs: 15 * 60 * 1000,
          max: 30,
          keyPrefix: "user",
        });
        return financeDb.postVoucher(ctx.user!.id, input.projectId, input.voucherId);
      }),
    firmProfile: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getFirmProfile(ctx.user!.id, input.projectId)
      ),
    saveFirmProfile: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          name: z.string().trim().min(1).max(160).optional(),
          tagline: z.string().trim().max(160).optional(),
          phone: z.string().trim().max(40).optional(),
          email: z.string().trim().max(160).optional(),
          address: z.string().trim().max(255).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.saveFirmProfile(ctx.user!.id, input.projectId, input)
      ),
    saveVoucherSettings: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          prefix: z.string().trim().max(20),
          startNumber: z.number().int().positive(),
          endNumber: z.number().int().positive(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateVoucherSettings(ctx.user!.id, input)
      ),
    exportData: protectedWithPermission("ledger", "export").query(({ ctx }) =>
      financeDb.exportUserData(ctx.user!.id)
    ),
    exportProjectBackup: protectedWithPermission("backup", "create")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.exportProjectBackup(ctx.user!.id, input.projectId)
      ),
    previewProjectBackup: protectedWithPermission("backup", "restore")
      .input(z.object({ backup: projectBackupInput }))
      .mutation(({ input }) => financeDb.previewProjectBackup(input.backup)),
    restoreProjectBackup: protectedWithPermission("backup", "restore")
      .input(
        z.object({
          projectName: z.string().trim().min(1).max(120),
          confirmation: z.literal("RESTORE_NEW_PROJECT"),
          backup: projectBackupInput,
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.restoreProjectBackup(ctx.user!.id, {
          projectName: input.projectName,
          backup: input.backup,
        })
      ),
    households: protectedWithPermission("accounting", "read").query(({ ctx }) =>
      financeDb.listHouseholds(ctx.user!.id)
    ),
    householdInvitations: protectedWithPermission("accounting", "read").query(({ ctx }) =>
      financeDb.listHouseholdInvitations(ctx.user!.id)
    ),
    createHousehold: protectedWithPermission("accounting", "create")
      .input(z.object({ name: z.string().trim().min(1).max(120) }))
      .mutation(({ ctx, input }) =>
        financeDb.createHousehold(ctx.user!.id, input.name)
      ),
    householdOverview: protectedWithPermission("accounting", "read")
      .input(z.object({ householdId: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        financeDb.getHouseholdOverview(ctx.user!.id, input.householdId)
      ),
    inviteHouseholdMember: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          householdId: z.number().int().positive(),
          email: z.string().trim().email().max(320),
          displayName: z.string().trim().max(120).optional(),
          role: z.enum(["editor", "viewer"]),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.inviteHouseholdMember(ctx.user!.id, input)
      ),
    acceptHouseholdInvitation: protectedWithPermission("accounting", "read")
      .input(z.object({ membershipId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.acceptHouseholdInvitation(ctx.user!.id, input.membershipId)
      ),
    updateHouseholdMember: protectedWithPermission("accounting", "update")
      .input(
        z
          .object({
            householdId: z.number().int().positive(),
            membershipId: z.number().int().positive(),
            role: z.enum(["editor", "viewer"]).optional(),
            status: z.literal("revoked").optional(),
          })
          .refine(
            input => input.role !== undefined || input.status !== undefined,
            "পরিবর্তনের তথ্য দিন"
          )
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateHouseholdMember(ctx.user!.id, input)
      ),
    saveSharedHouseholdBudget: protectedWithPermission("budget", "create")
      .input(
        z.object({
          householdId: z.number().int().positive(),
          label: z.string().trim().min(1).max(120),
          monthKey,
          amount,
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.saveSharedBudget(ctx.user!.id, input)
      ),
    addSharedHouseholdExpense: protectedWithPermission("accounting", "create")
      .input(
        z.object({
          householdId: z.number().int().positive(),
          budgetId: z.number().int().positive(),
          amount,
          note: z.string().trim().max(500).optional(),
          occurredAt: z.coerce.date(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.addSharedExpense(ctx.user!.id, input)
      ),
    createVoucher: inputOnlyWithPermission("voucher", "create")
      .use(idempotent)
      .input(voucherInput)
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:voucher`, {
          windowMs: 15 * 60 * 1000,
          max: 50,
          keyPrefix: "user",
        });
        return financeDb.createVoucherWithEntries(ctx.user!.id, input);
      }),
    // Chart of Accounts
    getAccountTypes: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getAccountTypes()
      ),
    getChartOfAccounts: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getChartOfAccounts(ctx.user!.id, input.projectId)
      ),
    getChartOfAccountsTree: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getChartOfAccountsTree(ctx.user!.id, input.projectId)
      ),
    createChartOfAccount: inputOnlyWithPermission("accounting", "create")
      .input(coaAccountInput)
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:coa`, {
          windowMs: 15 * 60 * 1000,
          max: 50,
          keyPrefix: "user",
        });
        return financeDb.createChartOfAccount(ctx.user!.id, input);
      }),
    updateChartOfAccount: protectedWithPermission("accounting", "update")
      .input(coaAccountUpdateInput.extend({ accountId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => {
        const { accountId, projectId, ...values } = input;
        return financeDb.updateChartOfAccount(ctx.user!.id, projectId, accountId, values);
      }),
    deleteChartOfAccount: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, accountId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteChartOfAccount(ctx.user!.id, input.projectId, input.accountId)
      ),
    seedChartOfAccounts: inputOnlyWithPermission("accounting", "create")
      .input(z.object({ projectId }))
      .mutation(({ ctx, input }) =>
        financeDb.seedDefaultChartOfAccounts(ctx.user!.id, input.projectId)
      ),
    // Period Lock
    lockPeriod: inputOnlyWithPermission("accounting", "update")
      .input(periodLockInput)
      .mutation(({ ctx, input }) =>
        financeDb.lockPeriod(ctx.user!.id, input.projectId, input.monthKey, input.reason)
      ),
    unlockPeriod: inputOnlyWithPermission("accounting", "update")
      .input(z.object({ projectId, monthKey }))
      .mutation(({ ctx, input }) =>
        financeDb.unlockPeriod(ctx.user!.id, input.projectId, input.monthKey)
      ),
    getPeriodLocks: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getPeriodLocks(ctx.user!.id, input.projectId)
      ),
    // Account Groups
    listAccountGroups: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.listAccountGroups(ctx.user!.id, input.projectId)
      ),
    createAccountGroup: inputOnlyWithPermission("accounting", "create")
      .input(z.object({
        projectId,
        accountTypeId: z.number().int().positive(),
        parentId: z.number().int().positive().optional(),
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(120),
        nameBn: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(({ ctx, input }) =>
        financeDb.createAccountGroup(ctx.user!.id, input)
      ),
    updateAccountGroup: protectedWithPermission("accounting", "update")
      .input(z.object({
        projectId,
        groupId: z.number().int().positive(),
        name: z.string().min(1).max(120).optional(),
        nameBn: z.string().max(120).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        sortOrder: z.number().int().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { projectId, groupId, ...values } = input;
        return financeDb.updateAccountGroup(ctx.user!.id, projectId, groupId, values);
      }),
    deleteAccountGroup: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, groupId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteAccountGroup(ctx.user!.id, input.projectId, input.groupId)
      ),
    // Fiscal Periods
    listFiscalPeriods: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        accountingCore.listFiscalPeriods(ctx.user!.id, input.projectId)
      ),
    createFiscalPeriod: inputOnlyWithPermission("accounting", "create")
      .input(z.object({
        projectId,
        name: z.string().min(1).max(120),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      }))
      .mutation(({ ctx, input }) =>
        accountingCore.createFiscalPeriod(ctx.user!.id, input.projectId, {
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
        })
      ),
    closeFiscalPeriod: protectedWithPermission("accounting", "update")
      .input(z.object({
        projectId,
        periodId: z.number().int().positive(),
      }))
      .mutation(({ ctx, input }) =>
        accountingCore.closeFiscalPeriod(ctx.user!.id, input.projectId, input.periodId)
      ),
    // Accounting Statements (Ledger-based)
    trialBalance: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateTrialBalance(ctx.user!.id, input.projectId, input.from, input.to)
      ),
    incomeStatement: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateIncomeStatement(ctx.user!.id, input.projectId, input.from, input.to)
      ),
    balanceSheet: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        asOf: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateBalanceSheet(ctx.user!.id, input.projectId, input.asOf)
      ),
    accountingReport: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateAccountingReport(ctx.user!.id, input.projectId, {
          from: input.from,
          to: input.to,
        })
      ),
    // Phase 7: Account Ledger & Reports
    accountLedger: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        accountId: z.number().int().positive(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateAccountLedger(ctx.user!.id, input.projectId, input.accountId, input.from, input.to)
      ),
    cashFlowStatement: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateCashFlowStatement(ctx.user!.id, input.projectId, input.from, input.to)
      ),
    dailyTransactions: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateDailyTransactions(ctx.user!.id, input.projectId, input.from, input.to)
      ),
    monthlyTransactions: protectedWithPermission("accounting", "read")
      .input(z.object({
        projectId,
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }))
      .query(({ ctx, input }) =>
        accountingCore.generateMonthlyTransactions(ctx.user!.id, input.projectId, input.from, input.to)
      ),
    // Voucher Reversal
    reverseVoucher: inputOnlyWithPermission("voucher", "reverse")
      .use(idempotent)
      .input(reversalInput)
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:reversal`, {
          windowMs: 15 * 60 * 1000,
          max: 20,
          keyPrefix: "user",
        });
        return financeDb.reverseVoucher(ctx.user!.id, input.projectId, input);
      }),
    getVoucherReversals: protectedWithPermission("voucher", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getVoucherReversals(ctx.user!.id, input.projectId)
      ),
    // Bank Reconciliation
    createBankReconciliation: inputOnlyWithPermission("accounting", "create")
      .input(bankReconciliationInput)
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:bankrec`, {
          windowMs: 15 * 60 * 1000,
          max: 20,
          keyPrefix: "user",
        });
        return financeDb.createBankReconciliation(ctx.user!.id, input);
      }),
    getBankReconciliation: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId, reconciliationId: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        financeDb.getBankReconciliationById(ctx.user!.id, input.projectId, input.reconciliationId)
      ),
    getBankReconciliations: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getBankReconciliations(ctx.user!.id, input.projectId)
      ),
    addBankReconciliationItem: protectedWithPermission("accounting", "create")
      .input(bankReconciliationItemInput)
      .mutation(({ ctx, input }) =>
        financeDb.addBankReconciliationItem(ctx.user!.id, input.projectId, input)
      ),
    matchBankReconciliationItem: protectedWithPermission("accounting", "update")
      .input(z.object({ projectId, itemId: z.number().int().positive(), ledgerEntryId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.matchBankReconciliationItem(ctx.user!.id, input.projectId, input.itemId, input.ledgerEntryId)
      ),
    unmatchBankReconciliationItem: protectedWithPermission("accounting", "update")
      .input(z.object({ projectId, itemId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.unmatchBankReconciliationItem(ctx.user!.id, input.projectId, input.itemId)
      ),
    completeBankReconciliation: protectedWithPermission("accounting", "update")
      .input(z.object({ projectId, reconciliationId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.completeBankReconciliation(ctx.user!.id, input.projectId, input.reconciliationId)
      ),
    getBankReconciliationItems: protectedWithPermission("accounting", "read")
      .input(z.object({ reconciliationId: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        financeDb.getBankReconciliationItems(ctx.user!.id, input.reconciliationId)
      ),
    getLedgerEntriesForReconciliation: protectedWithPermission("ledger", "read")
      .input(z.object({ projectId, accountId: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        financeDb.getLedgerEntriesForReconciliation(ctx.user!.id, input.projectId, input.accountId)
      ),
    addTransaction: inputOnlyWithPermission("accounting", "create")
      .input(transactionInput)
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:transactions`, {
          windowMs: 15 * 60 * 1000,
          max: 100,
          keyPrefix: "user",
        });
        return financeDb.createTransaction(ctx.user!.id, input);
      }),
    updateTransaction: protectedWithPermission("accounting", "update")
      .input(transactionInput.extend({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => {
        const { id, ...values } = input;
        return financeDb.updateTransaction(ctx.user!.id, id, values);
      }),
    deleteTransaction: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteTransaction(ctx.user!.id, input.projectId, input.id)
      ),
    addDue: inputOnlyWithPermission("accounting", "create")
      .input(
        z.object({
          projectId,
          type: z.enum(["debt", "receivable"]),
          counterparty: z.string().trim().min(1).max(180),
          amount,
          note: z.string().trim().max(500).optional(),
          openedAt: z.coerce.date(),
          dueAt: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:due`, {
          windowMs: 15 * 60 * 1000,
          max: 50,
          keyPrefix: "user",
        });
        return financeDb.createDue(ctx.user!.id, input);
      }),
    settleDue: protectedWithPermission("accounting", "update")
      .use(idempotent)
      .input(
        z.object({
          projectId,
          dueId: z.number().int().positive(),
          accountId: z.number().int().positive().optional(),
          amount,
          note: z.string().trim().max(500).optional(),
          occurredAt: z.coerce.date(),
          idempotencyKey: z.string().min(8).max(255).optional(),
        })
      )
      .mutation(({ ctx, input }) => financeDb.settleDue(ctx.user!.id, input)),
    addAccount: inputOnlyWithPermission("accounting", "create")
      .input(
        z.object({
          projectId,
          name: z.string().trim().min(1).max(120),
          type: z.enum(["cash", "bank", "mobile"]),
          openingBalance: z
            .number()
            .finite()
            .min(-999999999999.99)
            .max(999999999999.99),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:account`, {
          windowMs: 15 * 60 * 1000,
          max: 50,
          keyPrefix: "user",
        });
        return financeDb.createAccount(ctx.user!.id, input);
      }),
    updateAccount: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          id: z.number().int().positive(),
          projectId,
          name: z.string().trim().min(1).max(120),
          type: z.enum(["cash", "bank", "mobile"]),
          openingBalance: z
            .number()
            .finite()
            .min(-999999999999.99)
            .max(999999999999.99),
        })
      )
      .mutation(({ ctx, input }) => {
        const { id, ...values } = input;
        return financeDb.updateAccount(ctx.user!.id, id, values);
      }),
    deleteAccount: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteAccount(ctx.user!.id, input.projectId, input.id)
      ),
    saveBudget: inputOnlyWithPermission("budget", "create")
      .input(
        z.object({
          projectId,
          categoryId: z.number().int().positive(),
          monthKey,
          amount,
        })
      )
      .mutation(({ ctx, input }) => financeDb.upsertBudget(ctx.user!.id, input)),
    addBill: inputOnlyWithPermission("accounting", "create")
      .input(
        z.object({
          projectId,
          title: z.string().trim().min(1).max(180),
          amount,
          dueAt: z.coerce.date(),
          reminderDaysBefore: z.number().int().min(0).max(90).default(3),
        })
      )
      .mutation(({ ctx, input }) => financeDb.createBill(ctx.user!.id, input)),
    updateBill: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          title: z.string().trim().min(1).max(180),
          amount,
          dueAt: z.coerce.date(),
          isPaid: z.boolean(),
          reminderDaysBefore: z.number().int().min(0).max(90).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const { id, projectId: scopedProjectId, ...values } = input;
        return financeDb.updateBill(ctx.user!.id, scopedProjectId, id, values);
      }),
    setBillPaid: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          isPaid: z.boolean(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.setBillPaid(
          ctx.user!.id,
          input.projectId,
          input.id,
          input.isPaid
        )
      ),
    deleteBill: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteBill(ctx.user!.id, input.projectId, input.id)
      ),
    addRecurringTemplate: inputOnlyWithPermission("accounting", "create")
      .input(
        transactionInput
          .extend({
            frequency: z.enum(["weekly", "monthly"]),
            scheduleDay: z.number().int().min(1).max(31),
            nextRunAt: z.coerce.date(),
          })
          .omit({ occurredAt: true })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await financeDb.createRecurringTemplate(ctx.user!.id, input);
        return id;
      }),
    setRecurringActive: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          isActive: z.boolean(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateRecurringTemplate(ctx.user!.id, input)
      ),
    generateRecurringNow: protectedWithPermission("accounting", "update")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.generateRecurringNow(ctx.user!.id, input.projectId, input.id)
      ),
    enableRecurringSchedule: protectedWithPermission("accounting", "update")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const job = await createHeartbeatJob(
          {
            name: `finance-recurring-${ctx.user!.id}-${input.id}`,
            cron: "0 5 0 * * *",
            path: "/api/scheduled/finance-recurring",
            description:
              "Daily check for a user-controlled recurring finance transaction",
          },
          userSessionFromRequest(ctx.req)
        );
        await financeDb.setRecurringScheduleTask(
          ctx.user!.id,
          input.projectId,
          input.id,
          job.taskUid
        );
        return job;
      }),
    invoices: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.listInvoices(ctx.user!.id, input.projectId)
      ),
    invoiceById: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .query(({ ctx, input }) =>
        financeDb.getInvoiceById(ctx.user!.id, input.projectId, input.id)
      ),
    createInvoice: protectedWithPermission("accounting", "create")
      .use(idempotent)
      .input(
        z.object({
          projectId,
          idempotencyKey: z.string().min(8).max(255).optional(),
          invoiceNumber: z.string().trim().max(64).optional(),
          clientName: z.string().trim().min(1).max(160),
          clientPhone: z.string().trim().max(40).optional(),
          clientEmail: z
            .string()
            .trim()
            .email()
            .max(320)
            .optional()
            .or(z.literal("")),
          clientAddress: z.string().max(500).optional(),
          clientBinTin: z.string().max(64).optional(),
          issueDate: z.coerce.date(),
          dueDate: z.coerce.date(),
          discountAmount: z.number().finite().nonnegative().optional(),
          notesTerms: z.string().max(1000).optional(),
          items: z
            .array(
              z.object({
                description: z.string().trim().min(1).max(255),
                quantity: z.number().finite().positive(),
                unitPrice: z.number().finite().nonnegative(),
                vatRate: z.number().finite().nonnegative().optional(),
              })
            )
            .min(1),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.createInvoice(ctx.user!.id, {
          ...input,
          clientEmail: input.clientEmail || undefined,
        })
      ),
    updateInvoiceStatus: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          status: z.enum([
            "draft",
            "unpaid",
            "partially_paid",
            "paid",
            "overdue",
            "cancelled",
          ]),
          paidAmount: z.number().finite().nonnegative().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateInvoiceStatus(ctx.user!.id, input.projectId, input.id, {
          status: input.status,
          paidAmount: input.paidAmount,
        })
      ),
    deleteInvoice: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteInvoice(ctx.user!.id, input.projectId, input.id)
      ),
    financialStatements: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getFinancialStatements(ctx.user!.id, input.projectId)
      ),
    inventoryList: protectedWithPermission("accounting", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.listInventoryItems(ctx.user!.id, input.projectId)
      ),
    createInventoryItem: protectedWithPermission("accounting", "create")
      .input(
        z.object({
          projectId,
          name: z.string().trim().min(1).max(180),
          sku: z.string().trim().max(80).optional(),
          category: z.string().trim().max(100).optional(),
          unit: z.string().trim().max(40).default("পিস"),
          purchasePrice: z.number().finite().nonnegative().default(0),
          sellingPrice: z.number().finite().nonnegative().default(0),
          currentStock: z.number().finite().nonnegative().default(0),
          lowStockThreshold: z.number().finite().nonnegative().default(5),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.createInventoryItem({ ...input, userId: ctx.user!.id })
      ),
    updateInventoryItem: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(180).optional(),
          sku: z.string().trim().max(80).optional(),
          category: z.string().trim().max(100).optional(),
          unit: z.string().trim().max(40).optional(),
          purchasePrice: z.number().finite().nonnegative().optional(),
          sellingPrice: z.number().finite().nonnegative().optional(),
          currentStock: z.number().finite().nonnegative().optional(),
          lowStockThreshold: z.number().finite().nonnegative().optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateInventoryItem(
          ctx.user!.id,
          input.projectId,
          input.id,
          input
        )
      ),
    adjustInventoryStock: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          quantityChange: z.number().finite(),
          reason: z.string().trim().min(1).max(180),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.adjustInventoryStock(
          ctx.user!.id,
          input.projectId,
          input.id,
          input.quantityChange,
          input.reason
        )
      ),
    deleteInventoryItem: protectedWithPermission("accounting", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteInventoryItem(ctx.user!.id, input.projectId, input.id)
      ),
    syncOfflineTransactions: inputOnlyWithPermission("accounting", "create")
      .input(
        z.object({
          projectId,
          items: z.array(transactionInput),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await checkRateLimit(`${ctx.user!.id}:sync`, {
          windowMs: 15 * 60 * 1000,
          max: 10,
          keyPrefix: "user",
        });
        const results = [];
        for (const item of input.items) {
          const created = await financeDb.createTransaction(ctx.user!.id, item);
          results.push(created);
        }
        return { syncedCount: results.length, transactions: results };
      }),
    enableBillReminder: protectedWithPermission("accounting", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          reminderDaysBefore: z.number().int().min(0).max(90),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await financeDb.setBillReminderSettings(
          ctx.user!.id,
          input.projectId,
          input.id,
          input.reminderDaysBefore
        );
        const job = await createHeartbeatJob(
          {
            name: `finance-bill-reminder-${ctx.user!.id}-${input.id}`,
            cron: "0 0 8 * * *",
            path: "/api/scheduled/finance-bill-reminder",
            description:
              "Daily check for a user-controlled finance bill reminder",
          },
          userSessionFromRequest(ctx.req)
        );
        await financeDb.setBillScheduleTask(
          ctx.user!.id,
          input.projectId,
          input.id,
          job.taskUid
        );
        return job;
      }),
    employeesList: protectedWithPermission("payroll", "read")
      .input(z.object({ projectId }))
      .query(({ ctx, input }) =>
        financeDb.getEmployees(ctx.user!.id, input.projectId)
      ),
    createEmployee: protectedWithPermission("payroll", "create")
      .input(
        z.object({
          projectId,
          name: z.string().trim().min(1).max(180),
          phone: z.string().trim().max(40).optional(),
          email: z.string().trim().max(320).optional(),
          designation: z.string().trim().max(120).optional(),
          department: z.string().trim().max(120).optional(),
          joiningDate: z.coerce.date().optional(),
          baseSalary: z.number().finite().nonnegative().default(0),
          status: z
            .enum(["active", "inactive", "terminated"])
            .default("active"),
          paymentMethod: z.enum(["cash", "bank", "mobile"]).default("cash"),
          bankAccountDetails: z.string().max(500).optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.createEmployee(ctx.user!.id, input)
      ),
    updateEmployee: protectedWithPermission("payroll", "update")
      .input(
        z.object({
          projectId,
          id: z.number().int().positive(),
          name: z.string().trim().min(1).max(180).optional(),
          phone: z.string().trim().max(40).optional(),
          email: z.string().trim().max(320).optional(),
          designation: z.string().trim().max(120).optional(),
          department: z.string().trim().max(120).optional(),
          joiningDate: z.coerce.date().optional(),
          baseSalary: z.number().finite().nonnegative().optional(),
          status: z.enum(["active", "inactive", "terminated"]).optional(),
          paymentMethod: z.enum(["cash", "bank", "mobile"]).optional(),
          bankAccountDetails: z.string().max(500).optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.updateEmployee(ctx.user!.id, input.projectId, input.id, input)
      ),
    deleteEmployee: protectedWithPermission("payroll", "delete")
      .input(z.object({ projectId, id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        financeDb.deleteEmployee(ctx.user!.id, input.projectId, input.id)
      ),
    salaryPaymentsList: protectedWithPermission("payroll", "read")
      .input(
        z.object({
          projectId,
          monthKey: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .optional(),
        })
      )
      .query(({ ctx, input }) =>
        financeDb.getSalaryPayments(
          ctx.user!.id,
          input.projectId,
          input.monthKey
        )
      ),
    disburseSalary: inputOnlyWithPermission("payroll", "create")
      .input(
        z.object({
          projectId,
          employeeId: z.number().int().positive(),
          monthKey: z.string().regex(/^\d{4}-\d{2}$/),
          baseSalary: z.number().finite().nonnegative(),
          bonusAmount: z.number().finite().nonnegative().default(0),
          allowanceAmount: z.number().finite().nonnegative().default(0),
          advanceDeduction: z.number().finite().nonnegative().default(0),
          otherDeduction: z.number().finite().nonnegative().default(0),
          paidAmount: z.number().finite().nonnegative().optional(),
          paymentDate: z.coerce.date().optional(),
          accountId: z.number().int().positive().nullable().optional(),
          notes: z.string().max(500).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.disburseSalary(ctx.user!.id, input)
      ),
    employeeAdvancesList: protectedWithPermission("payroll", "read")
      .input(
        z.object({
          projectId,
          employeeId: z.number().int().positive().optional(),
        })
      )
      .query(({ ctx, input }) =>
        financeDb.getEmployeeAdvances(
          ctx.user!.id,
          input.projectId,
          input.employeeId
        )
      ),
    createEmployeeAdvance: inputOnlyWithPermission("payroll", "create")
      .use(idempotent)
      .input(
        z.object({
          projectId,
          employeeId: z.number().int().positive(),
          amount: z.number().finite().positive(),
          disbursedDate: z.coerce.date().optional(),
          accountId: z.number().int().positive().nullable().optional(),
          notes: z.string().max(500).optional(),
          idempotencyKey: z.string().min(8).max(255).optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        financeDb.createEmployeeAdvance(ctx.user!.id, input)
      ),
    cloudBackupStatus: protectedWithPermission("backup", "create").query(() => {
      return getCloudStorageConfig();
    }),
    triggerCloudBackup: inputOnlyWithPermission("backup", "create")
      .input(
        z.object({
          projectId,
          encryptionKey: z.string().min(6).max(128).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return executeCloudBackup(
          ctx.user!.id,
          input.projectId,
          input.encryptionKey
        );
      }),
  }),
});

export type AppRouter = typeof appRouter;
