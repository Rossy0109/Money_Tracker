export type AuditFilterState = { from?: Date; to?: Date; actorUserId: string; actorRole: "all" | "admin" | "user"; search: string };
export const EMPTY_AUDIT_FILTERS: AuditFilterState = { from: undefined, to: undefined, actorUserId: "all", actorRole: "all", search: "" };

function startOfUtcDay(value: Date) { return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)); }
function endOfUtcDay(value: Date) { return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)); }

export function buildAdminAuditFilterInput(_password: string, filters: AuditFilterState) {
  // Password is intentionally NOT included: admin queries authenticate via the
  // elevation cookie only (passwords must never ride on GET query strings).
  return {
    from: filters.from ? startOfUtcDay(filters.from) : undefined,
    to: filters.to ? endOfUtcDay(filters.to) : undefined,
    actorUserId: filters.actorUserId === "all" ? undefined : Number(filters.actorUserId),
    actorRole: filters.actorRole === "all" ? undefined : filters.actorRole,
    search: filters.search.trim() || undefined,
  };
}
