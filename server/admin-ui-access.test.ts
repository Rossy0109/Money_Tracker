import { describe, expect, it } from "vitest";
import { canLoadAdminData } from "../client/src/lib/adminAccess";

describe("administrator dialog behavior", () => {
  it("loads the audit, user, and all-projects panels only after in-session admin verification", () => {
    expect(canLoadAdminData({ role: "user", verified: true, password: "verified" })).toBe(false);
    expect(canLoadAdminData({ role: "admin", verified: false, password: "verified" })).toBe(false);
    expect(canLoadAdminData({ role: "admin", verified: true, password: "" })).toBe(false);
    expect(canLoadAdminData({ role: "admin", verified: true, password: "verified" })).toBe(true);
  });
});
