import { describe, expect, it } from "vitest";
import { buildAdminAuditFilterInput, EMPTY_AUDIT_FILTERS } from "./auditFilters";

describe("administrator audit-filter behavior", () => {
  it("converts selected date and user controls into a stable protected query input", () => {
    const input = buildAdminAuditFilterInput("secret", { from: "2026-08-01", to: "2026-08-19", actorUserId: "17" });

    expect(input.password).toBe("secret");
    expect(input.from?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(input.to?.toISOString()).toBe("2026-08-19T23:59:59.999Z");
    expect(input.actorUserId).toBe(17);
  });

  it("clears all optional query filters while retaining the protected fallback password", () => {
    expect(buildAdminAuditFilterInput("", EMPTY_AUDIT_FILTERS)).toEqual({ password: "pending", from: undefined, to: undefined, actorUserId: undefined });
  });
});
