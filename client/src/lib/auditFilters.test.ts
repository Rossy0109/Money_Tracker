import { describe, expect, it } from "vitest";
import {
  buildAdminAuditFilterInput,
  EMPTY_AUDIT_FILTERS,
} from "./auditFilters";

describe("administrator audit-filter behavior", () => {
  it("converts selected date and user controls into a stable protected query input", () => {
    const input = buildAdminAuditFilterInput("secret", {
      from: new Date("2026-08-01T12:00:00.000Z"),
      to: new Date("2026-08-19T12:00:00.000Z"),
      actorUserId: "17",
      actorRole: "user",
      search: "  transaction  ",
    });

    // Password must never appear on admin GET query inputs.
    expect(input).not.toHaveProperty("password");
    expect(input.from?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(input.to?.toISOString()).toBe("2026-08-19T23:59:59.999Z");
    expect(input.actorUserId).toBe(17);
    expect(input.actorRole).toBe("user");
    expect(input.search).toBe("transaction");
  });

  it("clears all optional query filters and never includes a password fallback", () => {
    expect(buildAdminAuditFilterInput("", EMPTY_AUDIT_FILTERS)).toEqual({
      from: undefined,
      to: undefined,
      actorUserId: undefined,
      actorRole: undefined,
      search: undefined,
    });
    expect(
      buildAdminAuditFilterInput("pending", EMPTY_AUDIT_FILTERS)
    ).not.toHaveProperty("password");
  });
});
