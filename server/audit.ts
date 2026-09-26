import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { auditLogs, financeProjects, users } from "../drizzle/schema";
import { databaseRequired, getDb } from "./_core/dbConnection";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "delete_attempt"
  | "approve"
  | "reject"
  | "post"
  | "reverse"
  | "login"
  | "logout"
  | "login_failed"
  | "permission_denied"
  | "user_suspended"
  | "backup_created"
  | "backup_restored";

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** `openId` of the reserved account that owns system-generated audit rows. */
const SYSTEM_ACTOR_OPEN_ID = "system-actor";

/**
 * Id of the reserved system account used as the audit actor for work that has
 * no signed-in user behind it (RBAC seeding, login attempts for unknown users,
 * scheduled jobs).
 *
 * `audit_logs.actorUserId` is a non-nullable foreign key, so these operations
 * cannot invent an id such as `0` or `1`: on a brand-new database no such user
 * exists and the foreign key rejects the row. Resolving (and creating) the
 * reserved account keeps the audit trail intact and bootable.
 */
export async function systemActorUserId(): Promise<number> {
  const db = databaseRequired(await getDb());
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, SYSTEM_ACTOR_OPEN_ID))
    .limit(1);
  if (existing) return existing.id;

  await db
    .insert(users)
    .values({
      openId: SYSTEM_ACTOR_OPEN_ID,
      name: "System",
      email: null,
      loginMethod: "system",
      role: "admin",
      status: "active",
    })
    .onDuplicateKeyUpdate({ set: { name: "System" } });
  const [created] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, SYSTEM_ACTOR_OPEN_ID))
    .limit(1);
  if (!created) throw new Error("System audit actor could not be provisioned");
  return created.id;
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
  await db.insert(auditLogs).values({
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

export async function deleteAuditLogs(): Promise<never> {
  throw new Error(
    "Audit logs are append-only. They may not be modified or deleted at runtime."
  );
}

export async function updateAuditLogs(): Promise<never> {
  throw new Error(
    "Audit logs are append-only. They may not be modified or deleted at runtime."
  );
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
