export type PrivateObjectScope = "owner" | "household";

export type PrivateObjectAccessRecord = {
  ownerUserId: number;
  projectId: number | null;
  householdId: number | null;
  scope: PrivateObjectScope;
};

export type PrivateObjectAccessContext = {
  userId: number;
  ownsReferencedProject: boolean;
  hasActiveHouseholdMembership: boolean;
};

/**
 * Blob keys are transport identifiers, not access grants. This policy is kept
 * pure so the database lookup and Express route use the same authorization
 * decision and it can be regression-tested without any storage credential.
 */
export function canDownloadPrivateObject(
  object: PrivateObjectAccessRecord,
  context: PrivateObjectAccessContext,
): boolean {
  if (object.scope === "owner") {
    return (
      object.ownerUserId === context.userId &&
      object.projectId !== null &&
      object.householdId === null &&
      context.ownsReferencedProject
    );
  }

  return (
    object.scope === "household" &&
    object.projectId === null &&
    object.householdId !== null &&
    context.hasActiveHouseholdMembership
  );
}
