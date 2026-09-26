import { describe, expect, it } from "vitest";

// Authorization and isolation mock model
export interface MockUser {
  id: number;
  openId: string;
  /** Legacy display-only column — never grants privilege on its own. */
  role: "admin" | "user";
  /** Authoritative RBAC roles. */
  rbacRoles: string[];
  status: "active" | "pending" | "suspended";
}

export interface MockProject {
  id: number;
  userId: number;
  name: string;
}

export interface MockHousehold {
  id: number;
  ownerUserId: number;
  name: string;
  members: Array<{ userId: number; role: "owner" | "member" | "viewer" }>;
}

export function authorizeProjectAccess(
  user: MockUser,
  project: MockProject
): boolean {
  if (user.status !== "active") return false;
  return project.userId === user.id;
}

const ADMIN_RBAC_ROLES = new Set(["SUPER_ADMIN", "SYSTEM_ADMIN"]);

export function authorizeAdminAction(user: MockUser): boolean {
  if (user.status !== "active") return false;
  // RBAC is authoritative; legacy users.role must not grant admin privilege.
  return user.rbacRoles.some(r => ADMIN_RBAC_ROLES.has(r));
}

export function authorizeHouseholdAccess(
  user: MockUser,
  household: MockHousehold,
  requiredRole: "owner" | "member" | "viewer" = "viewer"
): boolean {
  if (user.status !== "active") return false;
  if (household.ownerUserId === user.id) return true;

  const membership = household.members.find(m => m.userId === user.id);
  if (!membership) return false;

  const roleHierarchy: Record<"owner" | "member" | "viewer", number> = {
    owner: 3,
    member: 2,
    viewer: 1,
  };

  return roleHierarchy[membership.role] >= roleHierarchy[requiredRole];
}

describe("server/authorization.test.ts - User Isolation, Admin Checks, Permissions, Household Members", () => {
  const userA: MockUser = {
    id: 101,
    openId: "usr_a",
    role: "user",
    rbacRoles: ["VIEWER"],
    status: "active",
  };
  const userB: MockUser = {
    id: 102,
    openId: "usr_b",
    role: "user",
    rbacRoles: ["VIEWER"],
    status: "active",
  };
  const adminUser: MockUser = {
    id: 1,
    openId: "adm_1",
    role: "admin",
    rbacRoles: ["SUPER_ADMIN"],
    status: "active",
  };
  const suspendedUser: MockUser = {
    id: 103,
    openId: "usr_s",
    role: "user",
    rbacRoles: ["VIEWER"],
    status: "suspended",
  };
  const legacyAdminOnly: MockUser = {
    id: 2,
    openId: "legacy_admin",
    role: "admin",
    rbacRoles: [],
    status: "active",
  };

  const projectA: MockProject = {
    id: 10,
    userId: userA.id,
    name: "ব্যক্তিগত খরচ",
  };
  const projectB: MockProject = {
    id: 20,
    userId: userB.id,
    name: "ব্যবসার খাতা",
  };

  describe("User Isolation", () => {
    it("allows users to access their own projects", () => {
      expect(authorizeProjectAccess(userA, projectA)).toBe(true);
      expect(authorizeProjectAccess(userB, projectB)).toBe(true);
    });

    it("strictly forbids cross-tenant access to other users' projects", () => {
      expect(authorizeProjectAccess(userA, projectB)).toBe(false);
      expect(authorizeProjectAccess(userB, projectA)).toBe(false);
    });

    it("blocks suspended users from accessing even their own projects", () => {
      const suspendedProject: MockProject = {
        id: 30,
        userId: suspendedUser.id,
        name: "স্থগিত খাতা",
      };
      expect(authorizeProjectAccess(suspendedUser, suspendedProject)).toBe(
        false
      );
    });
  });

  describe("Admin Checks", () => {
    it("authorizes active RBAC admin users for elevated system actions", () => {
      expect(authorizeAdminAction(adminUser)).toBe(true);
    });

    it("denies regular users from performing administrative actions", () => {
      expect(authorizeAdminAction(userA)).toBe(false);
      expect(authorizeAdminAction(userB)).toBe(false);
    });

    it("denies legacy users.role=admin without an RBAC admin role", () => {
      expect(authorizeAdminAction(legacyAdminOnly)).toBe(false);
    });
  });

  describe("Household Members Access Control", () => {
    const household: MockHousehold = {
      id: 55,
      ownerUserId: userA.id,
      name: "আহমেদ পরিবার",
      members: [
        { userId: userA.id, role: "owner" },
        { userId: userB.id, role: "member" },
      ],
    };

    it("grants owner full access to household records", () => {
      expect(authorizeHouseholdAccess(userA, household, "owner")).toBe(true);
      expect(authorizeHouseholdAccess(userA, household, "member")).toBe(true);
      expect(authorizeHouseholdAccess(userA, household, "viewer")).toBe(true);
    });

    it("allows member to contribute expenses but denies owner-only administrative actions", () => {
      expect(authorizeHouseholdAccess(userB, household, "viewer")).toBe(true);
      expect(authorizeHouseholdAccess(userB, household, "member")).toBe(true);
      expect(authorizeHouseholdAccess(userB, household, "owner")).toBe(false);
    });

    it("denies uninvited or non-member users from viewing or accessing household data", () => {
      const externalUser: MockUser = {
        id: 999,
        openId: "ext",
        role: "user",
        rbacRoles: ["VIEWER"],
        status: "active",
      };
      expect(authorizeHouseholdAccess(externalUser, household, "viewer")).toBe(
        false
      );
      expect(authorizeHouseholdAccess(externalUser, household, "member")).toBe(
        false
      );
    });
  });
});
