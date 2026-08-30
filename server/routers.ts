import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import * as financeDb from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { createHeartbeatJob } from "./_core/heartbeat";
import { sdk } from "./_core/sdk";
import { hashPassword, verifyPassword } from "./_core/passwordAuth";
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

const transactionSearchInput = z.object({
  projectId,
  query: z.string().trim().min(1).max(180).optional(),
  categoryId: z.number().int().positive().optional(),
  type: z.enum(["income", "expense"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minAmount: z.number().finite().nonnegative().max(999999999999.99).optional(),
  maxAmount: z.number().finite().nonnegative().max(999999999999.99).optional(),
  limit: z.number().int().min(1).max(200).default(100),
}).superRefine((input, context) => {
  if (input.from && input.to && input.from > input.to) context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "শেষের তারিখ শুরুর তারিখের আগে হতে পারে না" });
  if (input.minAmount !== undefined && input.maxAmount !== undefined && input.minAmount > input.maxAmount) context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxAmount"], message: "সর্বোচ্চ পরিমাণ সর্বনিম্ন পরিমাণের চেয়ে কম হতে পারে না" });
});

const backupAmount = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d{1,2})?$/)]);
const backupDate = z.coerce.date();
const backupAccount = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: backupAmount, currentBalance: backupAmount });
const backupCategory = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120), type: z.enum(["income", "expense"]), isDefault: z.boolean().optional().default(false) });
const backupTransaction = z.object({ id: z.number().int().positive(), accountId: z.number().int().positive().nullable().optional(), categoryId: z.number().int().positive(), type: z.enum(["income", "expense"]), amount: backupAmount, voucherNo: z.string().max(80).nullable().optional(), reason: z.string().max(180).nullable().optional(), paymentMethod: z.string().trim().min(1).max(100), note: z.string().max(500).nullable().optional(), occurredAt: backupDate });
const backupBudget = z.object({ id: z.number().int().positive(), categoryId: z.number().int().positive(), monthKey, amount: backupAmount });
const backupBill = z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(180), amount: backupAmount, dueAt: backupDate, isPaid: z.boolean(), reminderDaysBefore: z.number().int().min(0).max(90).default(3), lastReminderAt: backupDate.nullable().optional() });
const backupDue = z.object({ id: z.number().int().positive(), type: z.enum(["debt", "receivable"]), counterparty: z.string().trim().min(1).max(180), originalAmount: backupAmount, outstandingAmount: backupAmount, voucherNo: z.string().max(80).nullable().optional(), reason: z.string().max(180).nullable().optional(), note: z.string().max(500).nullable().optional(), openedAt: backupDate, dueAt: backupDate.nullable().optional() });
const backupSettlement = z.object({ id: z.number().int().positive(), dueId: z.number().int().positive(), accountId: z.number().int().positive().nullable().optional(), amount: backupAmount, voucherNo: z.string().max(80).nullable().optional(), note: z.string().max(500).nullable().optional(), occurredAt: backupDate });
const backupRecurring = z.object({ id: z.number().int().positive(), accountId: z.number().int().positive().nullable().optional(), categoryId: z.number().int().positive(), type: z.enum(["income", "expense"]), amount: backupAmount, paymentMethod: z.string().trim().min(1).max(100), note: z.string().max(500).nullable().optional(), frequency: z.enum(["weekly", "monthly"]), scheduleDay: z.number().int().min(1).max(31), nextRunAt: backupDate, lastGeneratedAt: backupDate.nullable().optional() });
const projectBackupInput = z.object({
  formatVersion: z.literal("finance-project-backup-v1"),
  exportedAt: backupDate,
  project: z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(120) }),
  accounts: z.array(backupAccount).max(10000),
  categories: z.array(backupCategory).max(10000),
  transactions: z.array(backupTransaction).max(10000),
  budgets: z.array(backupBudget).max(10000),
  bills: z.array(backupBill).max(10000),
  dues: z.array(backupDue).max(10000),
  settlements: z.array(backupSettlement).max(10000),
  recurring: z.array(backupRecurring).max(10000),
  voucherSettings: z.object({ prefix: z.string().max(24), startNumber: z.number().int().positive(), endNumber: z.number().int().positive(), nextNumber: z.number().int().positive() }).nullable().optional(),
}).superRefine((backup, context) => {
  if (backup.voucherSettings && backup.voucherSettings.startNumber > backup.voucherSettings.endNumber) context.addIssue({ code: z.ZodIssueCode.custom, path: ["voucherSettings", "endNumber"], message: "ভাউচার রেঞ্জ সঠিক নয়" });
});

function userSessionFromRequest(request: { headers: { cookie?: string } }) {
  const entry = request.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
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
          password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে").max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const passwordHash = hashPassword(input.password);
          const user = await financeDb.createPasswordUser({
            name: input.name,
            email: input.email,
            passwordHash,
          });

          if (user.status === "pending") {
            return {
              success: true,
              pendingApproval: true,
              message: "রেজিস্ট্রেশন সফল হয়েছে! আপনার অ্যাকাউন্টটি বর্তমানে অ্যাডমিন অনুমোদনের অপেক্ষায় রয়েছে। অনুমোদন পাওয়ার পর আপনি লগইন করতে পারবেন।",
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
        const user = await financeDb.getUserByEmail(input.email);
        if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "ভুল ইমেইল অথবা পাসওয়ার্ড। আবার চেষ্টা করুন।",
          });
        }

        if (user.status === "pending") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
          });
        }

        if (user.status === "suspended") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
          });
        }

        await financeDb.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
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
    updateUserStatus: adminProcedure.input(z.object({ password: z.string().min(1).max(128), targetUserId: z.number().int().positive(), status: z.enum(["pending", "active", "suspended"]) })).mutation(async ({ input }) => {
      if (!hasValidAdminPassword(input.password)) throw new TRPCError({ code: "FORBIDDEN", message: "Administrator verification failed" });
      const updated = await financeDb.updateUserStatus(input.targetUserId, input.status);
      return { success: true, user: updated };
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
    budgetPlan: protectedProcedure.input(z.object({ projectId, monthKey })).query(({ ctx, input }) => financeDb.getBudgetPlan(ctx.user.id, input.projectId, input.monthKey)),
    analytics: protectedProcedure.input(z.object({ projectId, months: z.number().int().min(3).max(12).default(6) })).query(({ ctx, input }) => financeDb.getFinanceAnalytics(ctx.user.id, input.projectId, input.months)),
    searchTransactions: protectedProcedure.input(transactionSearchInput).query(({ ctx, input }) => financeDb.searchTransactions(ctx.user.id, input)),
    automationOverview: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.getAutomationOverview(ctx.user.id, input.projectId)),
    monthlyReport: protectedProcedure.input(z.object({ projectId, monthKey })).query(({ ctx, input }) => financeDb.getMonthlyReport(ctx.user.id, input.projectId, input.monthKey)),
    voucherSettings: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.getVoucherSettings(ctx.user.id, input.projectId)),
    saveVoucherSettings: protectedProcedure.input(z.object({ projectId, prefix: z.string().trim().max(20), startNumber: z.number().int().positive(), endNumber: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.updateVoucherSettings(ctx.user.id, input)),
    exportData: protectedProcedure.query(({ ctx }) => financeDb.exportUserData(ctx.user.id)),
    exportProjectBackup: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.exportProjectBackup(ctx.user.id, input.projectId)),
    previewProjectBackup: protectedProcedure.input(z.object({ backup: projectBackupInput })).mutation(({ input }) => financeDb.previewProjectBackup(input.backup)),
    restoreProjectBackup: protectedProcedure.input(z.object({ projectName: z.string().trim().min(1).max(120), confirmation: z.literal("RESTORE_NEW_PROJECT"), backup: projectBackupInput })).mutation(({ ctx, input }) => financeDb.restoreProjectBackup(ctx.user.id, { projectName: input.projectName, backup: input.backup })),
    households: protectedProcedure.query(({ ctx }) => financeDb.listHouseholds(ctx.user.id)),
    householdInvitations: protectedProcedure.query(({ ctx }) => financeDb.listHouseholdInvitations(ctx.user.id)),
    createHousehold: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(({ ctx, input }) => financeDb.createHousehold(ctx.user.id, input.name)),
    householdOverview: protectedProcedure.input(z.object({ householdId: z.number().int().positive() })).query(({ ctx, input }) => financeDb.getHouseholdOverview(ctx.user.id, input.householdId)),
    inviteHouseholdMember: protectedProcedure.input(z.object({ householdId: z.number().int().positive(), email: z.string().trim().email().max(320), displayName: z.string().trim().max(120).optional(), role: z.enum(["editor", "viewer"]) })).mutation(({ ctx, input }) => financeDb.inviteHouseholdMember(ctx.user.id, input)),
    acceptHouseholdInvitation: protectedProcedure.input(z.object({ membershipId: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.acceptHouseholdInvitation(ctx.user.id, input.membershipId)),
    updateHouseholdMember: protectedProcedure.input(z.object({ householdId: z.number().int().positive(), membershipId: z.number().int().positive(), role: z.enum(["editor", "viewer"]).optional(), status: z.literal("revoked").optional() }).refine(input => input.role !== undefined || input.status !== undefined, "পরিবর্তনের তথ্য দিন")).mutation(({ ctx, input }) => financeDb.updateHouseholdMember(ctx.user.id, input)),
    saveSharedHouseholdBudget: protectedProcedure.input(z.object({ householdId: z.number().int().positive(), label: z.string().trim().min(1).max(120), monthKey, amount })).mutation(({ ctx, input }) => financeDb.saveSharedBudget(ctx.user.id, input)),
    addSharedHouseholdExpense: protectedProcedure.input(z.object({ householdId: z.number().int().positive(), budgetId: z.number().int().positive(), amount, note: z.string().trim().max(500).optional(), occurredAt: z.coerce.date() })).mutation(({ ctx, input }) => financeDb.addSharedExpense(ctx.user.id, input)),
    addTransaction: protectedProcedure.input(transactionInput).mutation(({ ctx, input }) => financeDb.createTransaction(ctx.user.id, input)),
    updateTransaction: protectedProcedure.input(transactionInput.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return financeDb.updateTransaction(ctx.user.id, id, values);
    }),
    deleteTransaction: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteTransaction(ctx.user.id, input.projectId, input.id)),
    addDue: protectedProcedure.input(z.object({ projectId, type: z.enum(["debt", "receivable"]), counterparty: z.string().trim().min(1).max(180), amount, note: z.string().trim().max(500).optional(), openedAt: z.coerce.date(), dueAt: z.coerce.date().optional() })).mutation(({ ctx, input }) => financeDb.createDue(ctx.user.id, input)),
    settleDue: protectedProcedure.input(z.object({ projectId, dueId: z.number().int().positive(), accountId: z.number().int().positive().optional(), amount, note: z.string().trim().max(500).optional(), occurredAt: z.coerce.date() })).mutation(({ ctx, input }) => financeDb.settleDue(ctx.user.id, input)),
    addAccount: protectedProcedure.input(z.object({ projectId, name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: z.number().finite().min(-999999999999.99).max(999999999999.99) })).mutation(({ ctx, input }) => financeDb.createAccount(ctx.user.id, input)),
    updateAccount: protectedProcedure.input(z.object({ id: z.number().int().positive(), projectId, name: z.string().trim().min(1).max(120), type: z.enum(["cash", "bank", "mobile"]), openingBalance: z.number().finite().min(-999999999999.99).max(999999999999.99) })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return financeDb.updateAccount(ctx.user.id, id, values);
    }),
    deleteAccount: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteAccount(ctx.user.id, input.projectId, input.id)),
    saveBudget: protectedProcedure.input(z.object({ projectId, categoryId: z.number().int().positive(), monthKey, amount })).mutation(({ ctx, input }) => financeDb.upsertBudget(ctx.user.id, input)),
    addBill: protectedProcedure.input(z.object({ projectId, title: z.string().trim().min(1).max(180), amount, dueAt: z.coerce.date(), reminderDaysBefore: z.number().int().min(0).max(90).default(3) })).mutation(({ ctx, input }) => financeDb.createBill(ctx.user.id, input)),
    updateBill: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), title: z.string().trim().min(1).max(180), amount, dueAt: z.coerce.date(), isPaid: z.boolean(), reminderDaysBefore: z.number().int().min(0).max(90).optional() })).mutation(({ ctx, input }) => {
      const { id, projectId: scopedProjectId, ...values } = input;
      return financeDb.updateBill(ctx.user.id, scopedProjectId, id, values);
    }),
    setBillPaid: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), isPaid: z.boolean() })).mutation(({ ctx, input }) => financeDb.setBillPaid(ctx.user.id, input.projectId, input.id, input.isPaid)),
    deleteBill: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteBill(ctx.user.id, input.projectId, input.id)),
    addRecurringTemplate: protectedProcedure.input(transactionInput.extend({ frequency: z.enum(["weekly", "monthly"]), scheduleDay: z.number().int().min(1).max(31), nextRunAt: z.coerce.date() }).omit({ occurredAt: true })).mutation(({ ctx, input }) => financeDb.createRecurringTemplate(ctx.user.id, input)),
    setRecurringActive: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), isActive: z.boolean() })).mutation(({ ctx, input }) => financeDb.updateRecurringTemplate(ctx.user.id, input)),
    generateRecurringNow: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.generateRecurringNow(ctx.user.id, input.projectId, input.id)),
    enableRecurringSchedule: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const job = await createHeartbeatJob({ name: `finance-recurring-${ctx.user.id}-${input.id}`, cron: "0 5 0 * * *", path: "/api/scheduled/finance-recurring", description: "Daily check for a user-controlled recurring finance transaction" }, userSessionFromRequest(ctx.req));
      await financeDb.setRecurringScheduleTask(ctx.user.id, input.projectId, input.id, job.taskUid);
      return job;
    }),
    invoices: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.listInvoices(ctx.user.id, input.projectId)),
    invoiceById: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).query(({ ctx, input }) => financeDb.getInvoiceById(ctx.user.id, input.projectId, input.id)),
    createInvoice: protectedProcedure.input(z.object({
      projectId,
      invoiceNumber: z.string().trim().max(64).optional(),
      clientName: z.string().trim().min(1).max(160),
      clientPhone: z.string().trim().max(40).optional(),
      clientEmail: z.string().trim().email().max(320).optional().or(z.literal("")),
      clientAddress: z.string().max(500).optional(),
      clientBinTin: z.string().max(64).optional(),
      issueDate: z.coerce.date(),
      dueDate: z.coerce.date(),
      discountAmount: z.number().finite().nonnegative().optional(),
      notesTerms: z.string().max(1000).optional(),
      items: z.array(
        z.object({
          description: z.string().trim().min(1).max(255),
          quantity: z.number().finite().positive(),
          unitPrice: z.number().finite().nonnegative(),
          vatRate: z.number().finite().nonnegative().optional(),
        })
      ).min(1),
    })).mutation(({ ctx, input }) => financeDb.createInvoice(ctx.user.id, {
      ...input,
      clientEmail: input.clientEmail || undefined,
    })),
    updateInvoiceStatus: protectedProcedure.input(z.object({
      projectId,
      id: z.number().int().positive(),
      status: z.enum(["draft", "unpaid", "partially_paid", "paid", "overdue", "cancelled"]),
      paidAmount: z.number().finite().nonnegative().optional(),
    })).mutation(({ ctx, input }) => financeDb.updateInvoiceStatus(ctx.user.id, input.projectId, input.id, {
      status: input.status,
      paidAmount: input.paidAmount,
    })),
    deleteInvoice: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteInvoice(ctx.user.id, input.projectId, input.id)),
    financialStatements: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.getFinancialStatements(ctx.user.id, input.projectId)),
    inventoryList: protectedProcedure.input(z.object({ projectId })).query(({ ctx, input }) => financeDb.listInventoryItems(ctx.user.id, input.projectId)),
    createInventoryItem: protectedProcedure.input(z.object({
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
    })).mutation(({ ctx, input }) => financeDb.createInventoryItem({ ...input, userId: ctx.user.id })),
    updateInventoryItem: protectedProcedure.input(z.object({
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
    })).mutation(({ ctx, input }) => financeDb.updateInventoryItem(ctx.user.id, input.projectId, input.id, input)),
    adjustInventoryStock: protectedProcedure.input(z.object({
      projectId,
      id: z.number().int().positive(),
      quantityChange: z.number().finite(),
      reason: z.string().trim().min(1).max(180),
    })).mutation(({ ctx, input }) => financeDb.adjustInventoryStock(ctx.user.id, input.projectId, input.id, input.quantityChange, input.reason)),
    deleteInventoryItem: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive() })).mutation(({ ctx, input }) => financeDb.deleteInventoryItem(ctx.user.id, input.projectId, input.id)),
    syncOfflineTransactions: protectedProcedure.input(z.object({
      projectId,
      items: z.array(transactionInput),
    })).mutation(async ({ ctx, input }) => {
      const results = [];
      for (const item of input.items) {
        const created = await financeDb.createTransaction(ctx.user.id, item);
        results.push(created);
      }
      return { syncedCount: results.length, transactions: results };
    }),
    enableBillReminder: protectedProcedure.input(z.object({ projectId, id: z.number().int().positive(), reminderDaysBefore: z.number().int().min(0).max(90) })).mutation(async ({ ctx, input }) => {
      await financeDb.setBillReminderSettings(ctx.user.id, input.projectId, input.id, input.reminderDaysBefore);
      const job = await createHeartbeatJob({ name: `finance-bill-reminder-${ctx.user.id}-${input.id}`, cron: "0 0 8 * * *", path: "/api/scheduled/finance-bill-reminder", description: "Daily check for a user-controlled finance bill reminder" }, userSessionFromRequest(ctx.req));
      await financeDb.setBillScheduleTask(ctx.user.id, input.projectId, input.id, job.taskUid);
      return job;
    }),
  }),
});

export type AppRouter = typeof appRouter;
