import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const { db } = vi.hoisted(() => {
  const users = new Map<string, any>();
  return {
    db: {
      users,
      getUserByEmail: vi.fn(async (email: string) => {
        const normalized = email.trim().toLowerCase();
        return users.get(normalized) || undefined;
      }),
      createPasswordUser: vi.fn(
        async (input: { email: string; passwordHash: string }) => {
          const normalized = input.email.trim().toLowerCase();
          const user = {
            id: users.size + 1,
            openId: `local:${normalized}`,
            name: input.email,
            email: normalized,
            passwordHash: input.passwordHash,
            role: "user",
            status: "active",
            loginMethod: "password",
          };
          users.set(normalized, user);
          return user;
        }
      ),
      upsertUser: vi.fn(async () => {}),
      listUsersForAdmin: vi.fn(async () => []),
    },
  };
});

vi.mock("../db", () => db);

vi.mock("./passwordAuth", async importOriginal => {
  const actual = await importOriginal<typeof import("./passwordAuth")>();
  return {
    ...actual,
    verifyPasswordConstantTime: vi.fn(
      (password: string, storedHash: string | null | undefined) =>
        actual.verifyPasswordConstantTime(password, storedHash)
    ),
  };
});

import { createApiApp } from "./app";
import { verifyPasswordConstantTime } from "./passwordAuth";

const servers: Server[] = [];

async function startServer() {
  const app = createApiApp();
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("A TCP address was expected for the isolated login check");
  }
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("Express /api/auth/login timing-safe credential validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.users.clear();
  });

  it("rejects an unknown email but still runs the constant-time verification against a dummy hash", async () => {
    const baseUrl = await startServer();
    const spy = vi.mocked(verifyPasswordConstantTime);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ghost@example.com",
        password: "randomPassword123",
      }),
    });

    expect(response.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("randomPassword123", undefined);
  });

  it("rejects an OAuth-only account without a password hash after running verification", async () => {
    db.users.set("oauth@example.com", {
      id: 51,
      openId: "google:usr_oauth",
      name: "OAuth User",
      email: "oauth@example.com",
      passwordHash: null,
      role: "user",
      status: "active",
      loginMethod: "google",
    });

    const baseUrl = await startServer();
    const spy = vi.mocked(verifyPasswordConstantTime);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "oauth@example.com",
        password: "somePassword123",
      }),
    });

    expect(response.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("somePassword123", null);
  });

  it("rejects a wrong password for a registered account", async () => {
    const baseUrl = await startServer();
    await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Registered",
        email: "registered@example.com",
        password: "correctPassword123!",
      }),
    });

    const spy = vi.mocked(verifyPasswordConstantTime);
    spy.mockClear();

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "registered@example.com",
        password: "wrongPassword999!",
      }),
    });

    expect(response.status).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toMatch(/^scrypt:/);
  });
});
