import { z } from "zod";
import { runHealthChecks } from "../healthChecks";
import { getDriveConnection, revokeDriveConnection } from "../backupDb";
import { isDriveConfigured } from "../drive/driveOAuth";
import {
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  /**
   * The report behind the System Health panel.
   *
   * Gated on `settings.view` — the same permission the sidebar entry uses, so
   * the menu can never promise a page the API refuses. The report is built for
   * the caller: Drive connection, pending backups and the project integrity
   * rows are theirs, and the global checks (storage targets, deployment) are
   * configuration, not user data.
   */
  healthReport: protectedProcedure
    .use(permissionProcedure.require("settings.view"))
    .query(({ ctx }) => runHealthChecks(ctx.user!.id)),

  /**
   * Whether Google Drive is configured on the server and whether *this* user
   * has connected their Drive for backups. Scoped to the caller's own row.
   */
  driveStatus: protectedProcedure
    .use(permissionProcedure.require("settings.view"))
    .query(async ({ ctx }) => {
      const connection = await getDriveConnection(ctx.user!.id);
      return {
        configured: isDriveConfigured(),
        connected: Boolean(connection && !connection.revokedAt),
        rootFolderName: connection?.rootFolderName ?? null,
        scope: connection?.scope ?? null,
        connectedAt: connection?.lastVerifiedAt ?? null,
      };
    }),

  /** Revoke the caller's Drive connection and drop the stored tokens. */
  disconnectDrive: protectedProcedure
    .use(permissionProcedure.require("settings.view"))
    .mutation(async ({ ctx }) => {
      await revokeDriveConnection(ctx.user!.id);
      return { ok: true };
    }),
});
