import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

const { financeDb } = vi.hoisted(() => {
  const usersTable = new Map<string, any>();

  return {
    financeDb: {
      usersTable,
      createPasswordUser: vi.fn(async (input: { name: string; email: string; passwordHash: string }) => {
        const normalized = input.email.trim().toLowerCase();
        if (usersTable.has(normalized)) {
          throw new Error("এই ইমেইল দিয়ে ইতোমধ্যে একটি অ্যাকাউন্ট রয়েছে।");
        }
        const user = {
          id: usersTable.size + 1,
          openId: `local:${normalized}`,
          name: input.name,
          email: normalized,
          passwordHash: input.passwordHash,
          role: "user" as const,
          status: "pending" as const,
          loginMethod: "password",
        };
        usersTable.set(normalized, user);
        return user;
      }),
      getUserByEmail: vi.fn(async (email: string) => {
        const normalized = email.trim().toLowerCase();
        return usersTable.get(normalized) || undefined;
      }),
      updateUserStatus: vi.fn(async (userId: number, status: "pending" | "active" | "suspended") => {
        for (const user of usersTable.values()) {
          if (user.id === userId) {
            user.status = status;
            return user;
          }
        }
        return undefined;
      }),
      upsertUser: vi.fn(async () => {}),
      listUsersForAdmin: vi.fn(async () => Array.from(usersTable.values())),
    },
  };
});

vi.mock("./db", () => financeDb);

import { appRouter } from "./routers";

type CookieCall = {
  name: string;
  val: string;
  options: Record<string, unknown>;
};

function createMockContext(): { ctx: TrpcContext; setCookies: CookieCall[] } {
  const setCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, val: string, options: Record<string, unknown>) => {
        setCookies.push({ name, val, options });
      },
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx, setCookies };
}

describe("Direct Email & Password Authentication with Admin Approval (tRPC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    financeDb.usersTable.clear();
  });

  it("registers a new user and puts account into pending approval state", async () => {
    const testEmail = "kamrul@example.com";
    const { ctx, setCookies } = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({
      name: "কামরুল হাসান",
      email: testEmail,
      password: "securePassword123",
    });

    expect(result.success).toBe(true);
    expect(result.pendingApproval).toBe(true);
    expect(result.message).toContain("অ্যাডমিন অনুমোদনের অপেক্ষায়");
    expect(setCookies).toHaveLength(0); // No session cookie issued before approval
  });

  it("blocks login for pending approval user", async () => {
    const testEmail = "pending@example.com";
    const { ctx: regCtx } = createMockContext();
    const regCaller = appRouter.createCaller(regCtx);

    await regCaller.auth.register({
      name: "অপেক্ষারত ইউজার",
      email: testEmail,
      password: "mySecretPassword123",
    });

    const { ctx: loginCtx } = createMockContext();
    const loginCaller = appRouter.createCaller(loginCtx);

    await expect(
      loginCaller.auth.login({
        email: testEmail,
        password: "mySecretPassword123",
      })
    ).rejects.toThrow("অনুমোদিত হয়নি");
  });

  it("allows login once admin approves the user status to active", async () => {
    const testEmail = "approved@example.com";
    const { ctx: regCtx } = createMockContext();
    const regCaller = appRouter.createCaller(regCtx);

    await regCaller.auth.register({
      name: "অনুমোদিত ইউজার",
      email: testEmail,
      password: "mySecretPassword123",
    });

    // Admin approves user
    const dbUser = await financeDb.getUserByEmail(testEmail);
    expect(dbUser).toBeDefined();
    await financeDb.updateUserStatus(dbUser.id, "active");

    const { ctx: loginCtx, setCookies } = createMockContext();
    const loginCaller = appRouter.createCaller(loginCtx);

    const result = await loginCaller.auth.login({
      email: testEmail,
      password: "mySecretPassword123",
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe(testEmail);
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(COOKIE_NAME);
  });

  it("rejects invalid password for registered user", async () => {
    const testEmail = "badpass@example.com";
    const { ctx: regCtx } = createMockContext();
    const regCaller = appRouter.createCaller(regCtx);

    await regCaller.auth.register({
      name: "পাসওয়ার্ড টেস্ট",
      email: testEmail,
      password: "correctPassword123",
    });

    const { ctx: loginCtx } = createMockContext();
    const loginCaller = appRouter.createCaller(loginCtx);

    await expect(
      loginCaller.auth.login({
        email: testEmail,
        password: "wrongPassword999",
      })
    ).rejects.toThrow("ভুল ইমেইল অথবা পাসওয়ার্ড");
  });

  it("rejects duplicate registration with same email", async () => {
    const testEmail = "duplicate@example.com";
    const { ctx: regCtx1 } = createMockContext();
    const regCaller1 = appRouter.createCaller(regCtx1);

    await regCaller1.auth.register({
      name: "প্রথম রেজিস্টার",
      email: testEmail,
      password: "password123",
    });

    const { ctx: regCtx2 } = createMockContext();
    const regCaller2 = appRouter.createCaller(regCtx2);

    await expect(
      regCaller2.auth.register({
        name: "দ্বিতীয় রেজিস্টার",
        email: testEmail,
        password: "password456",
      })
    ).rejects.toThrow("ইতোমধ্যে একটি অ্যাকাউন্ট রয়েছে");
  });
});
