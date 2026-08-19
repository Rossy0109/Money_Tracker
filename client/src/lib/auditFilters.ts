export type AuditFilterState = { from: string; to: string; actorUserId: string };

export const EMPTY_AUDIT_FILTERS: AuditFilterState = { from: "", to: "", actorUserId: "all" };

export function buildAdminAuditFilterInput(password: string, filters: AuditFilterState) {
  return {
    password: password || "pending",
    from: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined,
    actorUserId: filters.actorUserId === "all" ? undefined : Number(filters.actorUserId),
  };
}
