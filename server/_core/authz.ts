import { TRPCError } from "@trpc/server";
import type { MiddlewareResult } from "@trpc/server/unstable-core-do-not-import";
import { hasPermission } from "./rbac";
import type { TrpcContext } from "./context";

type AuthzMiddleware = (opts: {
  ctx: TrpcContext;
  next: (opts: { ctx: TrpcContext }) => Promise<MiddlewareResult<object>>;
}) => Promise<MiddlewareResult<object>>;

async function auditPermissionDenied(ctx: TrpcContext, permissionOrReason: string) {
  if (!ctx.user) return;
  try {
    const { logAudit } = await import("../db");
    const { extractAuditContext } = await import("./auditContext");
    await logAudit({
      actorUserId: ctx.user.id,
      actorRole: ctx.user.role,
      action: "permission_denied",
      entityType: "rbac_permission",
      summary: `Permission denied: ${permissionOrReason}`,
      auditContext: extractAuditContext(ctx.req),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Middleware to check if user has a specific permission.
 * Throws TRPCError if user doesn't have the permission.
 */
export function requirePermission(permissionName: string) {
  const middleware: AuthzMiddleware = async (opts) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({ 
        code: "UNAUTHORIZED", 
        message: "Authentication required" 
      });
    }
    
    const hasPerm = await hasPermission(ctx.user.id, permissionName);
    if (!hasPerm) {
      await auditPermissionDenied(ctx, permissionName);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `অনুমতি নেই: ${permissionName}` 
      });
    }
    
    return next({ ctx });
  };
  return middleware;
}

/**
 * Middleware to check if user has any of the given permissions (OR logic).
 */
export function requireAnyPermission(permissionNames: string[]) {
  const middleware: AuthzMiddleware = async (opts) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({ 
        code: "UNAUTHORIZED", 
        message: "Authentication required" 
      });
    }
    
    const { hasAnyPermission } = await import("./rbac");
    const hasPerm = await hasAnyPermission(ctx.user.id, permissionNames);
    if (!hasPerm) {
      await auditPermissionDenied(ctx, `any of [${permissionNames.join(", ")}]`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `নিম্নলিখিত অনুমতির যেকোনো একটি থাকতে হবে: ${permissionNames.join(", ")}` 
      });
    }
    
    return next({ ctx });
  };
  return middleware;
}

/**
 * Middleware to check if user has all of the given permissions (AND logic).
 */
export function requireAllPermissions(permissionNames: string[]) {
  const middleware: AuthzMiddleware = async (opts) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({ 
        code: "UNAUTHORIZED", 
        message: "Authentication required" 
      });
    }
    
    const { hasAllPermissions } = await import("./rbac");
    const hasPerm = await hasAllPermissions(ctx.user.id, permissionNames);
    if (!hasPerm) {
      await auditPermissionDenied(ctx, `all of [${permissionNames.join(", ")}]`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `নিম্নলিখিত সব অনুমতির থাকতে হবে: ${permissionNames.join(", ")}` 
      });
    }
    
    return next({ ctx });
  };
  return middleware;
}

/**
 * Middleware to check if user has a specific role.
 */
export function requireRole(roleName: string) {
  const middleware: AuthzMiddleware = async (opts) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({ 
        code: "UNAUTHORIZED", 
        message: "Authentication required" 
      });
    }
    
    const { hasRole } = await import("./rbac");
    const hasRolePerm = await hasRole(ctx.user.id, roleName);
    if (!hasRolePerm) {
      await auditPermissionDenied(ctx, `role:${roleName}`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `ভূমিকা প্রয়োজন: ${roleName}` 
      });
    }
    
    return next({ ctx });
  };
  return middleware;
}

/**
 * Middleware to check if user has any of the given roles (OR logic).
 */
export function requireAnyRole(roleNames: string[]) {
  const middleware: AuthzMiddleware = async (opts) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({ 
        code: "UNAUTHORIZED", 
        message: "Authentication required" 
      });
    }
    
    // For roles, we check if user has any of the roles
    const { getUserRoles } = await import("./rbac");
    const userRoles = await getUserRoles(ctx.user.id);
    const hasRolePerm = roleNames.some(r => userRoles.includes(r));
    
    if (!hasRolePerm) {
      await auditPermissionDenied(ctx, `any role of [${roleNames.join(", ")}]`);
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `নিম্নলিখিত ভূমিকার যেকোনো একটি থাকতে হবে: ${roleNames.join(", ")}` 
      });
    }
    
    return next({ ctx });
  };
  return middleware;
}

/**
 * Helper to create a permission-checking middleware for a specific resource and action.
 * Usage: requireResourcePermission("accounting", "create")
 */
export function requireResourcePermission(resource: string, action: string) {
  return requirePermission(`${resource}.${action}`);
}

/**
 * Helper to create a middleware requiring any of multiple resource permissions.
 * Usage: requireAnyResourcePermission("voucher", ["create", "read"])
 */
export function requireAnyResourcePermission(resource: string, actions: string[]) {
  return requireAnyPermission(actions.map(a => `${resource}.${a}`));
}

/**
 * Helper to create a middleware requiring all resource permissions.
 * Usage: requireAllResourcePermissions("budget", ["read", "create", "update"])
 */
export function requireAllResourcePermissions(resource: string, actions: string[]) {
  return requireAllPermissions(actions.map(a => `${resource}.${a}`));
}