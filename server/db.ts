import { and, asc, desc, eq, gte, isNull, isNotNull, like, lt, lte, or, sql } from "drizzle-orm";
import {
  getDb,
  closeDatabaseConnection,
  databaseRequired,
} from "./_core/dbConnection";
import {
  auditLogs,
  financeAccounts,
  financeBills,
  financeBudgets,
  financeCategories,
  financeDues,
  financeDueSettlements,
  financeHouseholdMembers,
  financeHouseholds,
  financeInvoices,
  financeInvoiceItems,
  financeInventoryItems,
  financeEmployees,
  financeSalaryPayments,
  financeEmployeeAdvances,
  financeProjects,
  financePrivateStorageObjects,
  financeRecurringTransactions,
  financeSharedBudgets,
  financeSharedExpenses,
  financeTransactions,
  financeVoucherSettings,
  financeVouchers,
  financeVoucherDebits,
  financeVoucherCredits,
  financeLedgerEntries,
  financeVoucherReferences,
  financeVoucherAudit,
  financeAccountTypes,
  financeChartOfAccounts,
  financePeriodLocks,
  financeVoucherReversals,
  financeBankReconciliations,
  financeBankReconciliationItems,
  financeAccountGroups,
  financeFiscalPeriods,
  financeJournalEntries,
  financeJournalLines,
  userSessions,
  failedLoginAttempts,
  loginHistory,
  InsertUser,
  users,
  roles,
  userRoles,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { timingSafeCompare } from "./timingSafe";
import { assignRole } from "./_core/rbac";
import { calculateDueSettlement } from "./dueAccounting";
import {
  calculateBudgetAlerts,
  calculateBudgetEarlyWarnings,
  calculateBurnRateAnomalies,
  DEFAULT_CATEGORIES,
} from "./finance.constants";
import { calculateSharedBudgetProgress } from "./householdAccounting";
import {
  summarizeHouseholdContributorMonthlySpend,
  summarizeHouseholdContributorSpend,
} from "./householdContributorAnalysis";
import {
  canDownloadPrivateObject,
  type PrivateObjectScope,
} from "./privateStorageAccess";

export { getDb, closeDatabaseConnection, databaseRequired };

const DEFAULT_PROJECT_NAME = "দৈনিক লেনদেনের খাতা";

type DbHandle = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DbTx = Parameters<Parameters<DbHandle["transaction"]>[0]>[0];
type DbOrTx = DbHandle | DbTx;

function decimal(value: number) {
  return value.toFixed(2);
}

function openIdMatchesOwner(openId: string, ownerOpenId: string | undefined) {
  return Boolean(ownerOpenId) && openId === ownerOpenId;
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function offsetMonthKey(targetMonthKey: string, offset: number) {
  const target = new Date(`${targetMonthKey}-01T12:00:00Z`);
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + offset, 1)
  )
    .toISOString()
    .slice(0, 7);
}

function signedAmount(type: "income" | "expense", amount: string | number) {
  const amountNumber = Number(amount);
  return type === "income" ? amountNumber : -amountNumber;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  const bootstrapEmail = (ENV.adminBootstrapEmail || "").trim().toLowerCase();
  const normalizedEmail = (user.email || "").trim().toLowerCase();
  const ownerOpenId = ENV.ownerOpenId;
  // Bootstrap admin is determined only by configured email/owner identity —
  // never by a caller-supplied users.role value (legacy column is display-only).
  const isBootstrapAdmin =
    (bootstrapEmail && timingSafeCompare(normalizedEmail, bootstrapEmail)) ||
    (ownerOpenId ? timingSafeCompare(user.openId, ownerOpenId) : openIdMatchesOwner(user.openId, ownerOpenId));

  const shouldSetRole = isBootstrapAdmin || user.role !== undefined;
  values.role = isBootstrapAdmin ? "admin" : (user.role ?? "user");
  if (isBootstrapAdmin) {
    values.status = "active";
    updateSet.status = "active";
  }
  // Do not silently demote an existing administrator during an ordinary sign-in.
  // A role changes only through explicit bootstrap/administration or the existing
  // owner mapping.
  if (shouldSetRole) updateSet.role = values.role;
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });

  // Ensure user has an RBAC role (best-effort)
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);
  if (existingUser) {
    const rbacRole = isBootstrapAdmin ? "SUPER_ADMIN" : "VIEWER";
    try {
      await assignRole(existingUser.id, rbacRole, existingUser.id);
    } catch {
      // Best-effort; RBAC tables may not exist yet during migration
    }
  }
}

/** Session management functions */

export async function createUserSession(
  userId: number,
  sessionToken: string,
  refreshToken: string,
  userAgent: string | null,
  ipAddress: string | null,
  accessTokenExpiresAt: Date,
  refreshTokenExpiresAt: Date
) {
  const db = databaseRequired(await getDb());
  const result = await db.insert(userSessions).values({
    userId,
    sessionToken,
    refreshToken,
    userAgent,
    ipAddress,
    issuedAt: new Date(),
    expiresAt: refreshTokenExpiresAt,
  });
  return Number(result[0].insertId);
}

export async function getSessionByRefreshToken(refreshToken: string) {
  const db = databaseRequired(await getDb());
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.refreshToken, refreshToken))
    .limit(1);
  return session;
}

export async function revokeSession(refreshToken: string) {
  const db = databaseRequired(await getDb());
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.refreshToken, refreshToken));
}

/** Revoke a session by its session JWT (used on logout). */
export async function revokeSessionByToken(sessionToken: string) {
  const db = databaseRequired(await getDb());
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.sessionToken, sessionToken));
}

export async function revokeAllUserSessions(userId: number) {
  const db = databaseRequired(await getDb());
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.userId, userId));
}

/**
 * Look up a session by its JWT string and report whether it has been revoked.
 * Returns [] when the token was never recorded (legacy/OAuth cookie) or is active.
 * Returns a row only when revokedAt is set — callers reject those tokens.
 */
export async function findRevokedSessionByToken(sessionToken: string) {
  const db = databaseRequired(await getDb());
  return db
    .select({ id: userSessions.id, revokedAt: userSessions.revokedAt })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionToken, sessionToken),
        isNotNull(userSessions.revokedAt)
      )
    )
    .limit(1);
}

export async function updateSessionLastUsed(refreshToken: string) {
  const db = databaseRequired(await getDb());
  await db
    .update(userSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(userSessions.refreshToken, refreshToken));
}

export async function cleanupExpiredSessions() {
  const db = databaseRequired(await getDb());
  await db
    .delete(userSessions)
    .where(lt(userSessions.expiresAt, new Date()));
}

export async function countActiveSessions(userId: number): Promise<number> {
  const db = databaseRequired(await getDb());
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gte(userSessions.expiresAt, new Date())
      )
    );
  return Number(result?.count ?? 0);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserIdByOpenId(openId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0]?.id ?? null;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return result[0];
}

export async function createPasswordUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const db = databaseRequired(await getDb());
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error(
      "এই ইমেইল দিয়ে ইতোমধ্যে একটি অ্যাকাউন্ট রয়েছে। অনুগ্রহ করে লগইন করুন।"
    );
  }

  const openId = `local:${normalizedEmail}`;
  const bootstrapEmail = (ENV.adminBootstrapEmail || "").trim().toLowerCase();
  const ownerOpenId = ENV.ownerOpenId;
  const isBootstrapAdmin =
    (bootstrapEmail && timingSafeCompare(normalizedEmail, bootstrapEmail)) ||
    (ownerOpenId ? timingSafeCompare(openId, ownerOpenId) : openId === ownerOpenId);
  const role = isBootstrapAdmin ? ("admin" as const) : ("user" as const);
  const status = isBootstrapAdmin ? ("active" as const) : ("pending" as const);

  await db.insert(users).values({
    openId,
    name: input.name.trim() || normalizedEmail.split("@")[0],
    email: normalizedEmail,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    role,
    status,
    lastSignedIn: new Date(),
  });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  if (user) {
    await ensureDefaultProject(user.id);
    // Assign default RBAC role
    const rbacRole = isBootstrapAdmin ? "SUPER_ADMIN" : "VIEWER";
    try {
      await assignRole(user.id, rbacRole, user.id);
    } catch {
      // Best-effort; RBAC tables may not exist yet during migration
    }
  }
  return user;
}

export async function setUserPassword(openId: string, passwordHash: string) {
  const db = databaseRequired(await getDb());
  const result = await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
  return result;
}

/** Password reset token management */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function createPasswordResetToken(email: string) {
  const db = databaseRequired(await getDb());
  const normalizedEmail = email.trim().toLowerCase();
  
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  
  if (!user) {
    // Don't reveal if email exists for security
    return { success: true };
  }
  
  // Generate secure random token
  const crypto = await import("node:crypto");
  const resetToken = crypto.randomBytes(32).toString("base64url");
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  
  await db
    .update(users)
    .set({
      resetToken,
      resetTokenExpiresAt,
    })
    .where(eq(users.id, user.id));
  
  return { success: true, resetToken, resetTokenExpiresAt, user };
}

export async function validatePasswordResetToken(token: string) {
  const db = databaseRequired(await getDb());
  const now = new Date();
  
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.resetToken, token),
        gte(users.resetTokenExpiresAt, now)
      )
    )
    .limit(1);
  
  if (!user) {
    return { valid: false, user: null };
  }
  
  return { valid: true, user };
}

export async function consumePasswordResetToken(openId: string, newPasswordHash: string) {
  const db = databaseRequired(await getDb());
  
  await db
    .update(users)
    .set({
      passwordHash: newPasswordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.openId, openId));
  
  // Revoke all existing sessions for security
  const userId = await getUserIdByOpenId(openId);
  if (userId) {
    await revokeAllUserSessions(userId);
  }
  
  // Clear failed login attempts
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  
  if (user && user.email) {
    await clearFailedLoginAttempts(user.email, "");
  }
  
  // Record login history
  if (userId) {
    await recordLoginHistory(
      userId,
      "password_reset",
      "",
      null,
      true
    );
  }
  
  return { success: true };
}

export async function clearPasswordResetToken(openId: string) {
  const db = databaseRequired(await getDb());
  await db
    .update(users)
    .set({
      resetToken: null,
      resetTokenExpiresAt: null,
    })
    .where(eq(users.openId, openId));
}

/** Failed login attempt tracking */

export async function recordFailedLoginAttempt(identifier: string, ipAddress: string) {
  const db = databaseRequired(await getDb());
  const normalizedIdentifier = identifier.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(failedLoginAttempts)
    .where(
      and(
        eq(failedLoginAttempts.identifier, normalizedIdentifier),
        eq(failedLoginAttempts.ipAddress, ipAddress)
      )
    )
    .limit(1);

  const now = new Date();
  const lockoutDuration = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  if (existing) {
    const newAttemptCount = existing.attemptCount + 1;
    const lockedUntil = newAttemptCount >= maxAttempts
      ? new Date(now.getTime() + lockoutDuration)
      : null;

    await db
      .update(failedLoginAttempts)
      .set({
        attemptCount: newAttemptCount,
        lastAttemptAt: now,
        lockedUntil,
      })
      .where(eq(failedLoginAttempts.id, existing.id));

    return { attemptCount: newAttemptCount, lockedUntil };
  }

  const lockedUntil = maxAttempts <= 1
    ? new Date(now.getTime() + lockoutDuration)
    : null;

  await db.insert(failedLoginAttempts).values({
    identifier: normalizedIdentifier,
    ipAddress,
    attemptCount: 1,
    firstAttemptAt: now,
    lastAttemptAt: now,
    lockedUntil,
  });

  return { attemptCount: 1, lockedUntil };
}

export async function clearFailedLoginAttempts(identifier: string, ipAddress: string) {
  const db = databaseRequired(await getDb());
  const normalizedIdentifier = identifier.trim().toLowerCase();

  await db
    .delete(failedLoginAttempts)
    .where(
      and(
        eq(failedLoginAttempts.identifier, normalizedIdentifier),
        eq(failedLoginAttempts.ipAddress, ipAddress)
      )
    );
}

export async function isLockedOut(identifier: string, ipAddress: string): Promise<{ locked: boolean; lockedUntil: Date | null }> {
  const db = databaseRequired(await getDb());
  const normalizedIdentifier = identifier.trim().toLowerCase();

  const [record] = await db
    .select()
    .from(failedLoginAttempts)
    .where(
      and(
        eq(failedLoginAttempts.identifier, normalizedIdentifier),
        eq(failedLoginAttempts.ipAddress, ipAddress)
      )
    )
    .limit(1);

  if (!record) return { locked: false, lockedUntil: null };
  if (!record.lockedUntil) return { locked: false, lockedUntil: null };

  const now = new Date();
  if (record.lockedUntil <= now) {
    // Lock expired, clear the record
    await db
      .delete(failedLoginAttempts)
      .where(eq(failedLoginAttempts.id, record.id));
    return { locked: false, lockedUntil: null };
  }

  return { locked: true, lockedUntil: record.lockedUntil };
}

/** Login history tracking */

export async function recordLoginHistory(
  userId: number,
  loginMethod: string,
  ipAddress: string,
  userAgent: string | null,
  success: boolean,
  failureReason?: string
) {
  const db = databaseRequired(await getDb());
  await db.insert(loginHistory).values({
    userId,
    loginMethod,
    ipAddress,
    userAgent,
    success,
    failureReason: failureReason ?? null,
    attemptedAt: new Date(),
  });
}

export async function getLoginHistory(userId: number, limit = 50) {
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.attemptedAt))
    .limit(limit);
}

export async function cleanupOldFailedLoginAttempts() {
  const db = databaseRequired(await getDb());
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
  await db
    .delete(failedLoginAttempts)
    .where(lt(failedLoginAttempts.firstAttemptAt, cutoff));
}

export async function updateUserStatus(
  userId: number,
  status: "pending" | "active" | "suspended",
  actorUserId?: number,
  auditContext?: AuditContext
) {
  const db = databaseRequired(await getDb());
  await db.update(users).set({ status }).where(eq(users.id, userId));

  // Assign default RBAC role on activation
  if (status === "active") {
    try {
      await assignRole(userId, "VIEWER", userId);
    } catch {
      // Best-effort; RBAC seed may not have run yet
    }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  try {
    await logAudit({
      actorUserId: actorUserId ?? user?.id ?? userId,
      action: status === "suspended" ? "user_suspended" : "update",
      entityType: "user",
      entityId: userId,
      summary: status === "suspended" ? `User suspended: ${user?.email || user?.name || userId}` : `User status updated to ${status}`,
      auditContext,
    });
  } catch {
    // Non-blocking
  }

  return user;
}

async function ensureDefaultProject(userId: number) {
  const db = databaseRequired(await getDb());
  let [project] = await db
    .select()
    .from(financeProjects)
    .where(
      and(
        eq(financeProjects.userId, userId),
        eq(financeProjects.name, DEFAULT_PROJECT_NAME)
      )
    )
    .limit(1);
  if (!project) {
    try {
      await db
        .insert(financeProjects)
        .values({ userId, name: DEFAULT_PROJECT_NAME });
    } catch {
      // A concurrent first-use request may have created the same unique project.
    }
    [project] = await db
      .select()
      .from(financeProjects)
      .where(
        and(
          eq(financeProjects.userId, userId),
          eq(financeProjects.name, DEFAULT_PROJECT_NAME)
        )
      )
      .limit(1);
  }
  if (!project) throw new Error("Default project could not be created");
  return project;
}

async function ensureDefaultCategories(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  const existing = await db
    .select()
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.userId, userId),
        eq(financeCategories.projectId, projectId)
      )
    );
  const existingKeys = new Set(
    existing.map(category => `${category.type}:${category.name}`)
  );
  const missing = [
    ...DEFAULT_CATEGORIES.income.map(name => ({
      userId,
      projectId,
      name,
      type: "income" as const,
      isDefault: true,
    })),
    ...DEFAULT_CATEGORIES.expense.map(name => ({
      userId,
      projectId,
      name,
      type: "expense" as const,
      isDefault: true,
    })),
  ].filter(category => !existingKeys.has(`${category.type}:${category.name}`));
  if (missing.length) await db.insert(financeCategories).values(missing);
}

async function ensureVoucherSettings(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  await db
    .insert(financeVoucherSettings)
    .values({ userId, projectId })
    .onDuplicateKeyUpdate({ set: { projectId } });
}

function formatVoucherNumber(prefix: string, number: number) {
  return `${prefix.trim() || "V"}-${String(number).padStart(6, "0")}`;
}

async function claimNextVoucher(tx: DbTx, userId: number, projectId: number) {
  await tx
    .insert(financeVoucherSettings)
    .values({ userId, projectId })
    .onDuplicateKeyUpdate({ set: { projectId } });
  const [settings] = await tx
    .select()
    .from(financeVoucherSettings)
    .where(
      and(
        eq(financeVoucherSettings.userId, userId),
        eq(financeVoucherSettings.projectId, projectId)
      )
    )
    .limit(1);
  if (!settings) throw new Error("ভাউচার সেটিংস পাওয়া যায়নি");
  if (settings.nextNumber > settings.endNumber)
    throw new Error(
      "ভাউচার নম্বরের নির্ধারিত রেঞ্জ শেষ হয়েছে; সেটিংস থেকে রেঞ্জ বাড়ান"
    );
  const result = await tx
    .update(financeVoucherSettings)
    .set({ nextNumber: settings.nextNumber + 1 })
    .where(
      and(
        eq(financeVoucherSettings.id, settings.id),
        eq(financeVoucherSettings.nextNumber, settings.nextNumber)
      )
    );
  if (!result[0].affectedRows)
    throw new Error("ভাউচার নম্বর এখন ব্যবহৃত হচ্ছে; আবার চেষ্টা করুন");
  return formatVoucherNumber(settings.prefix, settings.nextNumber);
}

export async function createVoucherWithEntries(
  userId: number,
  input: {
    projectId: number;
    date: Date;
    narration?: string;
    debits: Array<{ accountId: number; amount: number; narration?: string }>;
    credits: Array<{ accountId: number; amount: number; narration?: string }>;
    references?: Array<{ refType: string; refNumber: string; refDate?: Date; relatedEntityType?: string; relatedEntityId?: number }>;
    status?: "draft" | "posted";
    voucherType?: string;
    fiscalPeriodId?: number;
    _internalPostedBy?: number;
  }
) {
  // Validation: Total debits must equal total credits (exact cents — align with trial balance)
  const totalDebit = input.debits.reduce((sum, d) => sum + d.amount, 0);
  const totalCredit = input.credits.reduce((sum, c) => sum + c.amount, 0);
  const totalDebitCents = Math.round(totalDebit * 100);
  const totalCreditCents = Math.round(totalCredit * 100);
  if (totalDebitCents !== totalCreditCents) {
    throw new Error("ডেবিট ও ক্রেডিটের মোট সমান হতে হবে");
  }

  // Validate minimum lines
  if (input.debits.length === 0 || input.credits.length === 0) {
    throw new Error("অন্তত একটি ডেবিট ও একটি ক্রেডিট এন্ট্রি প্রয়োজন");
  }

  // Reject negative amounts
  for (const d of input.debits) {
    if (d.amount <= 0) throw new Error("ডেবিট পরিমাণ শূন্যের বড় হতে হবে");
  }
  for (const c of input.credits) {
    if (c.amount <= 0) throw new Error("ক্রেডিট পরিমাণ শূন্যের বড় হতে হবে");
  }

  // Reject zero total (debit = credit = 0)
  if (totalDebit === 0) throw new Error("ডেবিট ও ক্রেডিটের মোট শূন্য হতে পারে না");

  // Self-posting prevention: the voucher creator cannot directly create a posted voucher.
  // Internal callers (e.g. reverseVoucher) pass _internalPostedBy to bypass this check.
  if (input.status === "posted" && !input._internalPostedBy) {
    throw new Error("সরাসরি পোস্ট করা ভাউচার তৈরি করা যাবে না; প্রথমে ড্রাফ্ট তৈরি করুন");
  }

  const { assertPeriodNotLocked } = await import("./accounting-core");
  await assertPeriodNotLocked(input.projectId, input.date);

  const db = databaseRequired(await getDb());
  const voucherStatus = input.status ?? "draft";

  return await db.transaction(async (tx) => {
    // 1. Claim voucher number
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);

    // 2. Create voucher header
    const result = await tx.insert(financeVouchers).values({
      userId,
      projectId: input.projectId,
      voucherNo,
      date: input.date,
      narration: input.narration?.trim() || null,
      totalDebit: decimal(totalDebit),
      totalCredit: decimal(totalCredit),
      status: voucherStatus,
      voucherType: input.voucherType ?? "general",
      fiscalPeriodId: input.fiscalPeriodId ?? null,
    });

    const voucherId = Number(result[0].insertId);

    // 3. Insert debit entries
    if (input.debits.length > 0) {
      await tx.insert(financeVoucherDebits).values(
        input.debits.map((d, i) => ({
          voucherId,
          accountId: d.accountId,
          amount: decimal(d.amount),
          narration: d.narration?.trim() || null,
          sortOrder: i,
        }))
      );
    }

    // 4. Insert credit entries
    if (input.credits.length > 0) {
      await tx.insert(financeVoucherCredits).values(
        input.credits.map((c, i) => ({
          voucherId,
          accountId: c.accountId,
          amount: decimal(c.amount),
          narration: c.narration?.trim() || null,
          sortOrder: i,
        }))
      );
    }

    // 5. If status is "posted", insert ledger entries + create journal entry
    if (voucherStatus === "posted") {
      await postVoucherInternals(tx, userId, input.projectId, voucherId, input.debits, input.credits);
    }

    // 6. Insert reference entries
    if (input.references && input.references.length > 0) {
      await tx.insert(financeVoucherReferences).values(
        input.references.map(r => ({
          voucherId,
          refType: r.refType as "cheque" | "bill" | "invoice" | "challan" | "other",
          refNumber: r.refNumber.trim(),
          refDate: r.refDate ?? null,
          relatedEntityType: r.relatedEntityType ?? null,
          relatedEntityId: r.relatedEntityId ?? null,
        }))
      );
    }

    // 7. Insert audit entry (WITHIN same transaction!)
    await tx.insert(financeVoucherAudit).values({
      voucherId,
      actorUserId: userId,
      action: "create",
      snapshot: JSON.stringify({
        voucherNo,
        date: input.date,
        narration: input.narration,
        totalDebit,
        totalCredit,
        debits: input.debits,
        credits: input.credits,
        references: input.references,
        status: voucherStatus,
      }),
    });

    return { voucherId, voucherNo };
  });
}

// ─── Voucher Lifecycle ────────────────────────────────────────────────────────

/**
 * Voucher state machine rules:
 *   DRAFT → SUBMITTED → APPROVED → POSTED → REVERSED
 *
 * Only DRAFT vouchers can be submitted.
 * Only SUBMITTED vouchers can be approved (or returned to draft).
 * Only APPROVED vouchers can be posted.
 * Only POSTED vouchers can be reversed.
 */

function assertVoucherTransition(current: string, target: string) {
  const allowed: Record<string, string[]> = {
    draft: ["submitted"],
    submitted: ["approved", "draft"],
    approved: ["posted", "draft"],
    posted: ["reversed"],
  };
  if (!allowed[current]?.includes(target)) {
    throw new Error(`ভাউচার ${current} থেকে ${target} এ পরিবর্তন করা যায় না`);
  }
}

/** Submit a draft voucher for approval. */
export async function submitVoucher(
  userId: number,
  projectId: number,
  voucherId: number,
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [voucher] = await db
    .select()
    .from(financeVouchers)
    .where(
      and(
        eq(financeVouchers.id, voucherId),
        eq(financeVouchers.projectId, projectId),
      )
    )
    .limit(1);
  if (!voucher) throw new Error("ভাউচার পাওয়া যায়নি");
  assertVoucherTransition(voucher.status, "submitted");

  await db
    .update(financeVouchers)
    .set({
      status: "submitted",
      submittedBy: userId,
      submittedAt: new Date(),
    })
    .where(eq(financeVouchers.id, voucherId));

  await db.insert(financeVoucherAudit).values({
    voucherId,
    actorUserId: userId,
    action: "submit",
    snapshot: JSON.stringify({ from: voucher.status, to: "submitted" }),
  });

  return { voucherId, status: "submitted" };
}

/** Approve a submitted voucher (or return to draft). */
export async function approveVoucher(
  userId: number,
  projectId: number,
  voucherId: number,
  action: "approve" | "return" = "approve",
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [voucher] = await db
    .select()
    .from(financeVouchers)
    .where(
      and(
        eq(financeVouchers.id, voucherId),
        eq(financeVouchers.projectId, projectId),
      )
    )
    .limit(1);
  if (!voucher) throw new Error("ভাউচার পাওয়া যায়নি");

  // Self-approval prevention: the voucher creator cannot approve their own voucher.
  if (action === "approve" && voucher.userId === userId) {
    throw new Error("নিজের তৈরি ভাউচার নিজে অনুমোদন করা যাবে না");
  }

  // 4-eyes (maker ≠ checker): the submitter cannot approve their own submission.
  if (action === "approve" && voucher.submittedBy === userId) {
    throw new Error("প্রস্তুতকারক নিজে অনুমোদন করতে পারবেন না (চার-চোখ নীতি)");
  }

  const targetStatus = action === "approve" ? "approved" : "draft";
  assertVoucherTransition(voucher.status, targetStatus);

  await db
    .update(financeVouchers)
    .set({
      status: targetStatus,
      ...(action === "approve" ? { approvedBy: userId, approvedAt: new Date() } : {}),
    })
    .where(eq(financeVouchers.id, voucherId));

  await db.insert(financeVoucherAudit).values({
    voucherId,
    actorUserId: userId,
    action: "approve",
    snapshot: JSON.stringify({ from: voucher.status, to: targetStatus, action }),
  });

  return { voucherId, status: targetStatus };
}

/** Internal: post ledger entries + journal entry for a voucher within a transaction. */
async function postVoucherInternals(
  tx: DbTx,
  userId: number,
  projectId: number,
  voucherId: number,
  debits: Array<{ accountId: number; amount: number; narration?: string }>,
  credits: Array<{ accountId: number; amount: number; narration?: string }>,
) {
  // 1. Post ledger entries (update account balances)
  for (const debit of debits) {
    const [account] = await tx.select()
      .from(financeAccounts)
      .where(and(eq(financeAccounts.id, debit.accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId)))
      .for("update")
      .limit(1);

    if (!account) throw new Error(`অ্যাকাউন্ট পাওয়া যায়নি: ${debit.accountId}`);

    const newBalance = Number(account.currentBalance) + debit.amount;
    await tx.update(financeAccounts)
      .set({ currentBalance: decimal(newBalance) })
      .where(eq(financeAccounts.id, debit.accountId));

    await tx.insert(financeLedgerEntries).values({
      voucherId,
      accountId: debit.accountId,
      entryType: "debit",
      amount: decimal(debit.amount),
      runningBalance: decimal(newBalance),
    });
  }

  for (const credit of credits) {
    const [account] = await tx.select()
      .from(financeAccounts)
      .where(and(eq(financeAccounts.id, credit.accountId), eq(financeAccounts.userId, userId), eq(financeAccounts.projectId, projectId)))
      .for("update")
      .limit(1);

    if (!account) throw new Error(`অ্যাকাউন্ট পাওয়া যায়নি: ${credit.accountId}`);

    const newBalance = Number(account.currentBalance) - credit.amount;
    await tx.update(financeAccounts)
      .set({ currentBalance: decimal(newBalance) })
      .where(eq(financeAccounts.id, credit.accountId));

    await tx.insert(financeLedgerEntries).values({
      voucherId,
      accountId: credit.accountId,
      entryType: "credit",
      amount: decimal(credit.amount),
      runningBalance: decimal(newBalance),
    });
  }

  // 2. Create journal entry
  const totalDebit = debits.reduce((sum, d) => sum + d.amount, 0);
  const totalCredit = credits.reduce((sum, c) => sum + c.amount, 0);
  const journalNo = `JE-${String(voucherId).padStart(8, "0")}`;

  const journalResult = await tx.insert(financeJournalEntries).values({
    voucherId,
    projectId,
    journalNo,
    date: new Date(),
    narration: `Journal entry for voucher`,
    totalDebit: decimal(totalDebit),
    totalCredit: decimal(totalCredit),
    status: "posted",
    postedBy: userId,
    postedAt: new Date(),
  });

  const journalEntryId = Number(journalResult[0].insertId);

  // 3. Create journal lines
  const allLines = [
    ...debits.map((d, i) => ({
      journalEntryId,
      accountId: d.accountId,
      entryType: "debit" as const,
      amount: decimal(d.amount),
      narration: d.narration?.trim() || null,
      sortOrder: i,
    })),
    ...credits.map((c, i) => ({
      journalEntryId,
      accountId: c.accountId,
      entryType: "credit" as const,
      amount: decimal(c.amount),
      narration: c.narration?.trim() || null,
      sortOrder: debits.length + i,
    })),
  ];

  if (allLines.length >= 2) {
    await tx.insert(financeJournalLines).values(allLines);
  }

  return { journalEntryId, journalNo };
}

/** Post an approved voucher: creates journal + ledger entries, marks as POSTED. */
export async function postVoucher(
  userId: number,
  projectId: number,
  voucherId: number,
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [voucher] = await db
    .select()
    .from(financeVouchers)
    .where(
      and(
        eq(financeVouchers.id, voucherId),
        eq(financeVouchers.projectId, projectId),
      )
    )
    .limit(1);
  if (!voucher) throw new Error("ভাউচার পাওয়া যায়নি");
  assertVoucherTransition(voucher.status, "posted");

  // Self-posting prevention: the voucher creator cannot post their own voucher.
  if (voucher.userId === userId) {
    throw new Error("নিজের তৈরি ভাউচার নিজে পোস্ট করা যাবে না");
  }

  const debits = await db
    .select()
    .from(financeVoucherDebits)
    .where(eq(financeVoucherDebits.voucherId, voucherId));
  const credits = await db
    .select()
    .from(financeVoucherCredits)
    .where(eq(financeVoucherCredits.voucherId, voucherId));

  if (debits.length === 0 || credits.length === 0) {
    throw new Error("ডেবিট ও ক্রেডিট এন্ট্রি প্রয়োজন");
  }

  return await db.transaction(async (tx) => {
    const { assertPeriodNotLocked } = await import("./accounting-core");
    await assertPeriodNotLocked(projectId, new Date(voucher.date));

    const debitInput = debits.map(d => ({
      accountId: d.accountId,
      amount: Number(d.amount),
      narration: d.narration ?? undefined,
    }));
    const creditInput = credits.map(c => ({
      accountId: c.accountId,
      amount: Number(c.amount),
      narration: c.narration ?? undefined,
    }));

    await postVoucherInternals(tx, userId, projectId, voucherId, debitInput, creditInput);

    await tx
      .update(financeVouchers)
      .set({
        status: "posted",
        postedBy: userId,
        postedAt: new Date(),
      })
      .where(eq(financeVouchers.id, voucherId));

    await tx.insert(financeVoucherAudit).values({
      voucherId,
      actorUserId: userId,
      action: "post",
      snapshot: JSON.stringify({ from: voucher.status, to: "posted" }),
    });

    return { voucherId, status: "posted" };
  });
}

/** ==================== Chart of Accounts ==================== */

export async function seedDefaultAccountTypes() {
  const db = databaseRequired(await getDb());
  const existing = await db.select().from(financeAccountTypes).limit(1);
  if (existing.length > 0) return;

  await db.insert(financeAccountTypes).values([
    { code: "ASSET", name: "Asset", nameBn: "সম্পদ", normalBalance: "debit", sortOrder: 1, isSystem: true },
    { code: "LIABILITY", name: "Liability", nameBn: "দায়", normalBalance: "credit", sortOrder: 2, isSystem: true },
    { code: "EQUITY", name: "Equity", nameBn: "ইকুইটি", normalBalance: "credit", sortOrder: 3, isSystem: true },
    { code: "REVENUE", name: "Revenue", nameBn: "আয়", normalBalance: "credit", sortOrder: 4, isSystem: true },
    { code: "EXPENSE", name: "Expense", nameBn: "ব্যয়", normalBalance: "debit", sortOrder: 5, isSystem: true },
  ]);
}

export async function getAccountTypes() {
  const db = databaseRequired(await getDb());
  return db.select().from(financeAccountTypes).orderBy(asc(financeAccountTypes.sortOrder));
}

export async function getChartOfAccounts(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    )
    .orderBy(asc(financeChartOfAccounts.code));
}

export async function getChartOfAccountById(userId: number, projectId: number, accountId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [account] = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.id, accountId),
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    )
    .limit(1);
  return account;
}

export async function createChartOfAccount(
  userId: number,
  input: {
    projectId: number;
    accountTypeId: number;
    parentId?: number;
    code: string;
    name: string;
    nameBn?: string;
    description?: string;
    isDetail?: boolean;
    openingBalance?: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(financeChartOfAccounts)
      .where(
        and(
          eq(financeChartOfAccounts.id, input.parentId),
          eq(financeChartOfAccounts.userId, userId),
          eq(financeChartOfAccounts.projectId, input.projectId)
        )
      )
      .limit(1);
    if (!parent) throw new Error("পেরেন্ট অ্যাকাউন্ট পাওয়া যায়নি");
    if (!parent.isDetail) throw new Error("শুধু ডিটেইল অ্যাকাউন্টের অধীনে সাব-অ্যাকাউন্ট তৈরি করা যায়");
  }

  const [existing] = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.projectId, input.projectId),
        eq(financeChartOfAccounts.code, input.code.trim())
      )
    )
    .limit(1);
  if (existing) throw new Error("এই অ্যাকাউন্ট কোড ইতিমধ্যে ব্যবহৃত");

  const result = await db.insert(financeChartOfAccounts).values({
    userId,
    projectId: input.projectId,
    accountTypeId: input.accountTypeId,
    parentId: input.parentId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    nameBn: input.nameBn?.trim() || null,
    description: input.description?.trim() || null,
    isDetail: input.isDetail ?? true,
    openingBalance: decimal(input.openingBalance ?? 0),
    currentBalance: decimal(input.openingBalance ?? 0),
  });

  const accountId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "chart_of_account",
    entityId: accountId,
    summary: `CoA account created: ${input.code} - ${input.name}`,
  });

  return getChartOfAccountById(userId, input.projectId, accountId);
}

export async function updateChartOfAccount(
  userId: number,
  projectId: number,
  accountId: number,
  input: {
    accountTypeId?: number;
    parentId?: number | null;
    code?: string;
    name?: string;
    nameBn?: string;
    description?: string;
    isActive?: boolean;
    isDetail?: boolean;
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.id, accountId),
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    )
    .limit(1);
  if (!existing) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === accountId) throw new Error("অ্যাকাউন্ট নিজেই তার পেরেন্ট হতে পারে না");
    const [parent] = await db
      .select()
      .from(financeChartOfAccounts)
      .where(
        and(
          eq(financeChartOfAccounts.id, input.parentId),
          eq(financeChartOfAccounts.userId, userId),
          eq(financeChartOfAccounts.projectId, projectId)
        )
      )
      .limit(1);
    if (!parent) throw new Error("পেরেন্ট অ্যাকাউন্ট পাওয়া যায়নি");
    if (!parent.isDetail) throw new Error("শুধু ডিটেইল অ্যাকাউন্টের অধীনে সাব-অ্যাকাউন্ট তৈরি করা যায়");
  }

  if (input.code) {
    const [codeConflict] = await db
      .select()
      .from(financeChartOfAccounts)
      .where(
        and(
          eq(financeChartOfAccounts.projectId, projectId),
          eq(financeChartOfAccounts.code, input.code.trim()),
          eq(financeChartOfAccounts.id, accountId)
        )
      )
      .limit(1);
    if (codeConflict) throw new Error("এই অ্যাকাউন্ট কোড ইতিমধ্যে ব্যবহৃত");
  }

  await db
    .update(financeChartOfAccounts)
    .set({
      ...(input.accountTypeId ? { accountTypeId: input.accountTypeId } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.code ? { code: input.code.trim() } : {}),
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.nameBn !== undefined ? { nameBn: input.nameBn?.trim() || null } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isDetail !== undefined ? { isDetail: input.isDetail } : {}),
    })
    .where(eq(financeChartOfAccounts.id, accountId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "chart_of_account",
    entityId: accountId,
    summary: `CoA account updated: ${existing.code} - ${existing.name}`,
  });

  return getChartOfAccountById(userId, projectId, accountId);
}

export async function deleteChartOfAccount(userId: number, projectId: number, accountId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.id, accountId),
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    )
    .limit(1);
  if (!existing) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

  const [children] = await db
    .select({ count: sql<number>`count(*)` })
    .from(financeChartOfAccounts)
    .where(eq(financeChartOfAccounts.parentId, accountId));
  if (Number(children?.count ?? 0) > 0) throw new Error("চাইল্ড অ্যাকাউন্ট থাকা অবস্থায় মুছা যাবে না");

  const [voucherRefs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(financeVoucherDebits)
    .where(eq(financeVoucherDebits.accountId, accountId));
  const [voucherRefs2] = await db
    .select({ count: sql<number>`count(*)` })
    .from(financeVoucherCredits)
    .where(eq(financeVoucherCredits.accountId, accountId));
  if (Number(voucherRefs?.count ?? 0) > 0 || Number(voucherRefs2?.count ?? 0) > 0) {
    throw new Error("এই অ্যাকাউন্ট ভাউচার এন্ট্রিতে ব্যবহৃত হয়েছে; মুছে ফেলা যাবে না");
  }

  await db.delete(financeChartOfAccounts).where(eq(financeChartOfAccounts.id, accountId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "chart_of_account",
    entityId: accountId,
    summary: `CoA account deleted: ${existing.code} - ${existing.name}`,
  });
}

export async function seedDefaultChartOfAccounts(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  await seedDefaultAccountTypes();
  const db = databaseRequired(await getDb());

  const existing = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    )
    .limit(1);
  if (existing.length > 0) return;

  const [assetType] = await db.select().from(financeAccountTypes).where(eq(financeAccountTypes.code, "ASSET")).limit(1);
  const [liabilityType] = await db.select().from(financeAccountTypes).where(eq(financeAccountTypes.code, "LIABILITY")).limit(1);
  const [equityType] = await db.select().from(financeAccountTypes).where(eq(financeAccountTypes.code, "EQUITY")).limit(1);
  const [revenueType] = await db.select().from(financeAccountTypes).where(eq(financeAccountTypes.code, "REVENUE")).limit(1);
  const [expenseType] = await db.select().from(financeAccountTypes).where(eq(financeAccountTypes.code, "EXPENSE")).limit(1);

  const accounts = [
    { code: "1000", name: "Current Assets", nameBn: "চলতি সম্পদ", accountTypeId: assetType.id, isDetail: false, sortOrder: 1 },
    { code: "1100", name: "Cash & Bank", nameBn: "নগদ ও ব্যাংক", accountTypeId: assetType.id, parentCode: "1000", isDetail: false, sortOrder: 2 },
    { code: "1110", name: "Cash in Hand", nameBn: "হাতে নগদ", accountTypeId: assetType.id, parentCode: "1100", isDetail: true, sortOrder: 3 },
    { code: "1120", name: "Bank Accounts", nameBn: "ব্যাংক অ্যাকাউন্ট", accountTypeId: assetType.id, parentCode: "1100", isDetail: true, sortOrder: 4 },
    { code: "1200", name: "Accounts Receivable", nameBn: "প্রাপ্য রাশি", accountTypeId: assetType.id, parentCode: "1000", isDetail: true, sortOrder: 5 },
    { code: "2000", name: "Current Liabilities", nameBn: "চলতি দায়", accountTypeId: liabilityType.id, isDetail: false, sortOrder: 10 },
    { code: "2100", name: "Accounts Payable", nameBn: "দেয় রাশি", accountTypeId: liabilityType.id, parentCode: "2000", isDetail: true, sortOrder: 11 },
    { code: "3000", name: "Equity", nameBn: "ইকুইটি", accountTypeId: equityType.id, isDetail: false, sortOrder: 20 },
    { code: "3100", name: "Owner's Capital", nameBn: "মালিকের ক্যাপিটাল", accountTypeId: equityType.id, parentCode: "3000", isDetail: true, sortOrder: 21 },
    { code: "3200", name: "Retained Earnings", nameBn: "রিটেইন্ড আর্ণিংস", accountTypeId: equityType.id, parentCode: "3000", isDetail: true, sortOrder: 22 },
    { code: "4000", name: "Revenue", nameBn: "আয়", accountTypeId: revenueType.id, isDetail: false, sortOrder: 30 },
    { code: "4100", name: "Sales Revenue", nameBn: "বিক্রয় আয়", accountTypeId: revenueType.id, parentCode: "4000", isDetail: true, sortOrder: 31 },
    { code: "5000", name: "Expenses", nameBn: "ব্যয়", accountTypeId: expenseType.id, isDetail: false, sortOrder: 40 },
    { code: "5100", name: "Operating Expenses", nameBn: "অপারেটিং ব্যয়", accountTypeId: expenseType.id, parentCode: "5000", isDetail: false, sortOrder: 41 },
    { code: "5110", name: "Salaries", nameBn: "বেতন", accountTypeId: expenseType.id, parentCode: "5100", isDetail: true, sortOrder: 42 },
    { code: "5120", name: "Rent", nameBn: "ভাড়া", accountTypeId: expenseType.id, parentCode: "5100", isDetail: true, sortOrder: 43 },
    { code: "5130", name: "Utilities", nameBn: "উটিলিটি", accountTypeId: expenseType.id, parentCode: "5100", isDetail: true, sortOrder: 44 },
  ];

  const idMap = new Map<string, number>();

  for (const acc of accounts) {
    let parentId: number | undefined;
    if (acc.parentCode) {
      parentId = idMap.get(acc.parentCode);
    }
    const result = await db.insert(financeChartOfAccounts).values({
      userId,
      projectId,
      accountTypeId: acc.accountTypeId,
      parentId,
      code: acc.code,
      name: acc.name,
      nameBn: acc.nameBn,
      isDetail: acc.isDetail,
      sortOrder: acc.sortOrder,
    });
    const id = Number(result[0].insertId);
    idMap.set(acc.code, id);
  }

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "create",
    entityType: "chart_of_account_seed",
    summary: "Default Chart of Accounts seeded",
  });
}

// ─── Account Groups ─────────────────────────────────────────────────────────

export async function listAccountGroups(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financeAccountGroups)
    .where(
      and(
        eq(financeAccountGroups.userId, userId),
        eq(financeAccountGroups.projectId, projectId),
      )
    )
    .orderBy(financeAccountGroups.sortOrder);
}

export async function createAccountGroup(
  userId: number,
  input: {
    projectId: number;
    accountTypeId: number;
    parentId?: number;
    code: string;
    name: string;
    nameBn?: string;
    description?: string;
    sortOrder?: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeAccountGroups)
    .where(
      and(
        eq(financeAccountGroups.projectId, input.projectId),
        eq(financeAccountGroups.code, input.code.trim()),
      )
    )
    .limit(1);
  if (existing) throw new Error("এই গ্রুপ কোড ইতিমধ্যে ব্যবহৃত");

  const result = await db.insert(financeAccountGroups).values({
    userId,
    projectId: input.projectId,
    accountTypeId: input.accountTypeId,
    parentId: input.parentId ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    nameBn: input.nameBn?.trim() || null,
    description: input.description?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
  });

  const groupId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "account_group",
    entityId: groupId,
    summary: `Account group created: ${input.code} - ${input.name}`,
  });

  return { id: groupId };
}

export async function updateAccountGroup(
  userId: number,
  projectId: number,
  groupId: number,
  input: {
    name?: string;
    nameBn?: string | null;
    description?: string | null;
    sortOrder?: number;
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeAccountGroups)
    .where(
      and(
        eq(financeAccountGroups.id, groupId),
        eq(financeAccountGroups.userId, userId),
        eq(financeAccountGroups.projectId, projectId),
      )
    )
    .limit(1);
  if (!existing) throw new Error("গ্রুপ পাওয়া যায়নি");

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.nameBn !== undefined) updateData.nameBn = input.nameBn?.trim() || null;
  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;

  await db
    .update(financeAccountGroups)
    .set(updateData)
    .where(eq(financeAccountGroups.id, groupId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "account_group",
    entityId: groupId,
    summary: `Account group updated: ${existing.code} - ${existing.name}`,
  });

  return { id: groupId };
}

export async function deleteAccountGroup(userId: number, projectId: number, groupId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeAccountGroups)
    .where(
      and(
        eq(financeAccountGroups.id, groupId),
        eq(financeAccountGroups.userId, userId),
        eq(financeAccountGroups.projectId, projectId),
      )
    )
    .limit(1);
  if (!existing) throw new Error("গ্রুপ পাওয়া যায়নি");

  const [children] = await db
    .select({ count: sql<number>`count(*)` })
    .from(financeAccountGroups)
    .where(eq(financeAccountGroups.parentId, groupId));
  if (Number(children?.count ?? 0) > 0) throw new Error("চাইল্ড গ্রুপ থাকা অবস্থায় মুছা যাবে না");

  await db.delete(financeAccountGroups).where(eq(financeAccountGroups.id, groupId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "account_group",
    entityId: groupId,
    summary: `Account group deleted: ${existing.code} - ${existing.name}`,
  });
}

// ─── Fiscal Periods (DB helpers, logic in accounting-core.ts) ────────────────

export async function getFiscalPeriodById(userId: number, projectId: number, periodId: number) {
  const db = databaseRequired(await getDb());
  const [period] = await db
    .select()
    .from(financeFiscalPeriods)
    .where(
      and(
        eq(financeFiscalPeriods.id, periodId),
        eq(financeFiscalPeriods.userId, userId),
        eq(financeFiscalPeriods.projectId, projectId),
      )
    )
    .limit(1);
  return period ?? null;
}

export async function getChartOfAccountsTree(userId: number, projectId: number) {
  const accounts = await getChartOfAccounts(userId, projectId);
  const accountMap = new Map<number, typeof accounts[0] & { children: typeof accounts }>();
  accounts.forEach(a => accountMap.set(a.id, { ...a, children: [] }));

  const roots: (typeof accounts[0] & { children: typeof accounts })[] = [];
  accounts.forEach(acc => {
    const withChildren = accountMap.get(acc.id)!;
    if (acc.parentId && accountMap.has(acc.parentId)) {
      accountMap.get(acc.parentId)!.children.push(withChildren);
    } else {
      roots.push(withChildren);
    }
  });
  return roots;
}

export async function adjustChartOfAccountBalance(
  userId: number,
  projectId: number,
  accountId: number,
  delta: number,
  tx?: DbOrTx
) {
  if (delta === 0) return;
  const executor = tx || databaseRequired(await getDb());
  await executor
    .update(financeChartOfAccounts)
    .set({
      currentBalance: sql`${financeChartOfAccounts.currentBalance} + ${decimal(delta)}`,
    })
    .where(
      and(
        eq(financeChartOfAccounts.id, accountId),
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, projectId)
      )
    );
}

/** ==================== Period Lock ==================== */

export async function lockPeriod(userId: number, projectId: number, monthKey: string, reason?: string) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        eq(financePeriodLocks.monthKey, monthKey)
      )
    )
    .limit(1);
  if (existing) throw new Error("এই периода ইতিমধ্যে লক করা হয়েছে");

  await db.insert(financePeriodLocks).values({
    userId,
    projectId,
    monthKey,
    lockedBy: userId,
    reason: reason?.trim() || null,
  });

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "create",
    entityType: "period_lock",
    summary: `Period locked: ${monthKey}`,
  });
}

export async function unlockPeriod(userId: number, projectId: number, monthKey: string) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        eq(financePeriodLocks.monthKey, monthKey)
      )
    )
    .limit(1);
  if (!existing) throw new Error("এই পিরিয়ড লক করা নেই");

  await db
    .delete(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        eq(financePeriodLocks.monthKey, monthKey)
      )
    );

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "period_lock",
    summary: `Period unlocked: ${monthKey}`,
  });
}

export async function isPeriodLocked(userId: number, projectId: number, monthKey: string): Promise<boolean> {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [lock] = await db
    .select()
    .from(financePeriodLocks)
    .where(
      and(
        eq(financePeriodLocks.projectId, projectId),
        eq(financePeriodLocks.monthKey, monthKey)
      )
    )
    .limit(1);
  return !!lock;
}

export async function assertPeriodNotLocked(userId: number, projectId: number, date: Date) {
  const monthKey = date.toISOString().slice(0, 7);
  const locked = await isPeriodLocked(userId, projectId, monthKey);
  if (locked) throw new Error(`পিরিয়ড ${monthKey} লক করা আছে; লেনদেন যোগ/সংশোধন করা যাবে না`);
}

export async function getPeriodLocks(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financePeriodLocks)
    .where(eq(financePeriodLocks.projectId, projectId))
    .orderBy(desc(financePeriodLocks.monthKey));
}

/** ==================== Voucher Reversal ==================== */

export async function reverseVoucher(
  userId: number,
  projectId: number,
  input: {
    originalVoucherId: number;
    reason: string;
    date: Date;
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  // Phase 1: Validate outside transaction (fast fail)
  const [originalVoucher] = await db
    .select()
    .from(financeVouchers)
    .where(
      and(
        eq(financeVouchers.id, input.originalVoucherId),
        eq(financeVouchers.projectId, projectId)
      )
    )
    .limit(1);
  if (!originalVoucher) throw new Error("মূল ভাউচার পাওয়া যায়নি");
  assertVoucherTransition(originalVoucher.status, "reversed");

  // Self-reversal prevention: the voucher creator cannot reverse their own voucher.
  if (originalVoucher.userId === userId) {
    throw new Error("নিজের তৈরি ভাউচার নিজে রিভার্স করা যাবে না");
  }

  const existingReversal = await db
    .select()
    .from(financeVoucherReversals)
    .where(eq(financeVoucherReversals.originalVoucherId, input.originalVoucherId))
    .limit(1);
  if (existingReversal.length > 0) throw new Error("এই ভাউচারের জন্য ইতিমধ্যে রিভার্সাল তৈরি করা হয়েছে");

  const originalDebits = await db
    .select()
    .from(financeVoucherDebits)
    .where(eq(financeVoucherDebits.voucherId, input.originalVoucherId));
  const originalCredits = await db
    .select()
    .from(financeVoucherCredits)
    .where(eq(financeVoucherCredits.voucherId, input.originalVoucherId));

  const reversedDebits = originalDebits.map(d => ({
    accountId: d.accountId,
    amount: Number(d.amount),
    narration: d.narration ? `Reversal: ${d.narration}` : "Reversal entry",
  }));
  const reversedCredits = originalCredits.map(c => ({
    accountId: c.accountId,
    amount: Number(c.amount),
    narration: c.narration ? `Reversal: ${c.narration}` : "Reversal entry",
  }));

  // Phase 2: All writes in a single atomic transaction
  const { assertPeriodNotLocked } = await import("./accounting-core");
  await assertPeriodNotLocked(projectId, input.date);

  const reversalResult = await db.transaction(async (tx) => {
    // 2a. Create reversal voucher with its own debits/credits/ledger/journal/audit
    const reversalVoucherResult = await createVoucherWithEntries(userId, {
      projectId,
      date: input.date,
      narration: `Reversal of ${originalVoucher.voucherNo}: ${input.reason}`,
      debits: reversedCredits,
      credits: reversedDebits,
      status: "posted",
      _internalPostedBy: userId,
    });

    // 2b. Record the reversal link
    await tx.insert(financeVoucherReversals).values({
      userId,
      projectId,
      originalVoucherId: input.originalVoucherId,
      reversalVoucherId: reversalVoucherResult.voucherId,
      reason: input.reason,
      reversedBy: userId,
    });

    // 2c. Mark original voucher as reversed
    await tx
      .update(financeVouchers)
      .set({
        status: "reversed",
        reversedBy: userId,
        reversedAt: new Date(),
        reversalReference: reversalVoucherResult.voucherNo,
      })
      .where(eq(financeVouchers.id, input.originalVoucherId));

    // 2d. Audit entry for the original voucher
    await tx.insert(financeVoucherAudit).values({
      voucherId: input.originalVoucherId,
      actorUserId: userId,
      action: "reverse",
      snapshot: JSON.stringify({
        originalVoucherNo: originalVoucher.voucherNo,
        reversalVoucherNo: reversalVoucherResult.voucherNo,
        reason: input.reason,
      }),
    });

    return reversalVoucherResult;
  });

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "voucher",
    entityId: input.originalVoucherId,
    summary: `Voucher reversed: ${originalVoucher.voucherNo} -> ${reversalResult.voucherNo}`,
  });

  return { originalVoucherId: input.originalVoucherId, reversalVoucherId: reversalResult.voucherId, reversalVoucherNo: reversalResult.voucherNo };
}

export async function getVoucherReversals(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: financeVoucherReversals.id,
      originalVoucherId: financeVoucherReversals.originalVoucherId,
      reversalVoucherId: financeVoucherReversals.reversalVoucherId,
      reason: financeVoucherReversals.reason,
      reversedAt: financeVoucherReversals.reversedAt,
      reversedBy: financeVoucherReversals.reversedBy,
      originalVoucherNo: financeVouchers.voucherNo,
      reversalVoucherNo: sql<string>`(SELECT voucherNo FROM finance_vouchers WHERE id = ${financeVoucherReversals.reversalVoucherId})`,
    })
    .from(financeVoucherReversals)
    .innerJoin(financeVouchers, eq(financeVouchers.id, financeVoucherReversals.originalVoucherId))
    .where(eq(financeVoucherReversals.projectId, projectId))
    .orderBy(desc(financeVoucherReversals.reversedAt));
}

/** ==================== Bank Reconciliation ==================== */

export async function createBankReconciliation(
  userId: number,
  input: {
    projectId: number;
    accountId: number;
    statementDate: Date;
    statementBalance: number;
    notes?: string;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const [account] = await db
    .select()
    .from(financeChartOfAccounts)
    .where(
      and(
        eq(financeChartOfAccounts.id, input.accountId),
        eq(financeChartOfAccounts.userId, userId),
        eq(financeChartOfAccounts.projectId, input.projectId)
      )
    )
    .limit(1);
  if (!account) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

  const bookBalance = Number(account.currentBalance);
  const difference = input.statementBalance - bookBalance;

  const result = await db.insert(financeBankReconciliations).values({
    userId,
    projectId: input.projectId,
    accountId: input.accountId,
    statementDate: input.statementDate,
    statementBalance: decimal(input.statementBalance),
    bookBalance: decimal(bookBalance),
    difference: decimal(difference),
    status: "in_progress",
    notes: input.notes?.trim() || null,
  });

  const reconciliationId = Number(result[0].insertId);

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "bank_reconciliation",
    entityId: reconciliationId,
    summary: `Bank reconciliation started for account ${account.code} - ${account.name}`,
  });

  return getBankReconciliationById(userId, input.projectId, reconciliationId);
}

export async function getBankReconciliationById(userId: number, projectId: number, reconciliationId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [rec] = await db
    .select({
      id: financeBankReconciliations.id,
      userId: financeBankReconciliations.userId,
      projectId: financeBankReconciliations.projectId,
      accountId: financeBankReconciliations.accountId,
      statementDate: financeBankReconciliations.statementDate,
      statementBalance: financeBankReconciliations.statementBalance,
      bookBalance: financeBankReconciliations.bookBalance,
      difference: financeBankReconciliations.difference,
      status: financeBankReconciliations.status,
      reconciledAt: financeBankReconciliations.reconciledAt,
      reconciledBy: financeBankReconciliations.reconciledBy,
      notes: financeBankReconciliations.notes,
      createdAt: financeBankReconciliations.createdAt,
      updatedAt: financeBankReconciliations.updatedAt,
      accountName: financeChartOfAccounts.name,
      accountCode: financeChartOfAccounts.code,
    })
    .from(financeBankReconciliations)
    .innerJoin(financeChartOfAccounts, eq(financeChartOfAccounts.id, financeBankReconciliations.accountId))
    .where(
      and(
        eq(financeBankReconciliations.id, reconciliationId),
        eq(financeBankReconciliations.userId, userId),
        eq(financeBankReconciliations.projectId, projectId)
      )
    )
    .limit(1);
  return rec;
}

export async function getBankReconciliations(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: financeBankReconciliations.id,
      userId: financeBankReconciliations.userId,
      projectId: financeBankReconciliations.projectId,
      accountId: financeBankReconciliations.accountId,
      statementDate: financeBankReconciliations.statementDate,
      statementBalance: financeBankReconciliations.statementBalance,
      bookBalance: financeBankReconciliations.bookBalance,
      difference: financeBankReconciliations.difference,
      status: financeBankReconciliations.status,
      reconciledAt: financeBankReconciliations.reconciledAt,
      reconciledBy: financeBankReconciliations.reconciledBy,
      notes: financeBankReconciliations.notes,
      createdAt: financeBankReconciliations.createdAt,
      updatedAt: financeBankReconciliations.updatedAt,
      accountName: financeChartOfAccounts.name,
      accountCode: financeChartOfAccounts.code,
    })
    .from(financeBankReconciliations)
    .innerJoin(financeChartOfAccounts, eq(financeChartOfAccounts.id, financeBankReconciliations.accountId))
    .where(
      and(
        eq(financeBankReconciliations.userId, userId),
        eq(financeBankReconciliations.projectId, projectId)
      )
    )
    .orderBy(desc(financeBankReconciliations.statementDate));
}

export async function addBankReconciliationItem(
  userId: number,
  projectId: number,
  input: {
    reconciliationId: number;
    ledgerEntryId?: number;
    statementRef: string;
    statementDate: Date;
    statementAmount: number;
    statementType: "debit" | "credit";
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [rec] = await db
    .select()
    .from(financeBankReconciliations)
    .where(
      and(
        eq(financeBankReconciliations.id, input.reconciliationId),
        eq(financeBankReconciliations.userId, userId),
        eq(financeBankReconciliations.projectId, projectId)
      )
    )
    .limit(1);
  if (!rec) throw new Error("রিকอนসিলিয়েশন পাওয়া যায়নি");

  const result = await db.insert(financeBankReconciliationItems).values({
    reconciliationId: input.reconciliationId,
    ledgerEntryId: input.ledgerEntryId ?? null,
    statementRef: input.statementRef.trim(),
    statementDate: input.statementDate,
    statementAmount: decimal(input.statementAmount),
    statementType: input.statementType,
    matched: !!input.ledgerEntryId,
    matchedAt: input.ledgerEntryId ? new Date() : null,
  });

  return Number(result[0].insertId);
}

export async function matchBankReconciliationItem(
  userId: number,
  projectId: number,
  itemId: number,
  ledgerEntryId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [item] = await db
    .select()
    .from(financeBankReconciliationItems)
    .where(eq(financeBankReconciliationItems.id, itemId))
    .limit(1);
  if (!item) throw new Error("রিকোনসিলিয়েশন আইটেম পাওয়া যায়নি");

  await db
    .update(financeBankReconciliationItems)
    .set({
      ledgerEntryId,
      matched: true,
      matchedAt: new Date(),
    })
    .where(eq(financeBankReconciliationItems.id, itemId));

  await recalculateReconciliation(db, userId, projectId, item.reconciliationId);
}

export async function unmatchBankReconciliationItem(
  userId: number,
  projectId: number,
  itemId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  await db
    .update(financeBankReconciliationItems)
    .set({
      ledgerEntryId: null,
      matched: false,
      matchedAt: null,
    })
    .where(eq(financeBankReconciliationItems.id, itemId));

  const [item] = await db
    .select()
    .from(financeBankReconciliationItems)
    .where(eq(financeBankReconciliationItems.id, itemId))
    .limit(1);
  if (item) {
    await recalculateReconciliation(db, userId, projectId, item.reconciliationId);
  }
}

async function recalculateReconciliation(db: DbHandle, userId: number, projectId: number, reconciliationId: number) {
  const items = await db
    .select()
    .from(financeBankReconciliationItems)
    .where(eq(financeBankReconciliationItems.reconciliationId, reconciliationId));

  let matchedDebits = 0;
  let matchedCredits = 0;
  for (const item of items) {
    if (item.matched && item.ledgerEntryId) {
      const [ledger] = await db
        .select()
        .from(financeLedgerEntries)
        .where(eq(financeLedgerEntries.id, item.ledgerEntryId))
        .limit(1);
      if (ledger) {
        if (ledger.entryType === "debit") matchedDebits += Number(ledger.amount);
        else matchedCredits += Number(ledger.amount);
      }
    }
  }

  const [rec] = await db
    .select()
    .from(financeBankReconciliations)
    .where(eq(financeBankReconciliations.id, reconciliationId))
    .limit(1);

  const adjustedBookBalance = Number(rec.bookBalance) + matchedDebits - matchedCredits;
  const difference = Number(rec.statementBalance) - adjustedBookBalance;

  await db
    .update(financeBankReconciliations)
    .set({
      difference: decimal(difference),
      status: Math.abs(difference) < 0.01 ? "completed" : "in_progress",
    })
    .where(eq(financeBankReconciliations.id, reconciliationId));
}

export async function completeBankReconciliation(
  userId: number,
  projectId: number,
  reconciliationId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [rec] = await db
    .select()
    .from(financeBankReconciliations)
    .where(
      and(
        eq(financeBankReconciliations.id, reconciliationId),
        eq(financeBankReconciliations.userId, userId),
        eq(financeBankReconciliations.projectId, projectId)
      )
    )
    .limit(1);
  if (!rec) throw new Error("রিকোনসিলিয়েশন পাওয়া যায়নি");
  if (Math.abs(Number(rec.difference)) > 0.01) {
    throw new Error("ডিফারেন্স ০.০১ এর চেয়ে বেশি; রিকোনসিলিয়েশন সম্পন্ন করা যাবে না");
  }

  await db
    .update(financeBankReconciliations)
    .set({
      status: "completed",
      reconciledAt: new Date(),
      reconciledBy: userId,
    })
    .where(eq(financeBankReconciliations.id, reconciliationId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "bank_reconciliation",
    entityId: reconciliationId,
    summary: `Bank reconciliation completed for account ${rec.accountId}`,
  });
}

export async function getBankReconciliationItems(
  userId: number,
  reconciliationId: number
) {
  const db = databaseRequired(await getDb());
  const [rec] = await db
    .select({ id: financeBankReconciliations.id, projectId: financeBankReconciliations.projectId })
    .from(financeBankReconciliations)
    .where(eq(financeBankReconciliations.id, reconciliationId))
    .limit(1);
  if (!rec) throw new Error("রিকনসিলিয়েশন পাওয়া যায়নি");
  await assertOwnedProject(userId, rec.projectId);
  return db
    .select()
    .from(financeBankReconciliationItems)
    .where(eq(financeBankReconciliationItems.reconciliationId, reconciliationId))
    .orderBy(asc(financeBankReconciliationItems.statementDate));
}

export async function getLedgerEntriesForReconciliation(
  userId: number,
  projectId: number,
  accountId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: financeLedgerEntries.id,
      voucherId: financeLedgerEntries.voucherId,
      accountId: financeLedgerEntries.accountId,
      entryType: financeLedgerEntries.entryType,
      amount: financeLedgerEntries.amount,
      runningBalance: financeLedgerEntries.runningBalance,
      postedAt: financeLedgerEntries.postedAt,
    })
    .from(financeLedgerEntries)
    .where(
      and(
        eq(financeLedgerEntries.accountId, accountId),
        eq(financeVouchers.projectId, projectId)
      )
    )
    .innerJoin(financeVouchers, eq(financeLedgerEntries.voucherId, financeVouchers.id))
    .orderBy(desc(financeLedgerEntries.postedAt));
}

export async function getVoucherSettings(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  await ensureVoucherSettings(userId, projectId);
  const db = databaseRequired(await getDb());
  const [settings] = await db
    .select()
    .from(financeVoucherSettings)
    .where(
      and(
        eq(financeVoucherSettings.userId, userId),
        eq(financeVoucherSettings.projectId, projectId)
      )
    )
    .limit(1);
  if (!settings) throw new Error("ভাউচার সেটিংস পাওয়া যায়নি");
  return settings;
}

export async function updateVoucherSettings(
  userId: number,
  input: {
    projectId: number;
    prefix: string;
    startNumber: number;
    endNumber: number;
  }
) {
  if (input.startNumber < 1 || input.endNumber < input.startNumber)
    throw new Error("ভাউচার রেঞ্জ সঠিক নয়");
  const current = await getVoucherSettings(userId, input.projectId);
  const nextNumber = Math.max(current.nextNumber, input.startNumber);
  if (nextNumber > input.endNumber + 1)
    throw new Error(
      "বর্তমান ভাউচার নম্বরের চেয়ে কম রেঞ্জ নির্ধারণ করা যাবে না"
    );
  const db = databaseRequired(await getDb());
  await db
    .update(financeVoucherSettings)
    .set({
      prefix: input.prefix.trim() || "V",
      startNumber: input.startNumber,
      endNumber: input.endNumber,
      nextNumber,
    })
    .where(eq(financeVoucherSettings.id, current.id));
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "update",
    entityType: "voucher_settings",
    entityId: current.id,
    summary: "Voucher range updated",
  });
  return getVoucherSettings(userId, input.projectId);
}

export async function listProjects(userId: number) {
  await ensureDefaultProject(userId);
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financeProjects)
    .where(eq(financeProjects.userId, userId))
    .orderBy(asc(financeProjects.createdAt));
}

export async function assertOwnedProject(userId: number, projectId: number) {
  const db = databaseRequired(await getDb());
  const [project] = await db
    .select()
    .from(financeProjects)
    .where(
      and(eq(financeProjects.id, projectId), eq(financeProjects.userId, userId))
    )
    .limit(1);
  if (!project) throw new Error("Project not found or access denied");
  return project;
}

type RegisterPrivateStorageObjectInput = {
  projectId?: number;
  householdId?: number;
  storageKey: string;
  kind: "backup" | "export";
  scope: PrivateObjectScope;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

/**
 * Persists the authorization metadata required before a finance Blob object
 * can be exposed. Callers must upload the object first and delete it if this
 * registration fails, so an unregistered key is never downloadable.
 */
export async function registerPrivateStorageObject(
  userId: number,
  input: RegisterPrivateStorageObjectInput
) {
  const storageKey = input.storageKey.replace(/^\/+/, "");
  if (!storageKey || storageKey.includes("\0"))
    throw new Error("স্টোরেজ কী সঠিক নয়");
  if (
    !input.contentType ||
    !input.fileName.trim() ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 0
  ) {
    throw new Error("ব্যাকআপ ফাইলের মেটাডেটা সঠিক নয়");
  }

  if (input.scope === "owner") {
    if (!input.projectId || input.householdId)
      throw new Error("প্রাইভেট প্রজেক্ট ফাইলের স্কোপ সঠিক নয়");
    await assertOwnedProject(userId, input.projectId);
  } else {
    if (!input.householdId || input.projectId)
      throw new Error("পারিবারিক ফাইলের স্কোপ সঠিক নয়");
    const access = await getHouseholdAccess(userId, input.householdId);
    requireHouseholdRole(access.role, ["owner", "editor"]);
  }

  const db = databaseRequired(await getDb());
  const result = await db.insert(financePrivateStorageObjects).values({
    ownerUserId: userId,
    projectId: input.projectId ?? null,
    householdId: input.householdId ?? null,
    storageKey,
    kind: input.kind,
    scope: input.scope,
    contentType: input.contentType,
    fileName: input.fileName.trim(),
    sizeBytes: input.sizeBytes,
  });
  const id = Number(result[0].insertId);
  const [object] = await db
    .select()
    .from(financePrivateStorageObjects)
    .where(eq(financePrivateStorageObjects.id, id))
    .limit(1);
  if (!object) throw new Error("প্রাইভেট স্টোরেজ ফাইল নিবন্ধন করা যায়নি");
  return object;
}

/** Returns null for unknown, tenant-denied, or inactive-household objects. */
export async function getPrivateStorageObjectForDownload(
  userId: number,
  objectId: number
) {
  const db = databaseRequired(await getDb());
  const [object] = await db
    .select()
    .from(financePrivateStorageObjects)
    .where(eq(financePrivateStorageObjects.id, objectId))
    .limit(1);
  if (!object) return null;

  let ownsReferencedProject = false;
  let hasActiveHouseholdMembership = false;

  if (object.projectId !== null) {
    const [project] = await db
      .select({ id: financeProjects.id })
      .from(financeProjects)
      .where(
        and(
          eq(financeProjects.id, object.projectId),
          eq(financeProjects.userId, userId)
        )
      )
      .limit(1);
    ownsReferencedProject = Boolean(project);
  }

  if (object.householdId !== null) {
    const [household] = await db
      .select({ ownerUserId: financeHouseholds.ownerUserId })
      .from(financeHouseholds)
      .where(eq(financeHouseholds.id, object.householdId))
      .limit(1);
    if (household?.ownerUserId === userId) {
      hasActiveHouseholdMembership = true;
    } else {
      const [membership] = await db
        .select({ id: financeHouseholdMembers.id })
        .from(financeHouseholdMembers)
        .where(
          and(
            eq(financeHouseholdMembers.householdId, object.householdId),
            eq(financeHouseholdMembers.userId, userId),
            eq(financeHouseholdMembers.status, "active")
          )
        )
        .limit(1);
      hasActiveHouseholdMembership = Boolean(membership);
    }
  }

  return canDownloadPrivateObject(object, {
    userId,
    ownsReferencedProject,
    hasActiveHouseholdMembership,
  })
    ? object
    : null;
}

export async function createProject(userId: number, name: string) {
  const db = databaseRequired(await getDb());
  const cleanName = name.trim();
  const result = await db
    .insert(financeProjects)
    .values({ userId, name: cleanName });
  const projectId = Number(result[0].insertId);
  await ensureDefaultCategories(userId, projectId);
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "create",
    entityType: "project",
    entityId: projectId,
    summary: `Project created: ${cleanName}`,
  });
  return assertOwnedProject(userId, projectId);
}

type HouseholdRole = "owner" | "editor" | "viewer";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getHouseholdAccess(
  userId: number,
  householdId: number
): Promise<{
  role: HouseholdRole;
  household: typeof financeHouseholds.$inferSelect;
}> {
  const db = databaseRequired(await getDb());
  const [household] = await db
    .select()
    .from(financeHouseholds)
    .where(eq(financeHouseholds.id, householdId))
    .limit(1);
  if (!household) throw new Error("পারিবারিক প্রোফাইল পাওয়া যায়নি");
  if (household.ownerUserId === userId) return { role: "owner", household };

  const [membership] = await db
    .select()
    .from(financeHouseholdMembers)
    .where(
      and(
        eq(financeHouseholdMembers.householdId, householdId),
        eq(financeHouseholdMembers.userId, userId),
        eq(financeHouseholdMembers.status, "active")
      )
    )
    .limit(1);
  if (!membership) throw new Error("এই পারিবারিক প্রোফাইলে আপনার অনুমতি নেই");
  return { role: membership.role, household };
}

function requireHouseholdRole(role: HouseholdRole, allowed: HouseholdRole[]) {
  if (!allowed.includes(role))
    throw new Error("এই কাজটি করার অনুমতি আপনার নেই");
}

export async function listHouseholds(userId: number) {
  const db = databaseRequired(await getDb());
  const [owned, memberships] = await Promise.all([
    db
      .select()
      .from(financeHouseholds)
      .where(eq(financeHouseholds.ownerUserId, userId))
      .orderBy(asc(financeHouseholds.name)),
    db
      .select({
        household: financeHouseholds,
        role: financeHouseholdMembers.role,
      })
      .from(financeHouseholdMembers)
      .innerJoin(
        financeHouseholds,
        eq(financeHouseholdMembers.householdId, financeHouseholds.id)
      )
      .where(
        and(
          eq(financeHouseholdMembers.userId, userId),
          eq(financeHouseholdMembers.status, "active")
        )
      )
      .orderBy(asc(financeHouseholds.name)),
  ]);
  return [
    ...owned.map(household => ({ ...household, role: "owner" as const })),
    ...memberships.map(({ household, role }) => ({ ...household, role })),
  ];
}

export async function listHouseholdInvitations(userId: number) {
  const db = databaseRequired(await getDb());
  const [currentUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!currentUser?.email) return [];
  const email = normalizeEmail(currentUser.email);
  return db
    .select({
      membershipId: financeHouseholdMembers.id,
      householdId: financeHouseholds.id,
      householdName: financeHouseholds.name,
      role: financeHouseholdMembers.role,
      displayName: financeHouseholdMembers.displayName,
      invitedAt: financeHouseholdMembers.createdAt,
    })
    .from(financeHouseholdMembers)
    .innerJoin(
      financeHouseholds,
      eq(financeHouseholdMembers.householdId, financeHouseholds.id)
    )
    .where(
      and(
        eq(financeHouseholdMembers.inviteeEmail, email),
        eq(financeHouseholdMembers.status, "pending")
      )
    )
    .orderBy(desc(financeHouseholdMembers.createdAt));
}

export async function createHousehold(userId: number, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("পারিবারিক প্রোফাইলের নাম দিন");
  const db = databaseRequired(await getDb());
  const result = await db
    .insert(financeHouseholds)
    .values({ ownerUserId: userId, name: cleanName });
  const householdId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    action: "create",
    entityType: "household",
    entityId: householdId,
    summary: `Household profile created: ${cleanName}`,
  });
  return getHouseholdAccess(userId, householdId);
}

export async function getHouseholdOverview(
  userId: number,
  householdId: number
) {
  const db = databaseRequired(await getDb());
  const access = await getHouseholdAccess(userId, householdId);
  const [owner] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, access.household.ownerUserId))
    .limit(1);
  const memberRows = await db
    .select({
      id: financeHouseholdMembers.id,
      userId: financeHouseholdMembers.userId,
      inviteeEmail: financeHouseholdMembers.inviteeEmail,
      displayName: financeHouseholdMembers.displayName,
      role: financeHouseholdMembers.role,
      status: financeHouseholdMembers.status,
      acceptedAt: financeHouseholdMembers.acceptedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(financeHouseholdMembers)
    .leftJoin(users, eq(financeHouseholdMembers.userId, users.id))
    .where(eq(financeHouseholdMembers.householdId, householdId))
    .orderBy(asc(financeHouseholdMembers.createdAt));
  const visibleMembers =
    access.role === "owner"
      ? memberRows
      : memberRows.filter(
          member => member.status === "active" || member.userId === userId
        );
  const currentMonth = monthKey();
  const budgets = await db
    .select()
    .from(financeSharedBudgets)
    .where(
      and(
        eq(financeSharedBudgets.householdId, householdId),
        eq(financeSharedBudgets.monthKey, currentMonth)
      )
    )
    .orderBy(asc(financeSharedBudgets.label));
  const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
  const nextMonthStart = new Date(
    `${offsetMonthKey(currentMonth, 1)}-01T00:00:00.000Z`
  );
  const activeBudgetIds = new Set(budgets.map(budget => budget.id));
  const expenses = budgets.length
    ? (
        await db
          .select({
            id: financeSharedExpenses.id,
            householdId: financeSharedExpenses.householdId,
            budgetId: financeSharedExpenses.budgetId,
            contributorUserId: financeSharedExpenses.contributorUserId,
            amount: financeSharedExpenses.amount,
            note: financeSharedExpenses.note,
            occurredAt: financeSharedExpenses.occurredAt,
            createdAt: financeSharedExpenses.createdAt,
            contributorName: users.name,
            contributorEmail: users.email,
          })
          .from(financeSharedExpenses)
          .innerJoin(
            users,
            eq(financeSharedExpenses.contributorUserId, users.id)
          )
          .where(
            and(
              eq(financeSharedExpenses.householdId, householdId),
              gte(financeSharedExpenses.occurredAt, monthStart),
              lt(financeSharedExpenses.occurredAt, nextMonthStart)
            )
          )
          .orderBy(desc(financeSharedExpenses.occurredAt))
      ).filter(expense => activeBudgetIds.has(expense.budgetId))
    : [];
  const spentByBudget = new Map<number, number>();
  for (const expense of expenses)
    spentByBudget.set(
      expense.budgetId,
      (spentByBudget.get(expense.budgetId) ?? 0) + Number(expense.amount)
    );
  const sharedBudgets = budgets.map(budget => {
    const spent = spentByBudget.get(budget.id) ?? 0;
    const amount = Number(budget.amount);
    return { ...budget, ...calculateSharedBudgetProgress(amount, spent) };
  });
  const visibleContributorIds = new Set([
    access.household.ownerUserId,
    ...visibleMembers
      .filter(member => member.status === "active" || member.userId === userId)
      .flatMap(member => (member.userId === null ? [] : [member.userId])),
  ]);
  const contributorSpend = summarizeHouseholdContributorSpend(
    expenses.map(expense => ({
      contributorUserId:
        access.role === "owner" ||
        visibleContributorIds.has(expense.contributorUserId)
          ? expense.contributorUserId
          : 0,
      contributorName:
        access.role === "owner" ||
        visibleContributorIds.has(expense.contributorUserId)
          ? expense.contributorName || expense.contributorEmail || "সদস্য"
          : "সাবেক সদস্য",
      amount: Number(expense.amount),
    }))
  );
  const comparisonMonthKeys = Array.from({ length: 6 }, (_, index) =>
    offsetMonthKey(currentMonth, index - 5)
  );
  const comparisonStart = new Date(
    `${comparisonMonthKeys[0]}-01T00:00:00.000Z`
  );
  const comparisonEnd = new Date(
    `${offsetMonthKey(currentMonth, 1)}-01T00:00:00.000Z`
  );
  const comparisonBudgets = await db
    .select({
      id: financeSharedBudgets.id,
      monthKey: financeSharedBudgets.monthKey,
    })
    .from(financeSharedBudgets)
    .where(
      and(
        eq(financeSharedBudgets.householdId, householdId),
        gte(financeSharedBudgets.monthKey, comparisonMonthKeys[0]),
        lte(financeSharedBudgets.monthKey, currentMonth)
      )
    );
  const budgetMonthById = new Map(
    comparisonBudgets.map(budget => [budget.id, budget.monthKey])
  );
  const comparisonExpenses = comparisonBudgets.length
    ? (
        await db
          .select({
            budgetId: financeSharedExpenses.budgetId,
            contributorUserId: financeSharedExpenses.contributorUserId,
            amount: financeSharedExpenses.amount,
            occurredAt: financeSharedExpenses.occurredAt,
            contributorName: users.name,
            contributorEmail: users.email,
          })
          .from(financeSharedExpenses)
          .innerJoin(
            users,
            eq(financeSharedExpenses.contributorUserId, users.id)
          )
          .where(
            and(
              eq(financeSharedExpenses.householdId, householdId),
              gte(financeSharedExpenses.occurredAt, comparisonStart),
              lt(financeSharedExpenses.occurredAt, comparisonEnd)
            )
          )
      ).filter(
        expense =>
          budgetMonthById.get(expense.budgetId) === monthKey(expense.occurredAt)
      )
    : [];
  const monthlyContributorSpend = summarizeHouseholdContributorMonthlySpend(
    comparisonExpenses.map(expense => ({
      monthKey: monthKey(expense.occurredAt),
      contributorUserId:
        access.role === "owner" ||
        visibleContributorIds.has(expense.contributorUserId)
          ? expense.contributorUserId
          : 0,
      contributorName:
        access.role === "owner" ||
        visibleContributorIds.has(expense.contributorUserId)
          ? expense.contributorName || expense.contributorEmail || "সদস্য"
          : "সাবেক সদস্য",
      amount: Number(expense.amount),
    })),
    comparisonMonthKeys
  );
  return {
    household: access.household,
    currentRole: access.role,
    owner: owner
      ? { ...owner, role: "owner" as const, status: "active" as const }
      : null,
    members: visibleMembers,
    sharedBudgets,
    contributorSpend,
    monthlyContributorSpend,
    recentExpenses: expenses.slice(0, 20),
  };
}

export async function inviteHouseholdMember(
  userId: number,
  input: {
    householdId: number;
    email: string;
    displayName?: string;
    role: "editor" | "viewer";
  }
) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("সদস্যের ইমেইল দিন");
  const db = databaseRequired(await getDb());
  const [owner] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (owner?.email && normalizeEmail(owner.email) === email)
    throw new Error("নিজেকে সদস্য হিসেবে আমন্ত্রণ দেওয়া যাবে না");
  const [existing] = await db
    .select()
    .from(financeHouseholdMembers)
    .where(
      and(
        eq(financeHouseholdMembers.householdId, input.householdId),
        eq(financeHouseholdMembers.inviteeEmail, email)
      )
    )
    .limit(1);
  if (existing?.status === "active")
    throw new Error("এই সদস্য ইতিমধ্যে যুক্ত আছেন");
  const [registeredUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const values = {
    householdId: input.householdId,
    inviteeEmail: email,
    displayName: input.displayName?.trim() || null,
    role: input.role,
    status: "pending" as const,
    invitedByUserId: userId,
    userId: registeredUser?.id ?? null,
    acceptedAt: null,
  };
  if (existing) {
    await db
      .update(financeHouseholdMembers)
      .set(values)
      .where(eq(financeHouseholdMembers.id, existing.id));
    await logAudit({
      actorUserId: userId,
      action: "update",
      entityType: "household_member",
      entityId: existing.id,
      summary: "Household invitation renewed",
    });
    return existing.id;
  }
  const result = await db.insert(financeHouseholdMembers).values(values);
  const membershipId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    action: "create",
    entityType: "household_member",
    entityId: membershipId,
    summary: "Household invitation created",
  });
  return membershipId;
}

export async function acceptHouseholdInvitation(
  userId: number,
  membershipId: number
) {
  const db = databaseRequired(await getDb());
  const [currentUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [membership] = await db
    .select()
    .from(financeHouseholdMembers)
    .where(eq(financeHouseholdMembers.id, membershipId))
    .limit(1);
  if (
    !membership ||
    membership.status !== "pending" ||
    !currentUser?.email ||
    normalizeEmail(currentUser.email) !==
      normalizeEmail(membership.inviteeEmail)
  ) {
    throw new Error("এই আমন্ত্রণ গ্রহণের অনুমতি আপনার নেই");
  }
  await db
    .update(financeHouseholdMembers)
    .set({ userId, status: "active", acceptedAt: new Date() })
    .where(eq(financeHouseholdMembers.id, membershipId));
  await logAudit({
    actorUserId: userId,
    action: "update",
    entityType: "household_member",
    entityId: membershipId,
    summary: "Household invitation accepted",
  });
  return getHouseholdOverview(userId, membership.householdId);
}

export async function updateHouseholdMember(
  userId: number,
  input: {
    householdId: number;
    membershipId: number;
    role?: "editor" | "viewer";
    status?: "revoked";
  }
) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const db = databaseRequired(await getDb());
  const [membership] = await db
    .select()
    .from(financeHouseholdMembers)
    .where(
      and(
        eq(financeHouseholdMembers.id, input.membershipId),
        eq(financeHouseholdMembers.householdId, input.householdId)
      )
    )
    .limit(1);
  if (!membership) throw new Error("সদস্য পাওয়া যায়নি");
  await db
    .update(financeHouseholdMembers)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
    })
    .where(eq(financeHouseholdMembers.id, membership.id));
  await logAudit({
    actorUserId: userId,
    action: "update",
    entityType: "household_member",
    entityId: membership.id,
    summary:
      input.status === "revoked"
        ? "Household member revoked"
        : "Household member role updated",
  });
  return getHouseholdOverview(userId, input.householdId);
}

export async function saveSharedBudget(
  userId: number,
  input: {
    householdId: number;
    label: string;
    monthKey: string;
    amount: number;
  }
) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner"]);
  const label = input.label.trim();
  if (!label || !/^\d{4}-\d{2}$/.test(input.monthKey) || input.amount <= 0)
    throw new Error("শেয়ার করা বাজেটের তথ্য সঠিক নয়");
  const db = databaseRequired(await getDb());
  const [existing] = await db
    .select()
    .from(financeSharedBudgets)
    .where(
      and(
        eq(financeSharedBudgets.householdId, input.householdId),
        eq(financeSharedBudgets.label, label),
        eq(financeSharedBudgets.monthKey, input.monthKey)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(financeSharedBudgets)
      .set({ amount: decimal(input.amount), createdByUserId: userId })
      .where(eq(financeSharedBudgets.id, existing.id));
    await logAudit({
      actorUserId: userId,
      action: "update",
      entityType: "shared_budget",
      entityId: existing.id,
      summary: `Shared budget updated: ${label}`,
    });
    return existing.id;
  }
  const result = await db
    .insert(financeSharedBudgets)
    .values({
      householdId: input.householdId,
      label,
      monthKey: input.monthKey,
      amount: decimal(input.amount),
      createdByUserId: userId,
    });
  const budgetId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    action: "create",
    entityType: "shared_budget",
    entityId: budgetId,
    summary: `Shared budget created: ${label}`,
  });
  return budgetId;
}

export async function addSharedExpense(
  userId: number,
  input: {
    householdId: number;
    budgetId: number;
    amount: number;
    note?: string;
    occurredAt: Date;
  }
) {
  const access = await getHouseholdAccess(userId, input.householdId);
  requireHouseholdRole(access.role, ["owner", "editor"]);
  if (input.amount <= 0) throw new Error("খরচের পরিমাণ শূন্যের বেশি হতে হবে");
  const db = databaseRequired(await getDb());
  const [budget] = await db
    .select()
    .from(financeSharedBudgets)
    .where(
      and(
        eq(financeSharedBudgets.id, input.budgetId),
        eq(financeSharedBudgets.householdId, input.householdId)
      )
    )
    .limit(1);
  if (!budget) throw new Error("শেয়ার করা বাজেট পাওয়া যায়নি");
  const result = await db
    .insert(financeSharedExpenses)
    .values({
      householdId: input.householdId,
      budgetId: input.budgetId,
      contributorUserId: userId,
      amount: decimal(input.amount),
      note: input.note?.trim() || null,
      occurredAt: input.occurredAt,
    });
  const expenseId = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    action: "create",
    entityType: "shared_expense",
    entityId: expenseId,
    summary: "Shared household expense added",
  });
  return expenseId;
}

async function assertOwnedCategory(
  userId: number,
  projectId: number,
  categoryId: number,
  type?: "income" | "expense"
) {
  const db = databaseRequired(await getDb());
  const conditions = [
    eq(financeCategories.id, categoryId),
    eq(financeCategories.userId, userId),
    eq(financeCategories.projectId, projectId),
  ];
  if (type) conditions.push(eq(financeCategories.type, type));
  const [category] = await db
    .select()
    .from(financeCategories)
    .where(and(...conditions))
    .limit(1);
  if (!category) throw new Error("Category not found or access denied");
  return category;
}

async function assertOwnedAccount(
  userId: number,
  projectId: number,
  accountId: number
) {
  const db = databaseRequired(await getDb());
  const [account] = await db
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.id, accountId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.projectId, projectId)
      )
    )
    .limit(1);
  if (!account) throw new Error("Account not found or access denied");
  return account;
}

async function assertOwnedDue(
  userId: number,
  projectId: number,
  dueId: number
) {
  const db = databaseRequired(await getDb());
  const [due] = await db
    .select()
    .from(financeDues)
    .where(
      and(
        eq(financeDues.id, dueId),
        eq(financeDues.userId, userId),
        eq(financeDues.projectId, projectId)
      )
    )
    .limit(1);
  if (!due) throw new Error("দেনা বা পাওনার হিসাবটি পাওয়া যায়নি");
  return due;
}

async function adjustAccountBalance(
  userId: number,
  projectId: number,
  accountId: number | null,
  delta: number,
  tx?: DbOrTx
) {
  if (!accountId || delta === 0) return;
  const executor = tx || databaseRequired(await getDb());
  const [account] = await executor
    .select()
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.id, accountId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.projectId, projectId)
      )
    )
    .limit(1)
    .for("update");
  if (!account) throw new Error("Account not found or access denied");
  await executor
    .update(financeAccounts)
    .set({
      currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(delta)}`,
    })
    .where(
      and(
        eq(financeAccounts.id, accountId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.projectId, projectId)
      )
    );
}

export type AuditAction =
  | "create" | "update" | "delete" | "delete_attempt"
  | "approve" | "reject" | "post" | "reverse"
  | "login" | "logout" | "login_failed"
  | "permission_denied" | "user_suspended"
  | "backup_created" | "backup_restored";

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export async function logAudit(input: {
  actorUserId: number;
  actorRole?: string;
  projectId?: number | null;
  action: AuditAction;
  entityType: string;
  entityId?: number | null;
  summary: string;
  oldData?: unknown;
  newData?: unknown;
  auditContext?: AuditContext;
}) {
  const db = databaseRequired(await getDb());
  await db
    .insert(auditLogs)
    .values({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole ?? "user",
      projectId: input.projectId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      oldData: input.oldData != null ? JSON.stringify(input.oldData) : null,
      newData: input.newData != null ? JSON.stringify(input.newData) : null,
      ipAddress: input.auditContext?.ipAddress ?? null,
      userAgent: input.auditContext?.userAgent ?? null,
      requestId: input.auditContext?.requestId ?? null,
    });
}

/**
 * Append-only guard: audit logs may NEVER be modified or deleted.
 * This function always throws — it exists as a deliberate safety valve.
 * If you need to "clean" audit logs, export them and use a DBA tool.
 */
export async function deleteAuditLogs(): Promise<never> {
  throw new Error(
    "Audit logs are append-only. They may not be modified or deleted at runtime."
  );
}

/**
 * Append-only guard: audit logs may NEVER be updated.
 */
export async function updateAuditLogs(): Promise<never> {
  throw new Error(
    "Audit logs are append-only. They may not be modified or deleted at runtime."
  );
}

export async function getOverview(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const scope = and(
    eq(financeAccounts.userId, userId),
    eq(financeAccounts.projectId, projectId)
  );
  const [
    accounts,
    categories,
    transactions,
    budgets,
    bills,
    dues,
    dueSettlements,
    voucherSettings,
  ] = await Promise.all([
    db
      .select()
      .from(financeAccounts)
      .where(scope)
      .orderBy(asc(financeAccounts.createdAt)),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, projectId)
        )
      )
      .orderBy(asc(financeCategories.type), asc(financeCategories.name)),
    db
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId)
        )
      )
      .orderBy(
        desc(financeTransactions.occurredAt),
        desc(financeTransactions.id)
      ),
    db
      .select()
      .from(financeBudgets)
      .where(
        and(
          eq(financeBudgets.userId, userId),
          eq(financeBudgets.projectId, projectId),
          eq(financeBudgets.monthKey, monthKey())
        )
      ),
    db
      .select()
      .from(financeBills)
      .where(
        and(
          eq(financeBills.userId, userId),
          eq(financeBills.projectId, projectId)
        )
      )
      .orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt)),
    db
      .select()
      .from(financeDues)
      .where(
        and(
          eq(financeDues.userId, userId),
          eq(financeDues.projectId, projectId)
        )
      )
      .orderBy(desc(financeDues.openedAt), desc(financeDues.id)),
    db
      .select()
      .from(financeDueSettlements)
      .where(
        and(
          eq(financeDueSettlements.userId, userId),
          eq(financeDueSettlements.projectId, projectId)
        )
      )
      .orderBy(
        desc(financeDueSettlements.occurredAt),
        desc(financeDueSettlements.id)
      ),
    getVoucherSettings(userId, projectId),
  ]);
  const totalBalance = accounts.reduce(
    (sum, account) => sum + Number(account.currentBalance),
    0
  );
  const totalIncome = transactions
    .filter(row => row.type === "income")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const totalExpense = transactions
    .filter(row => row.type === "expense")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const budgetProgress = budgets.map(budget => {
    const category = categories.find(item => item.id === budget.categoryId);
    const spent = transactions
      .filter(
        row =>
          row.categoryId === budget.categoryId &&
          row.type === "expense" &&
          row.occurredAt.toISOString().slice(0, 7) === budget.monthKey
      )
      .reduce((sum, row) => sum + Number(row.amount), 0);
    return { ...budget, categoryName: category?.name ?? "Unknown", spent };
  });
  const budgetCandidates = budgetProgress.map(budget => ({
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    budgetAmount: Number(budget.amount),
    spent: budget.spent,
  }));
  const budgetAlerts = calculateBudgetAlerts(budgetCandidates);
  const budgetEarlyWarnings = calculateBudgetEarlyWarnings(budgetCandidates);
  const budgetAnomalies = calculateBurnRateAnomalies(budgetCandidates);
  const trend = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() - (5 - offset),
        1
      )
    );
    const key = date.toISOString().slice(0, 7);
    return {
      monthKey: key,
      income: transactions
        .filter(
          row =>
            row.type === "income" &&
            row.occurredAt.toISOString().slice(0, 7) === key
        )
        .reduce((sum, row) => sum + Number(row.amount), 0),
      expense: transactions
        .filter(
          row =>
            row.type === "expense" &&
            row.occurredAt.toISOString().slice(0, 7) === key
        )
        .reduce((sum, row) => sum + Number(row.amount), 0),
    };
  });
  const displayTransactions = transactions.map(transaction => ({
    ...transaction,
    categoryName:
      categories.find(category => category.id === transaction.categoryId)
        ?.name ?? "Unknown",
    accountName: transaction.accountId
      ? (accounts.find(account => account.id === transaction.accountId)?.name ??
        null)
      : null,
  }));
  const displayDues = dues.map(due => ({
    ...due,
    settlements: dueSettlements
      .filter(settlement => settlement.dueId === due.id)
      .map(settlement => ({
        ...settlement,
        accountName: settlement.accountId
          ? (accounts.find(account => account.id === settlement.accountId)
              ?.name ?? null)
          : null,
      })),
  }));
  const totalDebt = dues
    .filter(due => due.type === "debt")
    .reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalReceivable = dues
    .filter(due => due.type === "receivable")
    .reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  return {
    accounts,
    categories,
    transactions: displayTransactions,
    budgets: budgetProgress,
    budgetAlerts,
    budgetEarlyWarnings,
    budgetAnomalies,
    bills,
    dues: displayDues,
    voucherSettings,
    trend,
    monthKey: monthKey(),
    totals: {
      totalBalance,
      totalIncome,
      totalExpense,
      totalDebt,
      totalReceivable,
      netAmount: totalIncome - totalExpense,
    },
  };
}

export async function getBudgetPlan(
  userId: number,
  projectId: number,
  targetMonthKey: string
) {
  await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const previousMonthKey = offsetMonthKey(targetMonthKey, -1);
  const [categories, budgets, transactions] = await Promise.all([
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, projectId),
          eq(financeCategories.type, "expense")
        )
      )
      .orderBy(asc(financeCategories.name)),
    db
      .select()
      .from(financeBudgets)
      .where(
        and(
          eq(financeBudgets.userId, userId),
          eq(financeBudgets.projectId, projectId),
          or(
            eq(financeBudgets.monthKey, targetMonthKey),
            eq(financeBudgets.monthKey, previousMonthKey)
          )
        )
      ),
    db
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId),
          eq(financeTransactions.type, "expense")
        )
      ),
  ]);
  const plans = categories.map(category => {
    const currentBudget = budgets.find(
      budget =>
        budget.categoryId === category.id && budget.monthKey === targetMonthKey
    );
    const previousBudget = budgets.find(
      budget =>
        budget.categoryId === category.id &&
        budget.monthKey === previousMonthKey
    );
    const previousSpent = transactions
      .filter(
        transaction =>
          transaction.categoryId === category.id &&
          monthKey(transaction.occurredAt) === previousMonthKey
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const suggestedAmount = Number(previousBudget?.amount ?? previousSpent);
    return {
      categoryId: category.id,
      categoryName: category.name,
      currentBudget: currentBudget ? Number(currentBudget.amount) : null,
      previousBudget: previousBudget ? Number(previousBudget.amount) : null,
      previousSpent,
      suggestedAmount,
    };
  });
  return { targetMonthKey, previousMonthKey, plans };
}

export async function getFinanceAnalytics(
  userId: number,
  projectId: number,
  months = 6
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [transactions, budgets] = await Promise.all([
    db
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeBudgets)
      .where(
        and(
          eq(financeBudgets.userId, userId),
          eq(financeBudgets.projectId, projectId)
        )
      ),
  ]);
  const currentMonthKey = monthKey();
  const data = Array.from({ length: months }, (_, offset) => {
    const key = offsetMonthKey(currentMonthKey, -(months - 1 - offset));
    const income = transactions
      .filter(
        transaction =>
          transaction.type === "income" &&
          monthKey(transaction.occurredAt) === key
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const expense = transactions
      .filter(
        transaction =>
          transaction.type === "expense" &&
          monthKey(transaction.occurredAt) === key
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const budgeted = budgets
      .filter(budget => budget.monthKey === key)
      .reduce((sum, budget) => sum + Number(budget.amount), 0);
    return {
      monthKey: key,
      income,
      expense,
      savings: income - expense,
      budgeted,
      budgetUsagePercentage:
        budgeted > 0 ? Math.round((expense / budgeted) * 100) : null,
    };
  });
  return { data };
}

export async function searchTransactions(
  userId: number,
  input: {
    projectId: number;
    query?: string;
    categoryId?: number;
    type?: "income" | "expense";
    from?: Date;
    to?: Date;
    minAmount?: number;
    maxAmount?: number;
    limit: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const conditions = [
    eq(financeTransactions.userId, userId),
    eq(financeTransactions.projectId, input.projectId),
  ];
  if (input.categoryId)
    conditions.push(eq(financeTransactions.categoryId, input.categoryId));
  if (input.type) conditions.push(eq(financeTransactions.type, input.type));
  if (input.from)
    conditions.push(gte(financeTransactions.occurredAt, input.from));
  if (input.to) conditions.push(lte(financeTransactions.occurredAt, input.to));
  if (input.minAmount !== undefined)
    conditions.push(gte(financeTransactions.amount, decimal(input.minAmount)));
  if (input.maxAmount !== undefined)
    conditions.push(lte(financeTransactions.amount, decimal(input.maxAmount)));
  const query = input.query?.trim();
  if (query) {
    const term = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        like(financeTransactions.note, term),
        like(financeTransactions.voucherNo, term)
      )!
    );
  }
  const [transactions, categories, accounts] = await Promise.all([
    db
      .select()
      .from(financeTransactions)
      .where(and(...conditions))
      .orderBy(
        desc(financeTransactions.occurredAt),
        desc(financeTransactions.id)
      )
      .limit(input.limit),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, input.projectId)
        )
      ),
    db
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.projectId, input.projectId)
        )
      ),
  ]);
  return transactions.map(transaction => ({
    ...transaction,
    categoryName:
      categories.find(category => category.id === transaction.categoryId)
        ?.name ?? "অনির্ধারিত",
    accountName: transaction.accountId
      ? (accounts.find(account => account.id === transaction.accountId)?.name ??
        null)
      : null,
  }));
}

export async function listTransactionsPaginated(
  userId: number,
  input: {
    projectId: number;
    query?: string;
    categoryId?: number;
    type?: "income" | "expense";
    from?: Date;
    to?: Date;
    minAmount?: number;
    maxAmount?: number;
    page: number;
    pageSize: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const conditions = [
    eq(financeTransactions.userId, userId),
    eq(financeTransactions.projectId, input.projectId),
  ];
  if (input.categoryId)
    conditions.push(eq(financeTransactions.categoryId, input.categoryId));
  if (input.type) conditions.push(eq(financeTransactions.type, input.type));
  if (input.from)
    conditions.push(gte(financeTransactions.occurredAt, input.from));
  if (input.to) conditions.push(lte(financeTransactions.occurredAt, input.to));
  if (input.minAmount !== undefined)
    conditions.push(gte(financeTransactions.amount, decimal(input.minAmount)));
  if (input.maxAmount !== undefined)
    conditions.push(lte(financeTransactions.amount, decimal(input.maxAmount)));

  const query = input.query?.trim();
  if (query) {
    const term = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        like(financeTransactions.note, term),
        like(financeTransactions.voucherNo, term)
      )!
    );
  }

  const whereClause = and(...conditions);
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const offset = (page - 1) * pageSize;

  const [transactions, categories, accounts, [aggregations]] = await Promise.all([
    db
      .select()
      .from(financeTransactions)
      .where(whereClause)
      .orderBy(
        desc(financeTransactions.occurredAt),
        desc(financeTransactions.id)
      )
      .limit(pageSize)
      .offset(offset),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, input.projectId)
        )
      ),
    db
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.projectId, input.projectId)
        )
      ),
    db
      .select({
        totalCount: sql<number>`count(*)`,
        totalIncome: sql<string>`coalesce(sum(case when ${financeTransactions.type} = 'income' then ${financeTransactions.amount} else 0 end), 0)`,
        totalExpense: sql<string>`coalesce(sum(case when ${financeTransactions.type} = 'expense' then ${financeTransactions.amount} else 0 end), 0)`,
      })
      .from(financeTransactions)
      .where(whereClause),
  ]);

  const total = Number(aggregations?.totalCount ?? 0);
  const totalIncome = Number(aggregations?.totalIncome ?? 0);
  const totalExpense = Number(aggregations?.totalExpense ?? 0);

  const items = transactions.map(transaction => ({
    ...transaction,
    categoryName:
      categories.find(category => category.id === transaction.categoryId)
        ?.name ?? "অনির্ধারিত",
    accountName: transaction.accountId
      ? (accounts.find(account => account.id === transaction.accountId)?.name ??
        null)
      : null,
  }));

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    aggregations: {
      totalCount: total,
      totalIncome,
      totalExpense,
      netAmount: totalIncome - totalExpense,
    },
  };
}

export async function getMonthlyReport(
  userId: number,
  projectId: number,
  targetMonthKey: string
) {
  const project = await assertOwnedProject(userId, projectId);
  await ensureDefaultCategories(userId, projectId);
  const db = databaseRequired(await getDb());
  const [accounts, categories, transactions, dues] = await Promise.all([
    db
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.projectId, projectId)
        )
      )
      .orderBy(asc(financeAccounts.createdAt)),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, projectId)
        )
      )
      .orderBy(asc(financeCategories.type), asc(financeCategories.name)),
    db
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId)
        )
      )
      .orderBy(
        asc(financeTransactions.occurredAt),
        asc(financeTransactions.id)
      ),
    db
      .select()
      .from(financeDues)
      .where(
        and(
          eq(financeDues.userId, userId),
          eq(financeDues.projectId, projectId)
        )
      )
      .orderBy(asc(financeDues.openedAt), asc(financeDues.id)),
  ]);
  const isInSelectedMonth = (value: Date | string) =>
    new Date(value).toISOString().slice(0, 7) === targetMonthKey;
  const targetMonth = new Date(`${targetMonthKey}-01T12:00:00Z`);
  const previousMonthKey = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() - 1, 1)
  )
    .toISOString()
    .slice(0, 7);
  const isInPreviousMonth = (value: Date | string) =>
    new Date(value).toISOString().slice(0, 7) === previousMonthKey;
  const monthTransactions = transactions.filter(transaction =>
    isInSelectedMonth(transaction.occurredAt)
  );
  const totalIncome = monthTransactions
    .filter(transaction => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const totalExpense = monthTransactions
    .filter(transaction => transaction.type === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const categoryTotals = categories
    .map(category => ({
      name: category.name,
      type: category.type,
      total: monthTransactions
        .filter(transaction => transaction.categoryId === category.id)
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
    }))
    .filter(category => category.total > 0);
  const totalDebt = dues
    .filter(due => due.type === "debt")
    .reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalReceivable = dues
    .filter(due => due.type === "receivable")
    .reduce((sum, due) => sum + Number(due.outstandingAmount), 0);
  const totalAccountBalance = accounts.reduce(
    (sum, account) => sum + Number(account.currentBalance),
    0
  );
  const previousExpenseCategoryTotals = categories
    .filter(category => category.type === "expense")
    .map(category => ({
      name: category.name,
      total: transactions
        .filter(
          transaction =>
            transaction.type === "expense" &&
            transaction.categoryId === category.id &&
            isInPreviousMonth(transaction.occurredAt)
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
    }));
  const transactionDetails = monthTransactions.map(transaction => ({
    occurredAt: transaction.occurredAt,
    voucherNo: transaction.voucherNo ?? "—",
    type: transaction.type,
    categoryName:
      categories.find(category => category.id === transaction.categoryId)
        ?.name ?? "অনির্ধারিত",
    description: transaction.note ?? "—",
    amount: Number(transaction.amount),
  }));
  const dueDetails = dues.map(due => ({
    type: due.type,
    counterparty: due.counterparty,
    voucherNo: due.voucherNo ?? "—",
    openedAt: due.openedAt,
    description: due.note ?? "—",
    originalAmount: Number(due.originalAmount),
    outstandingAmount: Number(due.outstandingAmount),
  }));
  return {
    projectName: project.name,
    monthKey: targetMonthKey,
    totalIncome,
    totalExpense,
    netAmount: totalIncome - totalExpense,
    categoryTotals,
    totalDebt,
    totalReceivable,
    transactionCount: monthTransactions.length,
    transactionDetails,
    previousMonthKey,
    previousExpenseCategoryTotals,
    profitAndLoss: {
      income: totalIncome,
      expense: totalExpense,
      profitOrLoss: totalIncome - totalExpense,
    },
    financialPosition: {
      accountBalance: totalAccountBalance,
      receivables: totalReceivable,
      assets: totalAccountBalance + totalReceivable,
      debts: totalDebt,
      netFinancialPosition: totalAccountBalance + totalReceivable - totalDebt,
    },
    accountDetails: accounts.map(account => ({
      name: account.name,
      type: account.type,
      currentBalance: Number(account.currentBalance),
    })),
    dueDetails,
  };
}

export async function createDue(
  userId: number,
  input: {
    projectId: number;
    type: "debt" | "receivable";
    counterparty: string;
    amount: number;
    note?: string;
    openedAt: Date;
    dueAt?: Date;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const id = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const result = await tx
      .insert(financeDues)
      .values({
        userId,
        projectId: input.projectId,
        type: input.type,
        counterparty: input.counterparty.trim(),
        originalAmount: decimal(input.amount),
        outstandingAmount: decimal(input.amount),
        voucherNo,
        note: input.note?.trim() || null,
        openedAt: input.openedAt,
        dueAt: input.dueAt ?? null,
      });
    return Number(result[0].insertId);
  });
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: input.type,
    entityId: id,
    summary: `${input.type === "debt" ? "Debt" : "Receivable"} added: ${input.counterparty.trim()}`,
  });
  return assertOwnedDue(userId, input.projectId, id);
}

export async function settleDue(
  userId: number,
  input: {
    projectId: number;
    dueId: number;
    accountId?: number;
    amount: number;
    note?: string;
    occurredAt: Date;
  }
) {
  const due = await assertOwnedDue(userId, input.projectId, input.dueId);
  let effect: ReturnType<typeof calculateDueSettlement>;
  try {
    effect = calculateDueSettlement(
      due.type,
      Number(due.outstandingAmount),
      input.amount
    );
  } catch {
    throw new Error(
      "পরিশোধ বা আদায়ের পরিমাণ বকেয়া টাকার চেয়ে বেশি হতে পারে না"
    );
  }
  if (input.accountId)
    await assertOwnedAccount(userId, input.projectId, input.accountId);
  const db = databaseRequired(await getDb());
  await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const updateResult = await tx
      .update(financeDues)
      .set({
        outstandingAmount: sql`${financeDues.outstandingAmount} - ${decimal(input.amount)}`,
      })
      .where(
        and(
          eq(financeDues.id, input.dueId),
          eq(financeDues.userId, userId),
          eq(financeDues.projectId, input.projectId),
          gte(financeDues.outstandingAmount, decimal(input.amount))
        )
      );
    if (!updateResult[0].affectedRows)
      throw new Error("বকেয়া পরিমাণ পরিবর্তিত হয়েছে; আবার চেষ্টা করুন");
    const settlementResult = await tx
      .insert(financeDueSettlements)
      .values({
        userId,
        projectId: input.projectId,
        dueId: input.dueId,
        accountId: input.accountId ?? null,
        amount: decimal(input.amount),
        voucherNo,
        note: input.note?.trim() || null,
        occurredAt: input.occurredAt,
      });
    if (input.accountId) {
      await tx
        .update(financeAccounts)
        .set({
          currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(effect.accountBalanceDelta)}`,
        })
        .where(
          and(
            eq(financeAccounts.id, input.accountId),
            eq(financeAccounts.userId, userId),
            eq(financeAccounts.projectId, input.projectId)
          )
        );
    }
    const settlementId = Number(settlementResult[0].insertId);
    await tx
      .insert(auditLogs)
      .values({
        actorUserId: userId,
        projectId: input.projectId,
        action: "create",
        entityType:
          due.type === "debt" ? "debt_settlement" : "receivable_collection",
        entityId: settlementId,
        summary: `${due.type === "debt" ? "Debt payment" : "Receivable collection"}: ${due.counterparty}`,
      });
  });
}

export async function createAccount(
  userId: number,
  input: {
    projectId: number;
    name: string;
    type: "cash" | "bank" | "mobile";
    openingBalance: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const result = await db
    .insert(financeAccounts)
    .values({
      userId,
      projectId: input.projectId,
      name: input.name.trim(),
      type: input.type,
      openingBalance: decimal(input.openingBalance),
      currentBalance: decimal(input.openingBalance),
    });
  const id = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "account",
    entityId: id,
    summary: `Account created: ${input.name.trim()}`,
  });

  const [created] = await db
    .select()
    .from(financeAccounts)
    .where(eq(financeAccounts.id, id))
    .limit(1);
  return created;
}

export async function updateAccount(
  userId: number,
  id: number,
  input: {
    projectId: number;
    name: string;
    type: "cash" | "bank" | "mobile";
    openingBalance: number;
  }
) {
  const db = databaseRequired(await getDb());
  const existing = await assertOwnedAccount(userId, input.projectId, id);
  const openingDifference =
    input.openingBalance - Number(existing.openingBalance);
  await db
    .update(financeAccounts)
    .set({
      name: input.name.trim(),
      type: input.type,
      openingBalance: decimal(input.openingBalance),
      currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(openingDifference)}`,
    })
    .where(
      and(
        eq(financeAccounts.id, id),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.projectId, input.projectId)
      )
    );
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "update",
    entityType: "account",
    entityId: id,
    summary: `Account updated: ${input.name.trim()}`,
  });
}

export async function deleteAccount(
  userId: number,
  projectId: number,
  id: number
) {
  const db = databaseRequired(await getDb());
  await assertOwnedAccount(userId, projectId, id);
  const [transaction] = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.projectId, projectId),
        eq(financeTransactions.accountId, id)
      )
    )
    .limit(1);
  if (transaction)
    throw new Error(
      "লেনদেন থাকা অ্যাকাউন্ট মুছতে আগে ওই লেনদেনগুলো সম্পাদনা বা মুছুন"
    );
  await db
    .delete(financeAccounts)
    .where(
      and(
        eq(financeAccounts.id, id),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.projectId, projectId)
      )
    );
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "account",
    entityId: id,
    summary: "Account deleted",
  });
}

export async function createTransaction(
  userId: number,
  input: {
    projectId: number;
    categoryId: number;
    accountId?: number;
    type: "income" | "expense";
    amount: number;
    paymentMethod: string;
    note?: string;
    occurredAt: Date;
    idempotencyKey?: string;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  await assertOwnedCategory(
    userId,
    input.projectId,
    input.categoryId,
    input.type
  );
  if (input.accountId)
    await assertOwnedAccount(userId, input.projectId, input.accountId);

  const cleanIdempKey = input.idempotencyKey?.trim();
  const db = databaseRequired(await getDb());

  // Persistent idempotency only — no in-process Map (multi-instance safe).
  if (cleanIdempKey) {
    const [existing] = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, input.projectId),
          like(financeTransactions.note, `%[idemp:${cleanIdempKey}]%`)
        )
      )
      .limit(1);

    if (existing) {
      return existing.id;
    }
  }

  let finalNote = input.note?.trim() || null;
  if (cleanIdempKey) {
    const tag = `[idemp:${cleanIdempKey}]`;
    if (!finalNote) {
      finalNote = tag;
    } else if (!finalNote.includes(tag)) {
      finalNote = `${finalNote} ${tag}`.slice(0, 500);
    }
  }

  const id = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);
    const result = await tx.insert(financeTransactions).values({
      userId,
      projectId: input.projectId,
      categoryId: input.categoryId,
      accountId: input.accountId ?? null,
      type: input.type,
      amount: decimal(input.amount),
      voucherNo,
      paymentMethod: input.paymentMethod.trim(),
      note: finalNote,
      occurredAt: input.occurredAt,
    });
    const insertId = Number(result[0].insertId);
    await adjustAccountBalance(
      userId,
      input.projectId,
      input.accountId ?? null,
      signedAmount(input.type, input.amount),
      tx
    );
    return insertId;
  });

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "transaction",
    entityId: id,
    summary: `${input.type === "income" ? "Income" : "Expense"} transaction created`,
  });
  return id;
}

export async function updateTransaction(
  userId: number,
  id: number,
  input: {
    projectId: number;
    categoryId: number;
    accountId?: number;
    type: "income" | "expense";
    amount: number;
    paymentMethod: string;
    note?: string;
    occurredAt: Date;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  await db.transaction(async tx => {
    const [existing] = await tx
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.id, id),
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, input.projectId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("Transaction not found or access denied");
    await assertOwnedCategory(
      userId,
      input.projectId,
      input.categoryId,
      input.type
    );
    if (input.accountId)
      await assertOwnedAccount(userId, input.projectId, input.accountId);
    await adjustAccountBalance(
      userId,
      input.projectId,
      existing.accountId,
      -signedAmount(existing.type, existing.amount),
      tx
    );
    await tx
      .update(financeTransactions)
      .set({
        categoryId: input.categoryId,
        accountId: input.accountId ?? null,
        type: input.type,
        amount: decimal(input.amount),
        paymentMethod: input.paymentMethod.trim(),
        note: input.note?.trim() || null,
        occurredAt: input.occurredAt,
      })
      .where(eq(financeTransactions.id, id));
    await adjustAccountBalance(
      userId,
      input.projectId,
      input.accountId ?? null,
      signedAmount(input.type, input.amount),
      tx
    );
  });
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "update",
    entityType: "transaction",
    entityId: id,
    summary: "Transaction updated",
  });
}

export async function deleteTransaction(
  userId: number,
  projectId: number,
  id: number
) {
  const db = databaseRequired(await getDb());
  await db.transaction(async tx => {
    const [transaction] = await tx
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.id, id),
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId)
        )
      )
      .limit(1);
    if (!transaction) throw new Error("Transaction not found or access denied");
    await adjustAccountBalance(
      userId,
      projectId,
      transaction.accountId,
      -signedAmount(transaction.type, transaction.amount),
      tx
    );
    await tx.delete(financeTransactions).where(eq(financeTransactions.id, id));
  });
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "transaction",
    entityId: id,
    summary: "Transaction deleted",
  });
}

export async function upsertBudget(
  userId: number,
  input: {
    projectId: number;
    categoryId: number;
    monthKey: string;
    amount: number;
  }
) {
  await assertOwnedCategory(
    userId,
    input.projectId,
    input.categoryId,
    "expense"
  );
  const db = databaseRequired(await getDb());
  await db
    .insert(financeBudgets)
    .values({
      userId,
      projectId: input.projectId,
      categoryId: input.categoryId,
      monthKey: input.monthKey,
      amount: decimal(input.amount),
    })
    .onDuplicateKeyUpdate({ set: { amount: decimal(input.amount) } });
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "update",
    entityType: "budget",
    summary: "Monthly budget saved",
  });
}

export async function createBill(
  userId: number,
  input: {
    projectId: number;
    title: string;
    amount: number;
    dueAt: Date;
    reminderDaysBefore?: number;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());
  const result = await db
    .insert(financeBills)
    .values({
      userId,
      projectId: input.projectId,
      title: input.title.trim(),
      amount: decimal(input.amount),
      dueAt: input.dueAt,
      reminderDaysBefore: input.reminderDaysBefore ?? 3,
    });
  const id = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "bill",
    entityId: id,
    summary: "Bill reminder created",
  });
}

export async function updateBill(
  userId: number,
  projectId: number,
  id: number,
  input: {
    title: string;
    amount: number;
    dueAt: Date;
    isPaid: boolean;
    reminderDaysBefore?: number;
  }
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeBills)
    .set({
      title: input.title.trim(),
      amount: decimal(input.amount),
      dueAt: input.dueAt,
      isPaid: input.isPaid,
      ...(input.reminderDaysBefore !== undefined
        ? { reminderDaysBefore: input.reminderDaysBefore }
        : {}),
    })
    .where(
      and(
        eq(financeBills.id, id),
        eq(financeBills.userId, userId),
        eq(financeBills.projectId, projectId)
      )
    );
  if (result[0].affectedRows === 0)
    throw new Error("Bill not found or access denied");
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "bill",
    entityId: id,
    summary: "Bill reminder updated",
  });
}

export async function setBillPaid(
  userId: number,
  projectId: number,
  id: number,
  isPaid: boolean
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeBills)
    .set({ isPaid })
    .where(
      and(
        eq(financeBills.id, id),
        eq(financeBills.userId, userId),
        eq(financeBills.projectId, projectId)
      )
    );
  if (result[0].affectedRows === 0)
    throw new Error("Bill not found or access denied");
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "bill",
    entityId: id,
    summary: `Bill marked ${isPaid ? "paid" : "unpaid"}`,
  });
}

export async function deleteBill(
  userId: number,
  projectId: number,
  id: number
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .delete(financeBills)
    .where(
      and(
        eq(financeBills.id, id),
        eq(financeBills.userId, userId),
        eq(financeBills.projectId, projectId)
      )
    );
  if (result[0].affectedRows === 0)
    throw new Error("Bill not found or access denied");
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "bill",
    entityId: id,
    summary: "Bill reminder deleted",
  });
}

export async function getAutomationOverview(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [recurring, bills, dues, accounts, categories] = await Promise.all([
    db
      .select()
      .from(financeRecurringTransactions)
      .where(
        and(
          eq(financeRecurringTransactions.userId, userId),
          eq(financeRecurringTransactions.projectId, projectId)
        )
      )
      .orderBy(asc(financeRecurringTransactions.nextRunAt)),
    db
      .select()
      .from(financeBills)
      .where(
        and(
          eq(financeBills.userId, userId),
          eq(financeBills.projectId, projectId)
        )
      )
      .orderBy(asc(financeBills.isPaid), asc(financeBills.dueAt)),
    db
      .select()
      .from(financeDues)
      .where(
        and(
          eq(financeDues.userId, userId),
          eq(financeDues.projectId, projectId)
        )
      )
      .orderBy(asc(financeDues.dueAt), asc(financeDues.openedAt)),
    db
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, projectId)
        )
      ),
  ]);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  return {
    recurring: recurring.map(row => ({
      ...row,
      amount: Number(row.amount),
      accountName: row.accountId
        ? (accounts.find(account => account.id === row.accountId)?.name ?? null)
        : null,
      categoryName:
        categories.find(category => category.id === row.categoryId)?.name ??
        "অজানা ক্যাটাগরি",
    })),
    bills: bills.map(row => ({
      ...row,
      amount: Number(row.amount),
      reminderDueAt: new Date(
        row.dueAt.getTime() - row.reminderDaysBefore * 86_400_000
      ),
    })),
    ageing: dues
      .filter(due => Number(due.outstandingAmount) > 0)
      .map(due => {
        const dueAt = due.dueAt ? new Date(due.dueAt) : null;
        const daysOverdue = dueAt
          ? Math.max(
              0,
              Math.floor((startToday.getTime() - dueAt.getTime()) / 86_400_000)
            )
          : null;
        const overdueDays = daysOverdue ?? 0;
        const status = !dueAt
          ? "undated"
          : overdueDays > 30
            ? "overdue_31_plus"
            : overdueDays > 0
              ? "overdue_1_30"
              : dueAt.getTime() < startToday.getTime() + 86_400_000
                ? "due_today"
                : "upcoming";
        return {
          ...due,
          originalAmount: Number(due.originalAmount),
          outstandingAmount: Number(due.outstandingAmount),
          daysOverdue,
          status,
        };
      }),
  };
}

export async function createRecurringTemplate(
  userId: number,
  input: {
    projectId: number;
    accountId?: number;
    categoryId: number;
    type: "income" | "expense";
    amount: number;
    paymentMethod: string;
    note?: string;
    frequency: "weekly" | "monthly";
    scheduleDay: number;
    nextRunAt: Date;
  }
) {
  await assertOwnedProject(userId, input.projectId);
  await assertOwnedCategory(
    userId,
    input.projectId,
    input.categoryId,
    input.type
  );
  if (input.accountId)
    await assertOwnedAccount(userId, input.projectId, input.accountId);
  const db = databaseRequired(await getDb());
  const result = await db
    .insert(financeRecurringTransactions)
    .values({
      userId,
      projectId: input.projectId,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId,
      type: input.type,
      amount: decimal(input.amount),
      paymentMethod: input.paymentMethod.trim(),
      note: input.note?.trim() || null,
      frequency: input.frequency,
      scheduleDay: input.scheduleDay,
      nextRunAt: input.nextRunAt,
    });
  const id = Number(result[0].insertId);
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "recurring_transaction",
    entityId: id,
    summary: "Recurring transaction template created",
  });
  return id;
}

export async function setRecurringScheduleTask(
  userId: number,
  projectId: number,
  id: number,
  scheduleCronTaskUid: string | null
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeRecurringTransactions)
    .set({ scheduleCronTaskUid })
    .where(
      and(
        eq(financeRecurringTransactions.id, id),
        eq(financeRecurringTransactions.userId, userId),
        eq(financeRecurringTransactions.projectId, projectId)
      )
    );
  if (!result[0].affectedRows)
    throw new Error("পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
}

export async function updateRecurringTemplate(
  userId: number,
  input: { id: number; projectId: number; isActive: boolean }
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeRecurringTransactions)
    .set({ isActive: input.isActive })
    .where(
      and(
        eq(financeRecurringTransactions.id, input.id),
        eq(financeRecurringTransactions.userId, userId),
        eq(financeRecurringTransactions.projectId, input.projectId)
      )
    );
  if (!result[0].affectedRows)
    throw new Error("পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "update",
    entityType: "recurring_transaction",
    entityId: input.id,
    summary: input.isActive
      ? "Recurring transaction activated"
      : "Recurring transaction paused",
  });
}

export async function setBillReminderSettings(
  userId: number,
  projectId: number,
  id: number,
  reminderDaysBefore: number
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeBills)
    .set({ reminderDaysBefore })
    .where(
      and(
        eq(financeBills.id, id),
        eq(financeBills.userId, userId),
        eq(financeBills.projectId, projectId)
      )
    );
  if (!result[0].affectedRows) throw new Error("বিলটি পাওয়া যায়নি");
}

export async function setBillScheduleTask(
  userId: number,
  projectId: number,
  id: number,
  scheduleCronTaskUid: string | null
) {
  const db = databaseRequired(await getDb());
  const result = await db
    .update(financeBills)
    .set({ scheduleCronTaskUid })
    .where(
      and(
        eq(financeBills.id, id),
        eq(financeBills.userId, userId),
        eq(financeBills.projectId, projectId)
      )
    );
  if (!result[0].affectedRows) throw new Error("বিলটি পাওয়া যায়নি");
}

function advanceRecurringRun(
  current: Date,
  frequency: "weekly" | "monthly",
  scheduleDay: number
) {
  if (frequency === "weekly")
    return new Date(
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate() + 7,
        12
      )
    );
  const monthStart = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1, 12)
  );
  const lastDay = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth(),
      Math.min(scheduleDay, lastDay),
      12
    )
  );
}

async function generateRecurringRuns(
  template: typeof financeRecurringTransactions.$inferSelect,
  now: Date
) {
  const db = databaseRequired(await getDb());
  let created = 0;
  let nextRunAt = new Date(template.nextRunAt);
  for (let safety = 0; nextRunAt <= now && safety < 24; safety += 1) {
    const runKey = nextRunAt.toISOString().slice(0, 10);
    await db.transaction(async tx => {
      const [existing] = await tx
        .select({ id: financeTransactions.id })
        .from(financeTransactions)
        .where(
          and(
            eq(financeTransactions.recurringTemplateId, template.id),
            eq(financeTransactions.recurringRunKey, runKey)
          )
        )
        .limit(1);
      if (existing) return;
      const voucherNo = await claimNextVoucher(
        tx,
        template.userId,
        template.projectId
      );
      const result = await tx
        .insert(financeTransactions)
        .values({
          userId: template.userId,
          projectId: template.projectId,
          accountId: template.accountId,
          categoryId: template.categoryId,
          type: template.type,
          amount: template.amount,
          voucherNo,
          paymentMethod: template.paymentMethod,
          note: template.note,
          recurringTemplateId: template.id,
          recurringRunKey: runKey,
          occurredAt: nextRunAt,
        });
      if (template.accountId)
        await tx
          .update(financeAccounts)
          .set({
            currentBalance: sql`${financeAccounts.currentBalance} + ${decimal(signedAmount(template.type, template.amount))}`,
          })
          .where(
            and(
              eq(financeAccounts.id, template.accountId),
              eq(financeAccounts.userId, template.userId),
              eq(financeAccounts.projectId, template.projectId)
            )
          );
      await tx
        .insert(auditLogs)
        .values({
          actorUserId: template.userId,
          projectId: template.projectId,
          action: "create",
          entityType: "recurring_transaction_run",
          entityId: Number(result[0].insertId),
          summary: `Recurring transaction generated for ${runKey}`,
        });
      created += 1;
    });
    nextRunAt = advanceRecurringRun(
      nextRunAt,
      template.frequency,
      template.scheduleDay
    );
  }
  await db
    .update(financeRecurringTransactions)
    .set({
      nextRunAt,
      lastGeneratedAt: created ? now : template.lastGeneratedAt,
    })
    .where(eq(financeRecurringTransactions.id, template.id));
  return { created, nextRunAt };
}

export async function generateRecurringNow(
  userId: number,
  projectId: number,
  id: number,
  now = new Date()
) {
  const db = databaseRequired(await getDb());
  const [template] = await db
    .select()
    .from(financeRecurringTransactions)
    .where(
      and(
        eq(financeRecurringTransactions.id, id),
        eq(financeRecurringTransactions.userId, userId),
        eq(financeRecurringTransactions.projectId, projectId),
        eq(financeRecurringTransactions.isActive, true)
      )
    )
    .limit(1);
  if (!template) throw new Error("চালু পুনরাবৃত্ত টেমপ্লেটটি পাওয়া যায়নি");
  return generateRecurringRuns(template, now);
}

export async function processScheduledRecurring(
  taskUid: string,
  now = new Date()
) {
  const db = databaseRequired(await getDb());
  const [template] = await db
    .select()
    .from(financeRecurringTransactions)
    .where(
      and(
        eq(financeRecurringTransactions.scheduleCronTaskUid, taskUid),
        eq(financeRecurringTransactions.isActive, true)
      )
    )
    .limit(1);
  if (!template) return { created: 0, skipped: true };
  const result = await generateRecurringRuns(template, now);
  return { ...result, skipped: false };
}

export async function processScheduledBillReminder(
  taskUid: string,
  now = new Date()
) {
  const db = databaseRequired(await getDb());
  const [bill] = await db
    .select()
    .from(financeBills)
    .where(eq(financeBills.scheduleCronTaskUid, taskUid))
    .limit(1);
  if (!bill || bill.isPaid) return { reminded: false, skipped: true };
  const reminderDueAt = new Date(
    bill.dueAt.getTime() - bill.reminderDaysBefore * 86_400_000
  );
  if (now < reminderDueAt) return { reminded: false, skipped: true };
  await db
    .update(financeBills)
    .set({ lastReminderAt: now })
    .where(eq(financeBills.id, bill.id));
  return { reminded: true, skipped: false };
}

export async function exportUserData(userId: number) {
  const db = databaseRequired(await getDb());
  const [projects, accounts, categories, transactions, budgets, bills] =
    await Promise.all([
      listProjects(userId),
      db
        .select()
        .from(financeAccounts)
        .where(eq(financeAccounts.userId, userId)),
      db
        .select()
        .from(financeCategories)
        .where(eq(financeCategories.userId, userId)),
      db
        .select()
        .from(financeTransactions)
        .where(eq(financeTransactions.userId, userId)),
      db.select().from(financeBudgets).where(eq(financeBudgets.userId, userId)),
      db.select().from(financeBills).where(eq(financeBills.userId, userId)),
    ]);
  return { projects, accounts, categories, transactions, budgets, bills };
}

export async function exportProjectBackup(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  const [project] = await db
    .select()
    .from(financeProjects)
    .where(
      and(eq(financeProjects.id, projectId), eq(financeProjects.userId, userId))
    )
    .limit(1);
  if (!project) throw new Error("নির্বাচিত প্রজেক্টটি পাওয়া যায়নি");
  const [
    accounts,
    categories,
    transactions,
    budgets,
    bills,
    dues,
    settlements,
    recurring,
    voucherSettings,
    chartOfAccounts,
    vouchers,
    voucherDebits,
    voucherCredits,
    ledgerEntries,
    journalEntries,
    journalLines,
  ] = await Promise.all([
    db
      .select()
      .from(financeAccounts)
      .where(
        and(
          eq(financeAccounts.userId, userId),
          eq(financeAccounts.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeCategories)
      .where(
        and(
          eq(financeCategories.userId, userId),
          eq(financeCategories.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeBudgets)
      .where(
        and(
          eq(financeBudgets.userId, userId),
          eq(financeBudgets.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeBills)
      .where(
        and(
          eq(financeBills.userId, userId),
          eq(financeBills.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeDues)
      .where(
        and(
          eq(financeDues.userId, userId),
          eq(financeDues.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeDueSettlements)
      .where(
        and(
          eq(financeDueSettlements.userId, userId),
          eq(financeDueSettlements.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeRecurringTransactions)
      .where(
        and(
          eq(financeRecurringTransactions.userId, userId),
          eq(financeRecurringTransactions.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeVoucherSettings)
      .where(
        and(
          eq(financeVoucherSettings.userId, userId),
          eq(financeVoucherSettings.projectId, projectId)
        )
      )
      .limit(1),
    // Double-entry scope (CoA + vouchers + lines) so backups are not cash-only.
    db
      .select()
      .from(financeChartOfAccounts)
      .where(
        and(
          eq(financeChartOfAccounts.userId, userId),
          eq(financeChartOfAccounts.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeVouchers)
      .where(
        and(
          eq(financeVouchers.userId, userId),
          eq(financeVouchers.projectId, projectId)
        )
      ),
    db
      .select()
      .from(financeVoucherDebits)
      .innerJoin(financeVouchers, eq(financeVoucherDebits.voucherId, financeVouchers.id))
      .where(
        and(
          eq(financeVouchers.userId, userId),
          eq(financeVouchers.projectId, projectId)
        )
      )
      .then(rows => rows.map(r => r.finance_voucher_debits)),
    db
      .select()
      .from(financeVoucherCredits)
      .innerJoin(financeVouchers, eq(financeVoucherCredits.voucherId, financeVouchers.id))
      .where(
        and(
          eq(financeVouchers.userId, userId),
          eq(financeVouchers.projectId, projectId)
        )
      )
      .then(rows => rows.map(r => r.finance_voucher_credits)),
    db
      .select()
      .from(financeLedgerEntries)
      .innerJoin(financeVouchers, eq(financeLedgerEntries.voucherId, financeVouchers.id))
      .where(
        and(
          eq(financeVouchers.userId, userId),
          eq(financeVouchers.projectId, projectId)
        )
      )
      .then(rows => rows.map(r => r.finance_ledger_entries)),
    db
      .select()
      .from(financeJournalEntries)
      .where(eq(financeJournalEntries.projectId, projectId)),
    db
      .select()
      .from(financeJournalLines)
      .innerJoin(financeJournalEntries, eq(financeJournalLines.journalEntryId, financeJournalEntries.id))
      .where(eq(financeJournalEntries.projectId, projectId))
      .then(rows => rows.map(r => r.finance_journal_lines)),
  ]);
  return {
    formatVersion: "finance-project-backup-v2" as const,
    exportedAt: new Date(),
    project: { id: project.id, name: project.name },
    accounts,
    categories,
    transactions,
    budgets,
    bills,
    dues,
    settlements,
    recurring,
    voucherSettings: voucherSettings[0] ?? null,
    // Double-entry books (optional for older v1 restore paths).
    chartOfAccounts,
    vouchers,
    voucherDebits,
    voucherCredits,
    ledgerEntries,
    journalEntries,
    journalLines,
  };
}

function assertUniqueBackupIds(rows: Array<{ id: number }>, label: string) {
  if (new Set(rows.map(row => row.id)).size !== rows.length)
    throw new Error(`${label} ব্যাকআপে একই আইডি একাধিকবার আছে`);
}

type BackupJsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | BackupJsonValue[]
  | { [key: string]: BackupJsonValue };

/** Loose backup row: known columns are typed for Drizzle inserts; extra JSON keys allowed. */
type ProjectBackupRow = {
  id: number;
  name?: string;
  type?: string;
  title?: string;
  counterparty?: string;
  paymentMethod?: string;
  note?: string | null;
  reason?: string | null;
  voucherNo?: string | null;
  amount?: string | number;
  openingBalance?: string | number;
  currentBalance?: string | number;
  originalAmount?: string | number;
  outstandingAmount?: string | number;
  monthKey?: string;
  categoryId?: number;
  accountId?: number | null;
  dueId?: number;
  isDefault?: boolean;
  isPaid?: boolean;
  frequency?: string;
  scheduleDay?: number;
  reminderDaysBefore?: number;
  nextRunAt?: Date | string;
  lastGeneratedAt?: Date | string | null;
  lastReminderAt?: Date | string | null;
  openedAt?: Date | string;
  dueAt?: Date | string | null;
  occurredAt?: Date | string;
  [key: string]: BackupJsonValue;
};

type ProjectBackupLike = {
  project: { id?: number; name: string };
  exportedAt: Date | string;
  accounts: ProjectBackupRow[];
  categories: ProjectBackupRow[];
  transactions: Array<ProjectBackupRow & { categoryId: number; accountId?: number | null; occurredAt: Date | string }>;
  budgets: Array<ProjectBackupRow & { categoryId: number }>;
  bills: ProjectBackupRow[];
  dues: ProjectBackupRow[];
  settlements: Array<ProjectBackupRow & { dueId: number; accountId?: number | null }>;
  recurring: Array<ProjectBackupRow & { categoryId: number; accountId?: number | null }>;
  voucherSettings?: {
    prefix: string;
    startNumber: number;
    endNumber: number;
    nextNumber: number;
  } | null;
  chartOfAccounts?: Array<Record<string, unknown>>;
  vouchers?: Array<{ id: number } & Record<string, unknown>>;
  voucherDebits?: Array<Record<string, unknown>>;
  voucherCredits?: Array<Record<string, unknown>>;
  ledgerEntries?: Array<Record<string, unknown>>;
  journalEntries?: Array<Record<string, unknown>>;
  journalLines?: Array<Record<string, unknown>>;
  formatVersion?: string;
};

function backupDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value ?? ""));
}

function backupText(value: unknown): string {
  return value == null ? "" : String(value);
}

function backupNullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function backupNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function assertBackupReferences(backup: ProjectBackupLike) {
  for (const [rows, label] of [
    [backup.accounts, "অ্যাকাউন্ট"],
    [backup.categories, "ক্যাটাগরি"],
    [backup.dues, "দেনা/পাওনা"],
    [backup.recurring, "পুনরাবৃত্ত লেনদেন"],
  ] as const) {
    assertUniqueBackupIds(rows, label);
  }
  const accountIds = new Set(backup.accounts.map(row => row.id));
  const categoryIds = new Set(backup.categories.map(row => row.id));
  const dueIds = new Set(backup.dues.map(row => row.id));
  const ensureAccount = (id: number | null | undefined) => {
    if (id !== null && id !== undefined && !accountIds.has(id))
      throw new Error("ব্যাকআপের একটি অ্যাকাউন্ট রেফারেন্স সঠিক নয়");
  };
  const ensureCategory = (id: number) => {
    if (!categoryIds.has(id))
      throw new Error("ব্যাকআপের একটি ক্যাটাগরি রেফারেন্স সঠিক নয়");
  };
  backup.transactions.forEach(row => {
    ensureCategory(row.categoryId);
    ensureAccount(row.accountId);
  });
  backup.budgets.forEach(row => ensureCategory(row.categoryId));
  backup.settlements.forEach(row => {
    if (!dueIds.has(row.dueId))
      throw new Error("ব্যাকআপের একটি দেনা/পাওনা সমন্বয় রেফারেন্স সঠিক নয়");
    ensureAccount(row.accountId);
  });
  backup.recurring.forEach(row => {
    ensureCategory(row.categoryId);
    ensureAccount(row.accountId);
  });
}

export function previewProjectBackup(backup: ProjectBackupLike) {
  assertBackupReferences(backup);
  const transactionDates = backup.transactions
    .map(row => new Date(row.occurredAt).getTime())
    .filter(Number.isFinite);
  return {
    sourceProjectName: backup.project.name,
    exportedAt: backup.exportedAt,
    counts: {
      accounts: backup.accounts.length,
      categories: backup.categories.length,
      transactions: backup.transactions.length,
      budgets: backup.budgets.length,
      bills: backup.bills.length,
      dues: backup.dues.length,
      settlements: backup.settlements.length,
      recurring: backup.recurring.length,
      chartOfAccounts: backup.chartOfAccounts?.length ?? 0,
      vouchers: backup.vouchers?.length ?? 0,
      voucherDebits: backup.voucherDebits?.length ?? 0,
      voucherCredits: backup.voucherCredits?.length ?? 0,
      ledgerEntries: backup.ledgerEntries?.length ?? 0,
      journalEntries: backup.journalEntries?.length ?? 0,
      journalLines: backup.journalLines?.length ?? 0,
    },
    transactionDateRange: transactionDates.length
      ? {
          from: new Date(Math.min(...transactionDates)),
          to: new Date(Math.max(...transactionDates)),
        }
      : null,
    restorationPolicy:
      "নতুন প্রজেক্টে পুনরুদ্ধার হবে; বিদ্যমান কোনো হিসাব মুছে বা প্রতিস্থাপন হবে না।",
  };
}

export async function restoreProjectBackup(
  userId: number,
  input: { projectName: string; backup: ProjectBackupLike }
) {
  const db = databaseRequired(await getDb());
  assertBackupReferences(input.backup);
  const [existing] = await db
    .select({ id: financeProjects.id })
    .from(financeProjects)
    .where(
      and(
        eq(financeProjects.userId, userId),
        eq(financeProjects.name, input.projectName)
      )
    )
    .limit(1);
  if (existing)
    throw new Error(
      "এই নামে একটি প্রজেক্ট ইতিমধ্যে আছে; পুনরুদ্ধারের জন্য আলাদা নাম দিন"
    );
  const projectId = await db.transaction(async tx => {
    const projectResult = await tx
      .insert(financeProjects)
      .values({ userId, name: input.projectName })
      .execute();
    const restoredProjectId = Number(projectResult[0].insertId);
    const accountMap = new Map<number, number>();
    const categoryMap = new Map<number, number>();
    const dueMap = new Map<number, number>();
    const coaMap = new Map<number, number>();
    const voucherMap = new Map<number, number>();
    const journalMap = new Map<number, number>();

    for (const row of input.backup.accounts) {
      const result = await tx
        .insert(financeAccounts)
        .values({
          userId,
          projectId: restoredProjectId,
          name: backupText(row.name),
          type: row.type as "cash" | "bank" | "mobile",
          openingBalance: String(row.openingBalance ?? "0"),
          currentBalance: String(row.currentBalance ?? "0"),
        })
        .execute();
      accountMap.set(row.id, Number(result[0].insertId));
    }
    for (const row of input.backup.categories) {
      const result = await tx
        .insert(financeCategories)
        .values({
          userId,
          projectId: restoredProjectId,
          name: backupText(row.name),
          type: row.type as "income" | "expense",
          isDefault: Boolean(row.isDefault),
        })
        .execute();
      categoryMap.set(row.id, Number(result[0].insertId));
    }
    if (input.backup.voucherSettings) {
      const row = input.backup.voucherSettings;
      await tx
        .insert(financeVoucherSettings)
        .values({
          userId,
          projectId: restoredProjectId,
          prefix: row.prefix,
          startNumber: row.startNumber,
          endNumber: row.endNumber,
          nextNumber: row.nextNumber,
        })
        .execute();
    } else {
      await tx
        .insert(financeVoucherSettings)
        .values({ userId, projectId: restoredProjectId })
        .execute();
    }
    for (const row of input.backup.recurring) {
      await tx
        .insert(financeRecurringTransactions)
        .values({
          userId,
          projectId: restoredProjectId,
          accountId:
            row.accountId == null ? null : accountMap.get(row.accountId)!,
          categoryId: categoryMap.get(row.categoryId!)!,
          type: row.type as "income" | "expense",
          amount: String(row.amount ?? "0"),
          paymentMethod: backupText(row.paymentMethod),
          note: backupNullableText(row.note),
          frequency: row.frequency as "weekly" | "monthly",
          scheduleDay: backupNumber(row.scheduleDay, 1),
          nextRunAt: backupDate(row.nextRunAt),
          lastGeneratedAt: row.lastGeneratedAt == null ? null : backupDate(row.lastGeneratedAt),
          isActive: false,
          scheduleCronTaskUid: null,
        })
        .execute();
    }
    for (const row of input.backup.transactions) {
      await tx
        .insert(financeTransactions)
        .values({
          userId,
          projectId: restoredProjectId,
          accountId:
            row.accountId == null ? null : accountMap.get(row.accountId)!,
          categoryId: categoryMap.get(row.categoryId!)!,
          type: row.type as "income" | "expense",
          amount: String(row.amount ?? "0"),
          voucherNo: backupNullableText(row.voucherNo),
          reason: backupNullableText(row.reason),
          paymentMethod: backupText(row.paymentMethod),
          note: backupNullableText(row.note),
          occurredAt: backupDate(row.occurredAt),
        })
        .execute();
    }
    for (const row of input.backup.budgets) {
      await tx
        .insert(financeBudgets)
        .values({
          userId,
          projectId: restoredProjectId,
          categoryId: categoryMap.get(row.categoryId!)!,
          monthKey: backupText(row.monthKey),
          amount: String(row.amount ?? "0"),
        })
        .execute();
    }
    for (const row of input.backup.bills) {
      await tx
        .insert(financeBills)
        .values({
          userId,
          projectId: restoredProjectId,
          title: backupText(row.title),
          amount: String(row.amount ?? "0"),
          dueAt: backupDate(row.dueAt),
          isPaid: Boolean(row.isPaid),
          reminderDaysBefore: backupNumber(row.reminderDaysBefore, 3),
          lastReminderAt: row.lastReminderAt == null ? null : backupDate(row.lastReminderAt),
          scheduleCronTaskUid: null,
        })
        .execute();
    }
    for (const row of input.backup.dues) {
      const result = await tx
        .insert(financeDues)
        .values({
          userId,
          projectId: restoredProjectId,
          type: row.type as "debt" | "receivable",
          counterparty: backupText(row.counterparty),
          originalAmount: String(row.originalAmount ?? "0"),
          outstandingAmount: String(row.outstandingAmount ?? "0"),
          voucherNo: backupNullableText(row.voucherNo),
          reason: backupNullableText(row.reason),
          note: backupNullableText(row.note),
          openedAt: backupDate(row.openedAt),
          dueAt: row.dueAt == null ? null : backupDate(row.dueAt),
        })
        .execute();
      dueMap.set(row.id, Number(result[0].insertId));
    }
    for (const row of input.backup.settlements) {
      await tx
        .insert(financeDueSettlements)
        .values({
          userId,
          projectId: restoredProjectId,
          dueId: dueMap.get(row.dueId!)!,
          accountId:
            row.accountId == null ? null : accountMap.get(row.accountId)!,
          amount: String(row.amount ?? "0"),
          voucherNo: backupNullableText(row.voucherNo),
          note: backupNullableText(row.note),
          occurredAt: backupDate(row.occurredAt),
        })
        .execute();
    }

    // ── Double-entry books (v2 backups) ──────────────────────────────────
    // Insert parents first, remap FKs to the new project's rows.
    const coaRows = [...(input.backup.chartOfAccounts ?? [])].sort(
      (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.code).localeCompare(String(b.code))
    );
    for (const row of coaRows) {
      const result = await tx
        .insert(financeChartOfAccounts)
        .values({
          userId,
          projectId: restoredProjectId,
          accountTypeId: Number(row.accountTypeId),
          parentId: row.parentId == null ? null : coaMap.get(Number(row.parentId)) ?? null,
          code: String(row.code),
          name: String(row.name),
          nameBn: row.nameBn == null ? null : String(row.nameBn),
          description: row.description == null ? null : String(row.description),
          isActive: row.isActive !== false,
          isDetail: row.isDetail !== false,
          openingBalance: String(row.openingBalance ?? "0.00"),
          currentBalance: String(row.currentBalance ?? "0.00"),
          sortOrder: Number(row.sortOrder ?? 0),
        })
        .execute();
      if (row.id != null) coaMap.set(Number(row.id), Number(result[0].insertId));
    }

    for (const row of input.backup.vouchers ?? []) {
      const result = await tx
        .insert(financeVouchers)
        .values({
          userId,
          projectId: restoredProjectId,
          voucherNo: backupText(row.voucherNo),
          date: backupDate(row.date),
          narration: backupNullableText(row.narration),
          totalDebit: String(row.totalDebit ?? "0.00"),
          totalCredit: String(row.totalCredit ?? "0.00"),
          status: (row.status as "draft" | "submitted" | "approved" | "posted" | "reversed") ?? "draft",
          voucherType: backupText(row.voucherType) || "general",
          fiscalPeriodId: null,
          submittedBy: null,
          submittedAt: null,
          approvedBy: null,
          approvedAt: null,
          postedBy: null,
          postedAt: null,
          reversedBy: null,
          reversedAt: null,
          reversalReference: backupNullableText(row.reversalReference),
          isArchived: Boolean(row.isArchived),
        })
        .execute();
      if (row.id != null) voucherMap.set(Number(row.id), Number(result[0].insertId));
    }

    for (const row of input.backup.voucherDebits ?? []) {
      await tx
        .insert(financeVoucherDebits)
        .values({
          voucherId: voucherMap.get(Number(row.voucherId))!,
          accountId: accountMap.get(Number(row.accountId))!,
          amount: String(row.amount),
          narration: row.narration == null ? null : String(row.narration),
          sortOrder: Number(row.sortOrder ?? 0),
        })
        .execute();
    }
    for (const row of input.backup.voucherCredits ?? []) {
      await tx
        .insert(financeVoucherCredits)
        .values({
          voucherId: voucherMap.get(Number(row.voucherId))!,
          accountId: accountMap.get(Number(row.accountId))!,
          amount: String(row.amount),
          narration: row.narration == null ? null : String(row.narration),
          sortOrder: Number(row.sortOrder ?? 0),
        })
        .execute();
    }
    for (const row of input.backup.ledgerEntries ?? []) {
      await tx
        .insert(financeLedgerEntries)
        .values({
          voucherId: voucherMap.get(Number(row.voucherId))!,
          accountId: accountMap.get(Number(row.accountId))!,
          entryType: (row.entryType as "debit" | "credit") ?? "debit",
          amount: String(row.amount ?? "0"),
          runningBalance: String(row.runningBalance ?? "0.00"),
          postedAt: row.postedAt == null ? undefined : backupDate(row.postedAt),
        })
        .execute();
    }

    for (const row of input.backup.journalEntries ?? []) {
      const result = await tx
        .insert(financeJournalEntries)
        .values({
          voucherId: voucherMap.get(Number(row.voucherId))!,
          projectId: restoredProjectId,
          journalNo: backupText(row.journalNo),
          date: backupDate(row.date),
          narration: backupNullableText(row.narration),
          totalDebit: String(row.totalDebit ?? "0.00"),
          totalCredit: String(row.totalCredit ?? "0.00"),
          status: (row.status as "draft" | "posted" | "reversed") ?? "draft",
          postedBy: null,
          postedAt: row.postedAt == null ? null : backupDate(row.postedAt),
        })
        .execute();
      if (row.id != null) journalMap.set(Number(row.id), Number(result[0].insertId));
    }
    for (const row of input.backup.journalLines ?? []) {
      await tx
        .insert(financeJournalLines)
        .values({
          journalEntryId: journalMap.get(Number(row.journalEntryId))!,
          accountId: coaMap.get(Number(row.accountId))!,
          entryType: (row.entryType as "debit" | "credit") ?? "debit",
          amount: String(row.amount),
          narration: row.narration == null ? null : String(row.narration),
          sortOrder: Number(row.sortOrder ?? 0),
        })
        .execute();
    }

    return restoredProjectId;
  });
  await logAudit({
    actorUserId: userId,
    projectId,
    action: "backup_restored",
    entityType: "project_restore",
    entityId: projectId,
    summary: `Project restored safely from backup: ${input.projectName}`,
  });
  return { projectId };
}

export type AuditLogFilters = {
  from?: Date;
  to?: Date;
  actorUserId?: number;
  actorRole?: "admin" | "user";
  search?: string;
};

function auditLogPredicates(filters: AuditLogFilters) {
  const keyword = filters.search?.trim();
  const searchPattern = keyword
    ? `%${keyword.replace(/[\\%_]/g, "\\$&")}%`
    : undefined;
  return [
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
    filters.actorUserId
      ? eq(auditLogs.actorUserId, filters.actorUserId)
      : undefined,
    filters.actorRole ? eq(users.role, filters.actorRole) : undefined,
    searchPattern
      ? or(
          like(auditLogs.summary, searchPattern),
          like(auditLogs.entityType, searchPattern),
          like(auditLogs.action, searchPattern)
        )
      : undefined,
  ].filter((predicate): predicate is NonNullable<typeof predicate> =>
    Boolean(predicate)
  );
}

export type AuditLogPageInput = AuditLogFilters & {
  page: number;
  pageSize: number;
};

export async function listAuditLogsPage({
  page,
  pageSize,
  ...filters
}: AuditLogPageInput) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  const [logs, totalRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        actorRole: auditLogs.actorRole,
        actorName: users.name,
        projectId: auditLogs.projectId,
        projectName: financeProjects.name,
        oldData: auditLogs.oldData,
        newData: auditLogs.newData,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        requestId: auditLogs.requestId,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .leftJoin(financeProjects, eq(auditLogs.projectId, financeProjects.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`count(*)` })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);
  return {
    logs,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listAuditLogsForExport(filters: AuditLogFilters = {}) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      summary: auditLogs.summary,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorRole: auditLogs.actorRole,
      actorName: users.name,
      projectId: auditLogs.projectId,
      projectName: financeProjects.name,
      oldData: auditLogs.oldData,
      newData: auditLogs.newData,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      requestId: auditLogs.requestId,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .leftJoin(financeProjects, eq(auditLogs.projectId, financeProjects.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt));
}

export async function getAuditLogActivity(filters: AuditLogFilters = {}) {
  const db = databaseRequired(await getDb());
  const predicates = auditLogPredicates(filters);
  const where = predicates.length ? and(...predicates) : undefined;
  const activityCount = sql<number>`count(*)`;
  return db
    .select({ action: auditLogs.action, count: activityCount })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .where(where)
    .groupBy(auditLogs.action)
    .orderBy(desc(activityCount));
}

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  return listAuditLogsPage({ ...filters, page: 1, pageSize: 250 }).then(
    result => result.logs
  );
}

export async function listUsersForAdmin() {
  const db = databaseRequired(await getDb());
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      loginMethod: users.loginMethod,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // Attach RBAC roles (user_roles → roles) for admin UI / role management.
  let rbacRolesByUser = new Map<number, string[]>();
  try {
    const roleRows = await db
      .select({
        userId: userRoles.userId,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id));
    rbacRolesByUser = roleRows.reduce((map, row) => {
      const list = map.get(row.userId) ?? [];
      list.push(row.roleName);
      map.set(row.userId, list);
      return map;
    }, new Map<number, string[]>());
  } catch {
    // RBAC tables may not exist yet during migration
  }

  return rows.map(row => ({
    ...row,
    rbacRoles: rbacRolesByUser.get(row.id) ?? [],
  }));
}

export async function listProjectsForAdmin() {
  const db = databaseRequired(await getDb());
  return db
    .select({
      id: financeProjects.id,
      name: financeProjects.name,
      userId: financeProjects.userId,
      ownerName: users.name,
      ownerEmail: users.email,
      createdAt: financeProjects.createdAt,
    })
    .from(financeProjects)
    .leftJoin(users, eq(financeProjects.userId, users.id))
    .orderBy(desc(financeProjects.createdAt));
}

export type CreateInvoiceInput = {
  projectId: number;
  invoiceNumber?: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientBinTin?: string;
  issueDate: Date;
  dueDate: Date;
  discountAmount?: number;
  notesTerms?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate?: number;
  }>;
};

async function generateNextInvoiceNumber(
  tx: DbTx,
  projectId: number
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `INV-${currentYear}-`;

  // Pessimistically lock project row to serialize invoice number generation
  await tx
    .select({ id: financeProjects.id })
    .from(financeProjects)
    .where(eq(financeProjects.id, projectId))
    .limit(1)
    .for("update");

  const matchingInvoices = await tx
    .select({ invoiceNumber: financeInvoices.invoiceNumber })
    .from(financeInvoices)
    .where(
      and(
        eq(financeInvoices.projectId, projectId),
        like(financeInvoices.invoiceNumber, `${prefix}%`)
      )
    );

  let maxSeq = 0;
  for (const inv of matchingInvoices) {
    const parts = (inv.invoiceNumber || "").split("-");
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num) && num > maxSeq) {
      maxSeq = num;
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function createInvoice(userId: number, input: CreateInvoiceInput) {
  await assertOwnedProject(userId, input.projectId);
  if (!input.clientName.trim()) throw new Error("গ্রাহকের নাম প্রদান করুন");
  if (!input.items || input.items.length === 0)
    throw new Error("অন্তত একটি আইটেম যোগ করুন");

  const db = databaseRequired(await getDb());

  let subtotal = 0;
  let vatAmount = 0;

  const processedItems = input.items.map(item => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const vatRate = Number(item.vatRate) || 0;
    const itemTotal = qty * price;
    const itemVat = itemTotal * (vatRate / 100);

    subtotal += itemTotal;
    vatAmount += itemVat;

    return {
      description: item.description.trim() || "Item",
      quantity: decimal(qty),
      unitPrice: decimal(price),
      vatRate: decimal(vatRate),
      total: decimal(itemTotal),
    };
  });

  const discount = Math.max(0, Number(input.discountAmount) || 0);
  const grandTotal = Math.max(0, subtotal + vatAmount - discount);

  const { invoiceId, finalInvoiceNumber } = await db.transaction(async tx => {
    let invNumber = input.invoiceNumber?.trim();
    if (!invNumber) {
      invNumber = await generateNextInvoiceNumber(tx, input.projectId);
    }

    const result = await tx.insert(financeInvoices).values({
      userId,
      projectId: input.projectId,
      invoiceNumber: invNumber,
      clientName: input.clientName.trim(),
      clientPhone: input.clientPhone?.trim() || null,
      clientEmail: input.clientEmail?.trim() || null,
      clientAddress: input.clientAddress?.trim() || null,
      clientBinTin: input.clientBinTin?.trim() || null,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      subtotal: decimal(subtotal),
      discountAmount: decimal(discount),
      vatAmount: decimal(vatAmount),
      grandTotal: decimal(grandTotal),
      paidAmount: "0.00",
      status: "unpaid",
      notesTerms: input.notesTerms?.trim() || null,
    });

    const invId = Number(result[0].insertId);

    if (processedItems.length > 0) {
      await tx.insert(financeInvoiceItems).values(
        processedItems.map(item => ({
          invoiceId: invId,
          ...item,
        }))
      );
    }

    return { invoiceId: invId, finalInvoiceNumber: invNumber };
  });

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Invoice created: ${finalInvoiceNumber} for ${input.clientName} (৳${grandTotal.toFixed(2)})`,
  });

  return getInvoiceById(userId, input.projectId, invoiceId);
}

export async function listInvoices(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const invoices = await db
    .select()
    .from(financeInvoices)
    .where(
      and(
        eq(financeInvoices.userId, userId),
        eq(financeInvoices.projectId, projectId)
      )
    )
    .orderBy(desc(financeInvoices.issueDate), desc(financeInvoices.id));

  return invoices;
}

export async function getInvoiceById(
  userId: number,
  projectId: number,
  invoiceId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [invoice] = await db
    .select()
    .from(financeInvoices)
    .where(
      and(
        eq(financeInvoices.id, invoiceId),
        eq(financeInvoices.userId, userId),
        eq(financeInvoices.projectId, projectId)
      )
    )
    .limit(1);

  if (!invoice) throw new Error("চালান / ইনভয়েসটি পাওয়া যায়নি");

  const items = await db
    .select()
    .from(financeInvoiceItems)
    .where(eq(financeInvoiceItems.invoiceId, invoiceId))
    .orderBy(asc(financeInvoiceItems.id));

  return {
    ...invoice,
    items,
  };
}

export async function updateInvoiceStatus(
  userId: number,
  projectId: number,
  invoiceId: number,
  input: {
    status:
      "draft" | "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled";
    paidAmount?: number;
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [invoice] = await db
    .select()
    .from(financeInvoices)
    .where(
      and(
        eq(financeInvoices.id, invoiceId),
        eq(financeInvoices.userId, userId),
        eq(financeInvoices.projectId, projectId)
      )
    )
    .limit(1);

  if (!invoice) throw new Error("চালান / ইনভয়েস পাওয়া যায়নি");

  const paidAmount =
    input.paidAmount !== undefined
      ? decimal(input.paidAmount)
      : invoice.paidAmount;

  await db
    .update(financeInvoices)
    .set({
      status: input.status,
      paidAmount,
    })
    .where(eq(financeInvoices.id, invoiceId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Invoice status updated to ${input.status}`,
  });

  return getInvoiceById(userId, projectId, invoiceId);
}

export async function deleteInvoice(
  userId: number,
  projectId: number,
  invoiceId: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [invoice] = await db
    .select()
    .from(financeInvoices)
    .where(
      and(
        eq(financeInvoices.id, invoiceId),
        eq(financeInvoices.userId, userId),
        eq(financeInvoices.projectId, projectId)
      )
    )
    .limit(1);

  if (!invoice) throw new Error("চালান / ইনভয়েস পাওয়া যায়নি");

  await db.delete(financeInvoices).where(eq(financeInvoices.id, invoiceId));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Invoice deleted: ${invoice.invoiceNumber}`,
  });

  return { success: true };
}

export async function getFinancialStatements(
  userId: number,
  projectId: number
) {
  await assertOwnedProject(userId, projectId);
  const overview = await getOverview(userId, projectId);
  const { generateDoubleEntryStatements } =
    await import("./doubleEntryAccounting");
  return generateDoubleEntryStatements({
    accounts: overview.accounts,
    transactions: overview.transactions,
    dues: overview.dues,
  });
}

export async function listInventoryItems(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  return db
    .select()
    .from(financeInventoryItems)
    .where(
      and(
        eq(financeInventoryItems.userId, userId),
        eq(financeInventoryItems.projectId, projectId)
      )
    )
    .orderBy(asc(financeInventoryItems.name));
}

export async function createInventoryItem(input: {
  userId: number;
  projectId: number;
  name: string;
  sku?: string;
  category?: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  lowStockThreshold?: number;
  notes?: string;
}) {
  await assertOwnedProject(input.userId, input.projectId);
  const db = databaseRequired(await getDb());

  const result = (await db.insert(financeInventoryItems).values({
    userId: input.userId,
    projectId: input.projectId,
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    category: input.category?.trim() || null,
    unit: input.unit.trim() || "পিস",
    purchasePrice: input.purchasePrice.toFixed(2),
    sellingPrice: input.sellingPrice.toFixed(2),
    currentStock: input.currentStock.toFixed(2),
    lowStockThreshold: (input.lowStockThreshold ?? 5).toFixed(2),
    notes: input.notes?.trim() || null,
  })) as unknown as Array<{ insertId?: number | bigint }> | { insertId?: number | bigint };

  const insertId = Number(
    (Array.isArray(result) ? result[0]?.insertId : result.insertId) || 0
  );

  await logAudit({
    actorUserId: input.userId,
    projectId: input.projectId,
    action: "create",
    entityType: "inventory_item",
    entityId: insertId,
    summary: `Created inventory product: ${input.name} (Stock: ${input.currentStock} ${input.unit})`,
  });

  return { id: insertId, success: true };
}

export async function updateInventoryItem(
  userId: number,
  projectId: number,
  id: number,
  input: {
    name?: string;
    sku?: string;
    category?: string;
    unit?: string;
    purchasePrice?: number;
    sellingPrice?: number;
    currentStock?: number;
    lowStockThreshold?: number;
    notes?: string;
  }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeInventoryItems)
    .where(
      and(
        eq(financeInventoryItems.id, id),
        eq(financeInventoryItems.userId, userId),
        eq(financeInventoryItems.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("ইনভেন্টরি আইটেম পাওয়া যায়নি");

  const updateData: Record<string, string | null> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.sku !== undefined) updateData.sku = input.sku?.trim() || null;
  if (input.category !== undefined)
    updateData.category = input.category?.trim() || null;
  if (input.unit !== undefined) updateData.unit = input.unit.trim() || "পিস";
  if (input.purchasePrice !== undefined)
    updateData.purchasePrice = input.purchasePrice.toFixed(2);
  if (input.sellingPrice !== undefined)
    updateData.sellingPrice = input.sellingPrice.toFixed(2);
  if (input.currentStock !== undefined)
    updateData.currentStock = input.currentStock.toFixed(2);
  if (input.lowStockThreshold !== undefined)
    updateData.lowStockThreshold = input.lowStockThreshold.toFixed(2);
  if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

  await db
    .update(financeInventoryItems)
    .set(updateData)
    .where(eq(financeInventoryItems.id, id));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "inventory_item",
    entityId: id,
    summary: `Updated inventory product: ${input.name || existing.name}`,
  });

  return { success: true };
}

export async function adjustInventoryStock(
  userId: number,
  projectId: number,
  id: number,
  quantityChange: number,
  reason: string
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeInventoryItems)
    .where(
      and(
        eq(financeInventoryItems.id, id),
        eq(financeInventoryItems.userId, userId),
        eq(financeInventoryItems.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("ইনভেন্টরি আইটেম পাওয়া যায়নি");

  const current = Number(existing.currentStock) || 0;
  const nextStock = Math.max(0, current + quantityChange);

  await db
    .update(financeInventoryItems)
    .set({ currentStock: nextStock.toFixed(2) })
    .where(eq(financeInventoryItems.id, id));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "inventory_item",
    entityId: id,
    summary: `Adjusted stock for ${existing.name}: ${quantityChange > 0 ? "+" : ""}${quantityChange} ${existing.unit} (Reason: ${reason}). New Stock: ${nextStock}`,
  });

  return { currentStock: nextStock, success: true };
}

export async function deleteInventoryItem(
  userId: number,
  projectId: number,
  id: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeInventoryItems)
    .where(
      and(
        eq(financeInventoryItems.id, id),
        eq(financeInventoryItems.userId, userId),
        eq(financeInventoryItems.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("ইনভেন্টরি আইটেম পাওয়া যায়নি");

  await db
    .delete(financeInventoryItems)
    .where(eq(financeInventoryItems.id, id));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "inventory_item",
    entityId: id,
    summary: `Deleted inventory product: ${existing.name}`,
  });

  return { success: true };
}

export type CreateEmployeeInput = {
  projectId: number;
  name: string;
  phone?: string;
  email?: string;
  designation?: string;
  department?: string;
  joiningDate?: Date;
  baseSalary: number | string;
  status?: "active" | "inactive" | "terminated";
  paymentMethod?: "cash" | "bank" | "mobile";
  bankAccountDetails?: string;
  notes?: string;
};

export async function getEmployees(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());
  return db
    .select()
    .from(financeEmployees)
    .where(
      and(
        eq(financeEmployees.userId, userId),
        eq(financeEmployees.projectId, projectId)
      )
    )
    .orderBy(asc(financeEmployees.name));
}

export async function createEmployee(
  userId: number,
  input: CreateEmployeeInput
) {
  await assertOwnedProject(userId, input.projectId);
  if (!input.name.trim()) throw new Error("কর্মচারীর নাম প্রদান করুন");
  const db = databaseRequired(await getDb());

  const result = await db.insert(financeEmployees).values({
    userId,
    projectId: input.projectId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    designation: input.designation?.trim() || null,
    department: input.department?.trim() || null,
    joiningDate: input.joiningDate || new Date(),
    baseSalary: decimal(Number(input.baseSalary) || 0),
    status: input.status || "active",
    paymentMethod: input.paymentMethod || "cash",
    bankAccountDetails: input.bankAccountDetails?.trim() || null,
    notes: input.notes?.trim() || null,
  });

  const employeeId = Number(result[0].insertId);

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "employee",
    entityId: employeeId,
    summary: `Added employee profile: ${input.name} (${input.designation || "Staff"}, Salary: ৳${input.baseSalary})`,
  });

  return { id: employeeId, success: true };
}

export async function updateEmployee(
  userId: number,
  projectId: number,
  id: number,
  input: Partial<CreateEmployeeInput>
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeEmployees)
    .where(
      and(
        eq(financeEmployees.id, id),
        eq(financeEmployees.userId, userId),
        eq(financeEmployees.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("কর্মচারীর তথ্য পাওয়া যায়নি");

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.phone !== undefined) updateData.phone = input.phone?.trim() || null;
  if (input.email !== undefined) updateData.email = input.email?.trim() || null;
  if (input.designation !== undefined)
    updateData.designation = input.designation?.trim() || null;
  if (input.department !== undefined)
    updateData.department = input.department?.trim() || null;
  if (input.joiningDate !== undefined)
    updateData.joiningDate = input.joiningDate;
  if (input.baseSalary !== undefined)
    updateData.baseSalary = decimal(Number(input.baseSalary) || 0);
  if (input.status !== undefined) updateData.status = input.status;
  if (input.paymentMethod !== undefined)
    updateData.paymentMethod = input.paymentMethod;
  if (input.bankAccountDetails !== undefined)
    updateData.bankAccountDetails = input.bankAccountDetails?.trim() || null;
  if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

  await db
    .update(financeEmployees)
    .set(updateData)
    .where(eq(financeEmployees.id, id));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "update",
    entityType: "employee",
    entityId: id,
    summary: `Updated employee profile: ${input.name || existing.name}`,
  });

  return { success: true };
}

export async function deleteEmployee(
  userId: number,
  projectId: number,
  id: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const [existing] = await db
    .select()
    .from(financeEmployees)
    .where(
      and(
        eq(financeEmployees.id, id),
        eq(financeEmployees.userId, userId),
        eq(financeEmployees.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("কর্মচারীর তথ্য পাওয়া যায়নি");

  // Salary payments and advances are immutable financial history guarded by
  // RESTRICT foreign keys — refuse the delete with a clear message instead of
  // surfacing a raw database constraint error.
  const [payment] = await db
    .select({ id: financeSalaryPayments.id })
    .from(financeSalaryPayments)
    .where(eq(financeSalaryPayments.employeeId, id))
    .limit(1);
  const [advance] = await db
    .select({ id: financeEmployeeAdvances.id })
    .from(financeEmployeeAdvances)
    .where(eq(financeEmployeeAdvances.employeeId, id))
    .limit(1);
  if (payment || advance) {
    throw new Error(
      "এই কর্মচারীর বেতন বা অগ্রিম রেকর্ড রয়েছে; আর্থিক ইতিহাস সুরক্ষার জন্য মুছে ফেলা যাবে না"
    );
  }

  await db.delete(financeEmployees).where(eq(financeEmployees.id, id));

  await logAudit({
    actorUserId: userId,
    projectId,
    action: "delete",
    entityType: "employee",
    entityId: id,
    summary: `Deleted employee profile: ${existing.name}`,
  });

  return { success: true };
}

export type DisburseSalaryInput = {
  projectId: number;
  employeeId: number;
  monthKey: string; // YYYY-MM
  baseSalary: number | string;
  bonusAmount?: number | string;
  allowanceAmount?: number | string;
  advanceDeduction?: number | string;
  otherDeduction?: number | string;
  paidAmount?: number | string;
  paymentDate?: Date;
  accountId?: number | null;
  notes?: string;
};

export async function getSalaryPayments(
  userId: number,
  projectId: number,
  monthKey?: string
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeSalaryPayments.userId, userId),
    eq(financeSalaryPayments.projectId, projectId),
  ];
  if (monthKey) conditions.push(eq(financeSalaryPayments.monthKey, monthKey));

  const payments = await db
    .select({
      payment: financeSalaryPayments,
      employee: financeEmployees,
    })
    .from(financeSalaryPayments)
    .innerJoin(
      financeEmployees,
      eq(financeSalaryPayments.employeeId, financeEmployees.id)
    )
    .where(and(...conditions))
    .orderBy(desc(financeSalaryPayments.createdAt));

  return payments.map(p => ({
    ...p.payment,
    employeeName: p.employee.name,
    employeeDesignation: p.employee.designation,
    employeePhone: p.employee.phone,
    employeeDepartment: p.employee.department,
  }));
}

export async function disburseSalary(
  userId: number,
  input: DisburseSalaryInput
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const [employee] = await db
    .select()
    .from(financeEmployees)
    .where(
      and(
        eq(financeEmployees.id, input.employeeId),
        eq(financeEmployees.userId, userId),
        eq(financeEmployees.projectId, input.projectId)
      )
    )
    .limit(1);

  if (!employee) throw new Error("কর্মচারী পাওয়া যায়নি");

  const base = Number(input.baseSalary) || Number(employee.baseSalary) || 0;
  const bonus = Math.max(0, Number(input.bonusAmount) || 0);
  const allowance = Math.max(0, Number(input.allowanceAmount) || 0);
  const advanceDed = Math.max(0, Number(input.advanceDeduction) || 0);
  const otherDed = Math.max(0, Number(input.otherDeduction) || 0);

  const netPayable = Math.max(
    0,
    base + bonus + allowance - advanceDed - otherDed
  );
  const paid =
    input.paidAmount !== undefined
      ? Math.max(0, Number(input.paidAmount))
      : netPayable;
  const status: "paid" | "partially_paid" | "pending" =
    paid >= netPayable ? "paid" : paid > 0 ? "partially_paid" : "pending";

  const { voucherNo, insertId } = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);

    // If advance was deducted, update open advance records
    if (advanceDed > 0) {
      const openAdvances = await tx
        .select()
        .from(financeEmployeeAdvances)
        .where(
          and(
            eq(financeEmployeeAdvances.employeeId, input.employeeId),
            eq(financeEmployeeAdvances.status, "open")
          )
        )
        .orderBy(asc(financeEmployeeAdvances.disbursedDate));

      let remainingDed = advanceDed;
      for (const adv of openAdvances) {
        if (remainingDed <= 0) break;
        const advTotal = Number(adv.amount);
        const advRepaid = Number(adv.repaidAmount);
        const advOutstanding = advTotal - advRepaid;

        const toDeduct = Math.min(remainingDed, advOutstanding);
        const newRepaid = advRepaid + toDeduct;
        const newStatus = newRepaid >= advTotal ? "settled" : "open";

        await tx
          .update(financeEmployeeAdvances)
          .set({ repaidAmount: decimal(newRepaid), status: newStatus })
          .where(eq(financeEmployeeAdvances.id, adv.id));

        remainingDed -= toDeduct;
      }
    }

    // Create salary payment record
    const result = await tx
      .insert(financeSalaryPayments)
      .values({
        userId,
        projectId: input.projectId,
        employeeId: input.employeeId,
        monthKey: input.monthKey,
        baseSalary: decimal(base),
        bonusAmount: decimal(bonus),
        allowanceAmount: decimal(allowance),
        advanceDeduction: decimal(advanceDed),
        otherDeduction: decimal(otherDed),
        netPayable: decimal(netPayable),
        paidAmount: decimal(paid),
        paymentDate: input.paymentDate || new Date(),
        accountId: input.accountId || null,
        voucherNo,
        status,
        notes: input.notes?.trim() || null,
      })
      .onDuplicateKeyUpdate({
        set: {
          baseSalary: decimal(base),
          bonusAmount: decimal(bonus),
          allowanceAmount: decimal(allowance),
          advanceDeduction: decimal(advanceDed),
          otherDeduction: decimal(otherDed),
          netPayable: decimal(netPayable),
          paidAmount: decimal(paid),
          paymentDate: input.paymentDate || new Date(),
          accountId: input.accountId || null,
          status,
          notes: input.notes?.trim() || null,
        },
      });

    const paymentInsertId = Number(result[0].insertId || 0);

    // If salary paid > 0 and account specified, adjust account balance and log transaction
    if (paid > 0 && input.accountId) {
      const [salaryCat] = await tx
        .select()
        .from(financeCategories)
        .where(
          and(
            eq(financeCategories.projectId, input.projectId),
            eq(financeCategories.name, "বেতন ও সম্মানী"),
            eq(financeCategories.type, "expense")
          )
        )
        .limit(1);

      let categoryId = salaryCat?.id;
      if (!categoryId) {
        const insertCat = await tx.insert(financeCategories).values({
          userId,
          projectId: input.projectId,
          name: "বেতন ও সম্মানী",
          type: "expense",
          isDefault: false,
        });
        categoryId = Number(insertCat[0].insertId);
      }

      await tx.insert(financeTransactions).values({
        userId,
        projectId: input.projectId,
        accountId: input.accountId,
        categoryId,
        type: "expense",
        amount: decimal(paid),
        voucherNo,
        paymentMethod: "bank",
        note: `বেতন প্রদান (${input.monthKey}): ${employee.name} (${employee.designation || "Staff"})`,
        occurredAt: input.paymentDate || new Date(),
      });

      await adjustAccountBalance(
        userId,
        input.projectId,
        input.accountId,
        -paid,
        tx
      );
    }

    return { voucherNo, insertId: paymentInsertId };
  });

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "salary_payment",
    entityId: insertId,
    summary: `Processed salary payment for ${employee.name} (${input.monthKey}): ৳${paid} (Net: ৳${netPayable})`,
  });

  return { success: true, voucherNo };
}

export type CreateEmployeeAdvanceInput = {
  projectId: number;
  employeeId: number;
  amount: number | string;
  disbursedDate?: Date;
  accountId?: number | null;
  notes?: string;
};

export async function getEmployeeAdvances(
  userId: number,
  projectId: number,
  employeeId?: number
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeEmployeeAdvances.userId, userId),
    eq(financeEmployeeAdvances.projectId, projectId),
  ];
  if (employeeId)
    conditions.push(eq(financeEmployeeAdvances.employeeId, employeeId));

  const advances = await db
    .select({
      advance: financeEmployeeAdvances,
      employee: financeEmployees,
    })
    .from(financeEmployeeAdvances)
    .innerJoin(
      financeEmployees,
      eq(financeEmployeeAdvances.employeeId, financeEmployees.id)
    )
    .where(and(...conditions))
    .orderBy(desc(financeEmployeeAdvances.disbursedDate));

  return advances.map(a => ({
    ...a.advance,
    employeeName: a.employee.name,
    employeeDesignation: a.employee.designation,
  }));
}

export async function createEmployeeAdvance(
  userId: number,
  input: CreateEmployeeAdvanceInput
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const [employee] = await db
    .select()
    .from(financeEmployees)
    .where(
      and(
        eq(financeEmployees.id, input.employeeId),
        eq(financeEmployees.userId, userId),
        eq(financeEmployees.projectId, input.projectId)
      )
    )
    .limit(1);

  if (!employee) throw new Error("কর্মচারী পাওয়া যায়নি");

  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new Error("অগ্রিমের পরিমাণ সঠিক দিন");

  const { voucherNo, id } = await db.transaction(async tx => {
    const voucherNo = await claimNextVoucher(tx, userId, input.projectId);

    const result = await tx.insert(financeEmployeeAdvances).values({
      userId,
      projectId: input.projectId,
      employeeId: input.employeeId,
      amount: decimal(amount),
      repaidAmount: "0.00",
      disbursedDate: input.disbursedDate || new Date(),
      accountId: input.accountId || null,
      voucherNo,
      status: "open",
      notes: input.notes?.trim() || null,
    });

    const advanceId = Number(result[0].insertId);

    // Adjust linked account if specified atomically
    if (input.accountId) {
      await adjustAccountBalance(
        userId,
        input.projectId,
        input.accountId,
        -amount,
        tx
      );
    }

    return { voucherNo, id: advanceId };
  });

  await logAudit({
    actorUserId: userId,
    projectId: input.projectId,
    action: "create",
    entityType: "employee_advance",
    entityId: id,
    summary: `Disbursed salary advance to ${employee.name}: ৳${amount}`,
  });

  return { id, success: true, voucherNo };
}

export async function getStatementData(
  userId: number,
  input: { projectId: number; categoryId?: number; accountId?: number; type?: "income" | "expense"; from?: Date; to?: Date }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const firmProfile = await getFirmProfile(userId, input.projectId);

  const whereConditions = [
    eq(financeTransactions.projectId, input.projectId),
  ];
  if (input.categoryId) whereConditions.push(eq(financeTransactions.categoryId, input.categoryId));
  if (input.accountId) whereConditions.push(eq(financeTransactions.accountId, input.accountId));
  if (input.type) whereConditions.push(eq(financeTransactions.type, input.type));
  if (input.from) whereConditions.push(gte(financeTransactions.occurredAt, input.from));
  if (input.to) whereConditions.push(lte(financeTransactions.occurredAt, input.to));

  const rows = await db
    .select({
      id: financeTransactions.id,
      projectId: financeTransactions.projectId,
      accountId: financeTransactions.accountId,
      categoryId: financeTransactions.categoryId,
      type: financeTransactions.type,
      amount: financeTransactions.amount,
      voucherNo: financeTransactions.voucherNo,
      reason: financeTransactions.reason,
      paymentMethod: financeTransactions.paymentMethod,
      note: financeTransactions.note,
      occurredAt: financeTransactions.occurredAt,
      createdAt: financeTransactions.createdAt,
      categoryName: financeCategories.name,
      accountName: financeAccounts.name,
    })
    .from(financeTransactions)
    .leftJoin(financeCategories, eq(financeTransactions.categoryId, financeCategories.id))
    .leftJoin(financeAccounts, eq(financeTransactions.accountId, financeAccounts.id))
    .where(and(...whereConditions))
    .orderBy(desc(financeTransactions.occurredAt));

  const project = (await db.select().from(financeProjects).where(eq(financeProjects.id, input.projectId)).limit(1))[0];
  const accounts = await db
    .select({ id: financeAccounts.id, name: financeAccounts.name, type: financeAccounts.type, openingBalance: financeAccounts.openingBalance, currentBalance: financeAccounts.currentBalance })
    .from(financeAccounts)
    .where(eq(financeAccounts.projectId, input.projectId));

  const items = rows.map(r => ({
    ...r,
    amount: r.amount,
    categoryName: r.categoryName ?? "",
    accountName: r.accountName ?? null,
  }));

  const income = items.filter(i => i.type === "income").reduce((s, i) => s + Number(i.amount), 0);
  const expense = items.filter(i => i.type === "expense").reduce((s, i) => s + Number(i.amount), 0);
  const openingBalance = accounts.reduce((s, a) => s + Number(a.openingBalance), 0);
  const closingBalance = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);

  return {
    project: { id: project?.id ?? input.projectId, name: project?.name ?? "" },
    firm: firmProfile,
    items,
    accounts: accounts.map(a => ({ ...a, openingBalance: Number(a.openingBalance), currentBalance: Number(a.currentBalance) })),
    totals: { count: items.length, income, expense, netAmount: income - expense, openingBalance, closingBalance },
  };
}

export async function getVoucherList(
  userId: number,
  projectId: number,
  opts?: { status?: "draft" | "submitted" | "approved" | "posted" | "reversed"; limit?: number }
) {
  await assertOwnedProject(userId, projectId);
  const db = databaseRequired(await getDb());

  const conditions = [
    eq(financeVouchers.userId, userId),
    eq(financeVouchers.projectId, projectId),
  ];
  if (opts?.status) conditions.push(eq(financeVouchers.status, opts.status));

  const vouchers = await db
    .select({
      id: financeVouchers.id,
      voucherNo: financeVouchers.voucherNo,
      date: financeVouchers.date,
      narration: financeVouchers.narration,
      totalDebit: financeVouchers.totalDebit,
      totalCredit: financeVouchers.totalCredit,
      status: financeVouchers.status,
      createdAt: financeVouchers.createdAt,
    })
    .from(financeVouchers)
    .where(and(...conditions))
    .orderBy(desc(financeVouchers.date), desc(financeVouchers.id))
    .limit(opts?.limit ?? 100);

  // Get reversal info for each voucher
  const voucherIds = vouchers.map(v => v.id);
  const reversalsMap = new Map<number, { reversalVoucherId: number; reversalVoucherNo: string }>();
  if (voucherIds.length > 0) {
    const reversals = await db
      .select({
        originalVoucherId: financeVoucherReversals.originalVoucherId,
        reversalVoucherId: financeVoucherReversals.reversalVoucherId,
      })
      .from(financeVoucherReversals)
      .where(
        and(
          eq(financeVoucherReversals.projectId, projectId),
          sql`${financeVoucherReversals.originalVoucherId} IN (${voucherIds.join(",")})`
        )
      );
    for (const r of reversals) {
      const [revVoucher] = await db
        .select({ voucherNo: financeVouchers.voucherNo })
        .from(financeVouchers)
        .where(eq(financeVouchers.id, r.reversalVoucherId))
        .limit(1);
      if (revVoucher) {
        reversalsMap.set(r.originalVoucherId, { reversalVoucherId: r.reversalVoucherId, reversalVoucherNo: revVoucher.voucherNo });
      }
    }
  }

  return vouchers.map(v => ({
    ...v,
    totalDebit: Number(v.totalDebit),
    totalCredit: Number(v.totalCredit),
    reversal: reversalsMap.get(v.id) ?? null,
  }));
}

export async function getVoucherPrintData(
  userId: number,
  input: { projectId: number; transactionId: number }
) {
  await assertOwnedProject(userId, input.projectId);
  const db = databaseRequired(await getDb());

  const firmProfile = await getFirmProfile(userId, input.projectId);

  const row = await db
    .select({
      id: financeTransactions.id,
      projectId: financeTransactions.projectId,
      accountId: financeTransactions.accountId,
      categoryId: financeTransactions.categoryId,
      type: financeTransactions.type,
      amount: financeTransactions.amount,
      voucherNo: financeTransactions.voucherNo,
      reason: financeTransactions.reason,
      paymentMethod: financeTransactions.paymentMethod,
      note: financeTransactions.note,
      occurredAt: financeTransactions.occurredAt,
      createdAt: financeTransactions.createdAt,
      categoryName: financeCategories.name,
      accountName: financeAccounts.name,
    })
    .from(financeTransactions)
    .leftJoin(financeCategories, eq(financeTransactions.categoryId, financeCategories.id))
    .leftJoin(financeAccounts, eq(financeTransactions.accountId, financeAccounts.id))
    .where(and(eq(financeTransactions.id, input.transactionId), eq(financeTransactions.projectId, input.projectId)))
    .limit(1);

  const project = (await db.select().from(financeProjects).where(eq(financeProjects.id, input.projectId)).limit(1))[0];
  const tx = row[0];

  return {
    project: { id: project?.id ?? input.projectId, name: project?.name ?? "" },
    firm: firmProfile,
    transaction: {
      ...tx!,
      amount: tx!.amount,
      categoryName: tx!.categoryName ?? "",
      accountName: tx!.accountName ?? null,
    },
  };
}

const firmProfileCache = new Map<string, { name: string; tagline: string; phone: string; email: string; address: string }>();

function firmProfileKey(userId: number, projectId: number) {
  return `${userId}:${projectId}`;
}

export async function getFirmProfile(userId: number, projectId: number) {
  await assertOwnedProject(userId, projectId);
  return firmProfileCache.get(firmProfileKey(userId, projectId)) ?? { name: "", tagline: "", phone: "", email: "", address: "" };
}

export async function saveFirmProfile(
  userId: number,
  projectId: number,
  input: { name?: string; tagline?: string; phone?: string; email?: string; address?: string }
) {
  await assertOwnedProject(userId, projectId);
  const existing = firmProfileCache.get(firmProfileKey(userId, projectId)) ?? { name: "", tagline: "", phone: "", email: "", address: "" };
  const updated = {
    name: input.name ?? existing.name,
    tagline: input.tagline ?? existing.tagline,
    phone: input.phone ?? existing.phone,
    email: input.email ?? existing.email,
    address: input.address ?? existing.address,
  };
  firmProfileCache.set(firmProfileKey(userId, projectId), updated);
  return updated;
}
