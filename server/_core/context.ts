import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { extractAdminTokenFromRequest, verifyAdminToken, type AdminElevationPayload } from "./adminSession";
import { isAdminRoleUser } from "./rbac";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  adminElevation: AdminElevationPayload | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  let adminElevation: AdminElevationPayload | null = null;
  if (user && await isAdminRoleUser(user.id)) {
    const rawAdminToken = extractAdminTokenFromRequest(opts.req);
    const verified = verifyAdminToken(rawAdminToken);
    if (verified && verified.userId === user.id) {
      adminElevation = verified;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    adminElevation,
  };
}
