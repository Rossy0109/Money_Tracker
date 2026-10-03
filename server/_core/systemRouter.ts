import { z } from "zod";
import { runHealthChecks } from "../healthChecks";
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
});
