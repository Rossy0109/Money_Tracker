import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import * as financeDb from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const amount = z.number().finite().positive().max(999999999999.99);
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM format");

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  finance: router({
    overview: protectedProcedure.query(({ ctx }) => financeDb.getOverview(ctx.user.id)),
    transactions: protectedProcedure
      .input(z.object({ type: z.enum(["income", "expense"]).optional() }).optional())
      .query(({ ctx, input }) => financeDb.listTransactions(ctx.user.id, input?.type)),
    addTransaction: protectedProcedure
      .input(z.object({
        accountId: z.number().int().positive().optional(),
        categoryId: z.number().int().positive(),
        type: z.enum(["income", "expense"]),
        amount,
        paymentMethod: z.string().trim().min(1).max(100),
        note: z.string().max(500).optional(),
        occurredAt: z.coerce.date(),
      }))
      .mutation(({ ctx, input }) => financeDb.createTransaction(ctx.user.id, { ...input, amount: input.amount.toFixed(2) })),
    deleteTransaction: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => financeDb.deleteTransaction(ctx.user.id, input.id)),
    addAccount: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: z.number().finite().min(-999999999999.99).max(999999999999.99) }))
      .mutation(({ ctx, input }) => financeDb.createAccount(ctx.user.id, { ...input, openingBalance: input.openingBalance.toFixed(2) })),
    categories: protectedProcedure.query(({ ctx }) => financeDb.listCategories(ctx.user.id)),
    budgets: protectedProcedure
      .input(z.object({ monthKey }))
      .query(({ ctx, input }) => financeDb.listBudgets(ctx.user.id, input.monthKey)),
    saveBudget: protectedProcedure
      .input(z.object({ categoryId: z.number().int().positive(), monthKey, amount }))
      .mutation(({ ctx, input }) => financeDb.upsertBudget(ctx.user.id, { ...input, amount: input.amount.toFixed(2) })),
    addBill: protectedProcedure
      .input(z.object({ title: z.string().trim().min(1).max(180), amount, dueAt: z.coerce.date() }))
      .mutation(({ ctx, input }) => financeDb.createBill(ctx.user.id, { ...input, amount: input.amount.toFixed(2) })),
    setBillPaid: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), isPaid: z.boolean() }))
      .mutation(({ ctx, input }) => financeDb.setBillPaid(ctx.user.id, input.id, input.isPaid)),
  }),
});

export type AppRouter = typeof appRouter;
