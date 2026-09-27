import type { User } from "../drizzle/schema";
import { sdk } from "../server/_core/sdk";
import {
  extractAdminTokenFromRequest,
  verifyAdminToken,
  type AdminElevationPayload,
} from "../server/_core/adminSession";
import { isAdminRoleUser } from "../server/_core/rbac";
import { createShimRequest, type ShimRequest, type ShimResponse } from "./httpShim";

export type WorkerTrpcContext = {
  req: ShimRequest;
  res: ShimResponse;
  user: User | null;
  adminElevation: AdminElevationPayload | null;
};

/**
 * Create a tRPC context from a Fetch Request (for the tRPC fetch adapter).
 *
 * The tRPC fetch adapter provides `{ req: Request, resHeaders: Headers }`.
 * We build an Express-compatible shim from the Fetch Request so all existing
 * authentication, audit, and cookie logic works unchanged.
 */
export async function createWorkerContext(opts: {
  req: Request;
  resHeaders: Headers;
}): Promise<WorkerTrpcContext> {
  const { req: fetchReq, resHeaders } = opts;

  const shimRes = createShimResponse();
  const shimReq = createShimRequest(fetchReq);

  let user: User | null;
  try {
    user = await sdk.authenticateRequest(shimReq as never);
  } catch {
    user = null;
  }

  let adminElevation: AdminElevationPayload | null = null;
  if (user && (await isAdminRoleUser(user.id))) {
    const rawAdminToken = extractAdminTokenFromRequest(shimReq as never);
    const verified = await verifyAdminToken(rawAdminToken);
    if (verified && verified.userId === user.id) {
      adminElevation = verified;
    }
  }

  return {
    req: shimReq,
    res: shimRes,
    user,
    adminElevation,
  };
}
