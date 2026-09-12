import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { timingSafeCompare } from "../timingSafe";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (ctx.user.status === "pending") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
    });
  }

  if (ctx.user.status === "suspended") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const elevatedAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const hasActiveSession = Boolean(ctx.adminElevation && ctx.adminElevation.userId === ctx.user.id);
    const rawInput = (opts as any).rawInput;
    const inputPassword = (rawInput && typeof rawInput === "object" && "password" in rawInput && typeof rawInput.password === "string")
      ? rawInput.password
      : undefined;
    const hasInlinePassword = Boolean(inputPassword && timingSafeCompare(inputPassword, ENV.adminAccessPassword));

    if (!hasActiveSession && !hasInlinePassword) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Administrator elevation session required or expired. Please re-verify password.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        adminElevation: ctx.adminElevation,
      },
    });
  }),
);

