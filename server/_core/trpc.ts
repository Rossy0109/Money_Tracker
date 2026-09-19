import { INPUT_ONLY_ERR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { timingSafeCompare } from "../timingSafe";
import { requirePermission, requireAnyPermission, requireAllPermissions, requireRole, requireAnyRole, requireResourcePermission, requireAnyResourcePermission, requireAllResourcePermissions } from "./authz";
import { hasAnyPermission } from "./rbac";
import { checkIdempotency, storeIdempotency, hashRequest } from "./idempotency";

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
      message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireCreatePermission = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (ctx.user.status === "pending") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
    });
  }

  if (ctx.user.status === "suspended") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
    });
  }

  // Check if user has any create permission (accounting, budget, payroll, voucher)
  const hasCreatePerm = await hasAnyPermission(ctx.user.id, [
    "accounting.create",
    "budget.create",
    "payroll.create",
    "voucher.create",
  ]);

  if (!hasCreatePerm) {
    throw new TRPCError({ code: "FORBIDDEN", message: INPUT_ONLY_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

export const inputOnlyProcedure = t.procedure.use(requireCreatePermission);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    if (ctx.user.status === "pending") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
      });
    }

    if (ctx.user.status === "suspended") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
      });
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

    if (ctx.user.status === "pending") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
      });
    }

    if (ctx.user.status === "suspended") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
      });
    }

    const hasActiveSession = Boolean(ctx.adminElevation && ctx.adminElevation.userId === ctx.user.id);
    let rawInput: any;
    if (typeof (opts as any).getRawInput === "function") {
      try {
        rawInput = await (opts as any).getRawInput();
      } catch {
        rawInput = (opts as any).rawInput;
      }
    } else {
      rawInput = (opts as any).rawInput;
    }

    const inputPassword = (rawInput && typeof rawInput === "object" && "password" in rawInput && typeof rawInput.password === "string")
      ? rawInput.password
      : undefined;
    const expectedPassword = ENV.adminAccessPassword || process.env.ADMIN_ACCESS_PASSWORD || "";
    const hasInlinePassword = Boolean(inputPassword && expectedPassword && timingSafeCompare(inputPassword, expectedPassword));

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

export const permissionProcedure = {
  require: requirePermission,
  requireAny: requireAnyPermission,
  requireAll: requireAllPermissions,
  role: requireRole,
  roleAny: requireAnyRole,
  resource: requireResourcePermission,
  resourceAny: requireAnyResourcePermission,
  resourceAll: requireAllResourcePermissions,
};

/**
 * Idempotency middleware — wraps a mutation to prevent duplicate execution.
 *
 * Usage: chain `.input(z.object({ idempotencyKey: z.string(), ... }))` then
 *        `.use(idempotent)` on the mutation.
 *
 * The middleware:
 *  1. Extracts `idempotencyKey` from input.
 *  2. Hashes the full input body for payload fingerprinting.
 *  3. Checks the idempotency_keys table.
 *  4. Returns cached response if replay detected.
 *  5. Executes handler, stores result on success.
 */
export const idempotent = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  // Extract rawInput using getRawInput() if available (tRPC v11)
  let rawInput: any;
  if (typeof (opts as any).getRawInput === "function") {
    try {
      rawInput = await (opts as any).getRawInput();
    } catch {
      rawInput = (opts as any).rawInput;
    }
  } else {
    rawInput = (opts as any).rawInput;
  }

  // Extract idempotency key from input
  const input = rawInput as Record<string, unknown> | undefined;
  const idempotencyKey =
    input && typeof input === "object" && "idempotencyKey" in input
      ? String((input as any).idempotencyKey)
      : null;

  // If no key provided, skip idempotency check (pass-through)
  if (!idempotencyKey || !ctx.user) {
    return next(opts);
  }

  const route = ctx.req?.path ?? "unknown";
  const requestHash = hashRequest(rawInput);

  // Check for existing idempotency record
  const existing = await checkIdempotency(
    ctx.user.id,
    idempotencyKey,
    route,
    requestHash,
  );

  if (existing.isReplay) {
    // Return cached response — do NOT re-execute the handler
    const body = existing.body ? JSON.parse(existing.body) : {};
    throw new TRPCError({
      code: "OK" as any,
      message: JSON.stringify(body),
    });
  }

  // Execute the handler
  const result = await next(opts);

  // Store the idempotency record on successful mutation
  if (!result.ok) {
    // Handler threw — don't store, allow retry with same key
    return result;
  }

  try {
    await storeIdempotency(
      ctx.user.id,
      idempotencyKey,
      route,
      requestHash,
      200, // successful mutations return 200
      result.data,
    );
  } catch {
    // Best-effort: if store fails, still return the result
  }

  return result;
});

/**
 * Helper: create an idempotent mutation procedure.
 * Usage in routers:
 *   inputOnlyWithPermission("voucher", "create")
 *     .use(idempotent)
 *     .input(z.object({ idempotencyKey: z.string(), ... }))
 *     .mutation(async ({ ctx, input }) => { ... })
 */

