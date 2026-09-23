import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConnection } from "mysql2/promise";
import { inArray } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { appRouter } from "./routers";
import { seedDefaultRBAC } from "./_core/seed-rbac";
import { assignRole, clearRBACCache, initializeRBAC } from "./_core/rbac";
import { closeDatabaseConnection, getDb } from "./db";
import { INPUT_OPERATOR_PERMISSIONS, ROLE_NAMES } from "../shared/rbac";

type E2eUser = {
  id: number;
  openId: string;
  email: string | null;
  name: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  status: "pending" | "active" | "suspended";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

const OPEN_IDS = ["rbac-input-operator", "rbac-super-admin", "rbac-viewer", "rbac-legacy-admin"] as const;

let inputOperator: E2eUser;
let superAdmin: E2eUser;
let viewer: E2eUser;
let legacyAdmin: E2eUser;

function caller(user: E2eUser) {
  return appRouter.createCaller({
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
    adminElevation: null,
  } as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

function assertIsolatedDatabase() {
  const databaseName = process.env.ISOLATED_E2E_DATABASE_NAME ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseHost = new URL(databaseUrl).hostname;
  if (process.env.ISOLATED_E2E_DATABASE !== "true" || !/^money_tracker_e2e_[a-z0-9_]{8,50}$/.test(databaseName) || !databaseUrl.includes(`/${databaseName}`) || !["127.0.0.1", "localhost"].includes(databaseHost)) {
    throw new Error("এই E2E স্যুট কেবল রানার-তৈরি বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেসে চালানো যাবে");
  }
}

beforeAll(async () => {
  assertIsolatedDatabase();
  const connection = await createConnection(process.env.DATABASE_URL!);
  try {
    const migration = readFileSync(
      fileURLToPath(new URL("../drizzle/0014_rbac_and_idempotency.sql", import.meta.url)),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) {
      await connection.query(statement);
    }
  } finally {
    await connection.end();
  }

  await seedDefaultRBAC();

  const db = await getDb();
  if (!db) throw new Error("বিচ্ছিন্ন পরীক্ষামূলক ডেটাবেস সংযোগ পাওয়া যায়নি");

  await db.insert(users).values([
    { openId: "rbac-input-operator", name: "RBAC Input Operator", email: "input@rbac.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "rbac-super-admin", name: "RBAC Super Admin", email: "super@rbac.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "rbac-viewer", name: "RBAC Viewer", email: "viewer@rbac.test", loginMethod: "e2e", role: "user", status: "active" },
    { openId: "rbac-legacy-admin", name: "RBAC Legacy Admin", email: "legacy@rbac.test", loginMethod: "e2e", role: "admin", status: "active" },
  ]);

  const rows = await db.select().from(users).where(inArray(users.openId, [...OPEN_IDS]));
  const byOpenId = new Map(rows.map(row => [row.openId, row as E2eUser]));
  inputOperator = byOpenId.get("rbac-input-operator")!;
  superAdmin = byOpenId.get("rbac-super-admin")!;
  viewer = byOpenId.get("rbac-viewer")!;
  legacyAdmin = byOpenId.get("rbac-legacy-admin")!;
  if ([inputOperator, superAdmin, viewer, legacyAdmin].some(user => !user)) throw new Error("RBAC E2E পরিচয় তৈরি করা যায়নি");

  await assignRole(inputOperator.id, ROLE_NAMES.INPUT_OPERATOR, inputOperator.id);
  await assignRole(superAdmin.id, ROLE_NAMES.SUPER_ADMIN, superAdmin.id);
  await assignRole(viewer.id, ROLE_NAMES.VIEWER, viewer.id);

  clearRBACCache();
  await initializeRBAC();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("real-stack RBAC E2E", () => {
  it("auth.me returns the strict INPUT_OPERATOR contract for an input operator", async () => {
    const me = await caller(inputOperator).auth.me();

    expect(me).toMatchObject({
      openId: "rbac-input-operator",
      role: "user",
      status: "active",
    });
    expect(me!.roles).toEqual([ROLE_NAMES.INPUT_OPERATOR]);
    expect(me!.permissions).toEqual([...INPUT_OPERATOR_PERMISSIONS]);
    expect(me!.permissions).not.toContain("accounting.read");
    expect(me!.permissions).not.toContain("voucher.read");
    expect(me!.permissions).not.toContain("voucher.submit");
  });

  it("auth.me exposes RBAC roles even when the legacy column is not admin", async () => {
    const me = await caller(superAdmin).auth.me();
    expect(me!.roles).toEqual([ROLE_NAMES.SUPER_ADMIN]);
    expect(me!.permissions).toEqual(expect.arrayContaining(["voucher.read", "voucher.post", "user.read"]));
  });

  it("denies read, update, and admin gates to the INPUT_OPERATOR", async () => {
    const op = caller(inputOperator);
    const project = await op.projects.create({ name: "RBAC E2E খাতা" });

    await expect(op.finance.overview({ projectId: project.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // voucherList is denied by the voucher.read gate before any DB access.
    await expect(op.finance.voucherList({ projectId: project.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(op.finance.saveFirmProfile({ projectId: project.id, name: "X" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminPassword = process.env.ADMIN_ACCESS_PASSWORD;
    if (adminPassword) {
      await expect(op.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("grants create-only gates to the INPUT_OPERATOR", async () => {
    const op = caller(inputOperator);
    const project = await op.projects.create({ name: "RBAC E2E অপারেটর খাতা" });

    const account = await op.finance.addAccount({
      projectId: project.id,
      name: "অপারেটর নগদ",
      type: "cash",
      openingBalance: 0,
    });
    expect(account).toBeDefined();
  });

  it("grants financial admin gates through the RBAC SUPER_ADMIN role (legacy role not admin)", async () => {
    expect(superAdmin.role).toBe("user");
    const admin = caller(superAdmin);
    const project = await admin.projects.create({ name: "RBAC E2E সুপার খাতা" });
    const overview = await admin.finance.overview({ projectId: project.id });
    expect(Array.isArray((overview as { accounts?: unknown[] }).accounts)).toBe(true);

    const adminPassword = process.env.ADMIN_ACCESS_PASSWORD;
    if (adminPassword) {
      await expect(admin.admin.users()).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ email: "input@rbac.test", role: "user" })])
      );
    }
  });

  it("keeps legacy role-admin access working alongside RBAC roles", async () => {
    const adminPassword = process.env.ADMIN_ACCESS_PASSWORD;
    if (adminPassword) {
      const me = await caller(legacyAdmin).auth.me();
      expect(Array.isArray(me!.roles)).toBe(true);
    }
  });

  it("auth.me never leaks credential columns", async () => {
    const me = await caller(inputOperator).auth.me();
    expect(me && "passwordHash" in me).toBe(false);
    expect(me && "resetToken" in me).toBe(false);
    expect(me && "resetTokenExpiresAt" in me).toBe(false);
  });
});