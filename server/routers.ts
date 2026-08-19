import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import * as financeDb from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const amount = z.number().finite().positive().max(999999999999.99);
const projectId = z.number().int().positive();
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM format");
const auditFilters = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), actorUserId: z.number().int().positive().optional(), actorRole: z.enum(["admin", "user"]).optional(), search: z.string().trim().min(1).max(120).optional() });

function hasValidAdminPassword(candidate: string) {
  const expected = Buffer.from(ENV.adminAccessPassword);
  const received = Buffer.from(candidate);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

const transactionInput = z.object({
  projectId,
  accountId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  amount,
  paymentMethod: z.string().trim().min(1).max(100),
  note: z.string().max(500).optional(),
  occurredAt: z.coerce.date(),
});

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
  admin: router({
    verifyAccess: adminProcedure.input(z.object({ password: z.string().min(1).max(128) })).mutation(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return { verified: true } as const;
    }),
    users: adminProcedure.input(z.object({ password: z.string().min(1).max(128) })).query(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return financeDb.listUsersForAdmin();
    }),
    projects: adminProcedure.input(z.object({ password: z.string().min(1).max(128) })).query(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return financeDb.listProjectsForAdmin();
    }),
    auditLogs: adminProcedure.input(auditFilters.extend({ password: z.string().min(1).max(128), page: z.number().int().positive().default(1), pageSize: z.number().int().min(10).max(100).default(25) })).query(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return financeDb.listAuditLogsPage({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search, page: input.page, pageSize: input.pageSize });
    }),
    auditLogExport: adminProcedure.input(auditFilters.extend({ password: z.string().min(1).max(128) })).query(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return financeDb.listAuditLogsForExport({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search });
    }),
    auditActivity: adminProcedure.input(auditFilters.extend({ password: z.string().min(1).max(128) })).query(({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      return financeDb.getAuditLogActivity({ from: input.from, to: input.to, actorUserId: input.actorUserId, actorRole: input.actorRole, search: input.search });
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => financeDb.listProjects(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(({ ctx, input }) => financeDb.createProject(ctx.user.id, input.name)),
  }),
  finance: router({
    overview: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.getOverview(ctx.user.id, input.projectId)),
    exportData: protectedProcedure.query(({ ctx }) => financeDb.exportUserData(ctx.user.id)),
    addTransaction: protectedProcedure.input(transactionInput).mutation(({ ctx, input }) => financeDb.createTransaction(ctx.user.id, input)),
    updateTransaction: protectedProcedure.input(transactionInput.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return financeDb.updateTransaction(ctx.user.id, id, values);
    }),
    deleteTransaction: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteTransaction(ctx.user.id, input.projectId, input.id)),
    addAccount: protectedProcedure.input(z.object({ projectId, name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: z.number().finite().min(-999999999999.99).max(999999999999.99) })).mutation(({ ctx, input }) => financeDb.createAccount(ctx.user.id, input)),
    updateAccount: protectedProcedure.input(z.object({ id: z.number().int().positive(), projectId, name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: z.number().finite().min(-999999999999.99).max(999999999999.99) })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return financeDb.updateAccount(ctx.user.id, id, values);
    }),
    deleteAccount: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteAccount(ctx.user.id, input.projectId, input.id)),
    saveBudget: protectedProcedure.input(z.object({ projectId, categoryId: z.number().int().positive(), monthKey, amount })).mutation(({ ctx, input }) => financeDb.upsertBudget(ctx.user.id, input)),
    addBill: protectedProcedure.input(z.object({ projectId, title: z.string().trim().min(1).max(180), amount, dueAt: z.coerce.date() })).mutation(({ ctx, input }) => financeDb.createBill(ctx.user.id, input)),
    updateBill: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), title: z.string().trim().min(1).max(180), amount, dueAt: z.coerce.date(), isPaid: z.boolean() })).mutation(({ ctx, input }) => {
      const { id, projectId: scopedProjectId, ...values } = input;
      return financeDb.updateBill(ctx.user.id, scopedProjectId, id, values);
    }),
    setBillPaid: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), isPaid: z.boolean() })).mutation(({ ctx, input }) => financeDb.setBillPaid(ctx.user.id, input.projectId, input.id, input.isPaid)),
    deleteBill: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteBill(ctx.user.id, input.projectId, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
