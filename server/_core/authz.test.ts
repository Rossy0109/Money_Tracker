import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  requireAllPermissions,
  requireAllResourcePermissions,
  requireAnyPermission,
  requireAnyResourcePermission,
  requireAnyRole,
  requirePermission,
  requireResourcePermission,
  requireRole,
} from "./authz";
import type { TrpcContext } from "./context";

const anonymousCtx = { user: null } as unknown as TrpcContext;
const next = async () => ({ ok: true }) as never;

async function expectUnauthorized(
  run: Promise<unknown>,
  message = "Authentication required"
) {
  const err = await run.catch(e => e);
  expect(err).toBeInstanceOf(TRPCError);
  expect((err as TRPCError).code).toBe("UNAUTHORIZED");
  expect((err as Error).message).toBe(message);
}

describe("authz middlewares without a user", () => {
  it("requirePermission rejects anonymous callers", async () => {
    await expectUnauthorized(
      requirePermission("voucher.create")({ ctx: anonymousCtx, next })
    );
  });

  it("requireAnyPermission rejects anonymous callers", async () => {
    await expectUnauthorized(
      requireAnyPermission(["a.read", "b.read"])({
        ctx: anonymousCtx,
        next,
      })
    );
  });

  it("requireAllPermissions rejects anonymous callers", async () => {
    await expectUnauthorized(
      requireAllPermissions(["a.read", "b.read"])({
        ctx: anonymousCtx,
        next,
      })
    );
  });

  it("requireRole rejects anonymous callers", async () => {
    await expectUnauthorized(
      requireRole("VIEWER")({ ctx: anonymousCtx, next })
    );
  });

  it("requireAnyRole rejects anonymous callers", async () => {
    await expectUnauthorized(
      requireAnyRole(["VIEWER", "MANAGER"])({ ctx: anonymousCtx, next })
    );
  });
});

describe("resource permission mappers", () => {
  it("builds resource.action middlewares that guard anonymous callers", async () => {
    await expectUnauthorized(
      requireResourcePermission("voucher", "create")({
        ctx: anonymousCtx,
        next,
      })
    );
    await expectUnauthorized(
      requireAnyResourcePermission("voucher", ["create", "read"])({
        ctx: anonymousCtx,
        next,
      })
    );
    await expectUnauthorized(
      requireAllResourcePermissions("budget", ["read", "create"])({
        ctx: anonymousCtx,
        next,
      })
    );
  });
});
