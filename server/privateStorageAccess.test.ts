import { describe, expect, it } from "vitest";
import { canDownloadPrivateObject } from "./privateStorageAccess";

describe("private Blob object access policy", () => {
  it("permits a financial export only to its owner in the referenced project", () => {
    expect(
      canDownloadPrivateObject(
        { ownerUserId: 10, projectId: 42, householdId: null, scope: "owner" },
        { userId: 10, ownsReferencedProject: true, hasActiveHouseholdMembership: false },
      ),
    ).toBe(true);
  });

  it("denies a different tenant even if the opaque Blob key is known", () => {
    expect(
      canDownloadPrivateObject(
        { ownerUserId: 10, projectId: 42, householdId: null, scope: "owner" },
        { userId: 11, ownsReferencedProject: false, hasActiveHouseholdMembership: false },
      ),
    ).toBe(false);
  });

  it("permits an active household member but denies non-members for a household-scoped export", () => {
    const object = { ownerUserId: 10, projectId: null, householdId: 7, scope: "household" as const };

    expect(
      canDownloadPrivateObject(object, {
        userId: 12,
        ownsReferencedProject: false,
        hasActiveHouseholdMembership: true,
      }),
    ).toBe(true);
    expect(
      canDownloadPrivateObject(object, {
        userId: 13,
        ownsReferencedProject: false,
        hasActiveHouseholdMembership: false,
      }),
    ).toBe(false);
  });

  it("fails closed for malformed mixed project and household scope", () => {
    expect(
      canDownloadPrivateObject(
        { ownerUserId: 10, projectId: 42, householdId: 7, scope: "household" },
        { userId: 12, ownsReferencedProject: false, hasActiveHouseholdMembership: true },
      ),
    ).toBe(false);
  });
});
