import { protectedProcedure, inputOnlyProcedure } from "./trpc";
import { requireResourcePermission, requireAnyResourcePermission } from "./authz";

/**
 * RBAC-enhanced procedure factories.
 * These compose the existing auth-gated base procedures with fine-grained
 * permission checks from the RBAC system.
 *
 * Usage:
 *   finance.overview: protectedWithPermission("accounting", "read")
 *     .input(...)
 *     .query(...)
 */

/** Base procedure + single resource.permission check (AND with existing auth). */
export function protectedWithPermission(resource: string, action: string) {
  return protectedProcedure.use(requireResourcePermission(resource, action));
}

/** inputOnlyProcedure + single resource.permission check. */
export function inputOnlyWithPermission(resource: string, action: string) {
  return inputOnlyProcedure.use(requireResourcePermission(resource, action));
}

/** Base procedure + any-of resource permission check (OR logic). */
export function protectedWithAnyPermission(resource: string, actions: string[]) {
  return protectedProcedure.use(requireAnyResourcePermission(resource, actions));
}

/** inputOnlyProcedure + any-of resource permission check (OR logic). */
export function inputOnlyWithAnyPermission(resource: string, actions: string[]) {
  return inputOnlyProcedure.use(requireAnyResourcePermission(resource, actions));
}
