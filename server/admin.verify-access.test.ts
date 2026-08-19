import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

const adminContext = {
  user: {
    id: 1,
    openId: "administrator",
    email: "admin@example.com",
    name: "Administrator",
    loginMethod: "manus",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

describe("admin.verifyAccess", () => {
  it("accepts the configured server-only administrator password", async () => {
    const configuredPassword = process.env.ADMIN_ACCESS_PASSWORD;
    if (!configuredPassword) throw new Error("ADMIN_ACCESS_PASSWORD must be configured for administrator verification");

    const caller = appRouter.createCaller(adminContext);
    await expect(caller.admin.verifyAccess({ password: configuredPassword })).resolves.toEqual({ verified: true });
  });

  it("rejects an incorrect administrator password", async () => {
    const caller = appRouter.createCaller(adminContext);
    await expect(caller.admin.verifyAccess({ password: "incorrect-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
