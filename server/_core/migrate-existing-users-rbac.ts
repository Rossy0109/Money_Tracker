import { databaseRequired, getDb, logAudit, systemActorUserId } from "../db";
import { users } from "../../drizzle/schema";
import { assignRole } from "./rbac";

/**
 * One-time migration: assign default RBAC roles to all existing users
 * based on their legacy `role` column. Safe to run multiple times (idempotent).
 */
export async function migrateExistingUsersToRBAC() {
  const db = databaseRequired(await getDb());
  const allUsers = await db.select().from(users);

  let migrated = 0;
  for (const user of allUsers) {
    let rbacRole: string;
    switch (user.role) {
      case "admin":
        rbacRole = "SUPER_ADMIN";
        break;
      case "input_only":
        rbacRole = "INPUT_OPERATOR";
        break;
      case "user":
      default:
        rbacRole = "VIEWER";
        break;
    }

    try {
      const inserted = await assignRole(user.id, rbacRole, user.id);
      if (inserted) migrated++;
    } catch {
      // Skip if already assigned or role doesn't exist yet
    }
  }

  if (migrated > 0) {
    await logAudit({
      actorUserId: await systemActorUserId(),
      action: "create",
      entityType: "rbac_migration",
      summary: `Migrated ${migrated}/${allUsers.length} existing users to RBAC roles`,
    });
  }
}
