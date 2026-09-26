import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connection: {
    query: vi.fn(),
    end: vi.fn(),
  },
  createConnection: vi.fn(),
  seed: vi.fn(),
  migrate: vi.fn(),
  initialize: vi.fn(),
  markUnavailable: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  createConnection: state.createConnection,
}));

vi.mock("./_core/seed-rbac", () => ({
  seedDefaultRBAC: state.seed,
}));

vi.mock("./_core/migrate-existing-users-rbac", () => ({
  migrateExistingUsersToRBAC: state.migrate,
}));

vi.mock("./_core/rbac", () => ({
  initializeRBAC: state.initialize,
  markRBACUnavailable: state.markUnavailable,
}));

const databaseUrl = "mysql://user:secret@localhost/money_tracker";

describe("RBAC startup initializer", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl;
    state.createConnection.mockReset().mockResolvedValue(state.connection);
    state.connection.query
      .mockReset()
      .mockImplementation(async (sql: string) => {
        if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
        return [[{ released: 1 }]];
      });
    state.connection.end.mockReset().mockResolvedValue(undefined);
    state.seed.mockReset().mockResolvedValue(undefined);
    state.migrate.mockReset().mockResolvedValue(undefined);
    state.initialize.mockReset().mockResolvedValue(undefined);
    state.markUnavailable.mockReset();
  });

  it("uses a stable bounded database lock and releases it after startup", async () => {
    const { getRBACLockName, initializeRBACSystem } =
      await import("./_core/rbac-initializer");
    const lockName = getRBACLockName(
      "mysql://user:another-secret@localhost/money_tracker?password=hidden"
    );

    expect(lockName.length).toBeLessThanOrEqual(64);
    expect(lockName).not.toContain("secret");
    expect(lockName).not.toContain("hidden");
    expect(lockName).toBe(getRBACLockName(databaseUrl));

    await initializeRBACSystem();

    expect(state.createConnection).toHaveBeenCalledWith(databaseUrl);
    expect(state.connection.query.mock.calls[0][0]).toContain("GET_LOCK");
    expect(state.connection.query.mock.calls[0][1][0]).toBe(lockName);
    expect(state.connection.query.mock.calls[0][1][1]).toBeGreaterThanOrEqual(
      1
    );
    expect(state.seed).toHaveBeenCalledTimes(1);
    expect(state.migrate).toHaveBeenCalledTimes(1);
    expect(state.initialize).toHaveBeenCalledTimes(1);
    expect(state.connection.query.mock.calls[1][0]).toContain("RELEASE_LOCK");
    expect(state.connection.end).toHaveBeenCalledTimes(1);
  });

  it("shares one local promise for concurrent startup calls", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    state.seed.mockImplementation(() => gate);
    const { initializeRBACSystem } = await import("./_core/rbac-initializer");

    const first = initializeRBACSystem();
    const second = initializeRBACSystem();

    expect(second).toBe(first);
    expect(state.createConnection).toHaveBeenCalledTimes(1);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(state.seed).toHaveBeenCalledTimes(1);
    release?.();
    await first;
  });

  it("retries startup after a failed local initialization", async () => {
    state.seed
      .mockRejectedValueOnce(new Error("seed failed"))
      .mockResolvedValueOnce(undefined);
    const { initializeRBACSystem } = await import("./_core/rbac-initializer");

    await expect(initializeRBACSystem()).rejects.toThrow("seed failed");
    await expect(initializeRBACSystem()).resolves.toBeUndefined();
    expect(state.createConnection).toHaveBeenCalledTimes(2);
    expect(state.seed).toHaveBeenCalledTimes(2);
    expect(state.migrate).toHaveBeenCalledTimes(1);
  });

  it("fails readiness and closes the connection when the lock times out", async () => {
    state.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 0 }]];
      return [[{ released: 1 }]];
    });
    const { initializeRBACSystem } = await import("./_core/rbac-initializer");

    await expect(initializeRBACSystem()).rejects.toThrow(
      "lock could not be acquired"
    );
    expect(state.seed).not.toHaveBeenCalled();
    expect(state.connection.query.mock.calls[1][0]).toContain("RELEASE_LOCK");
    expect(state.connection.end).toHaveBeenCalledTimes(1);
    expect(state.markUnavailable).toHaveBeenCalled();
  });

  it("propagates lock and release errors while always closing", async () => {
    state.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      throw new Error("release failed");
    });
    const { initializeRBACSystem } = await import("./_core/rbac-initializer");

    await expect(initializeRBACSystem()).rejects.toThrow("release failed");
    expect(state.connection.end).toHaveBeenCalledTimes(1);

    vi.resetModules();
    state.createConnection.mockResolvedValue(state.connection);
    state.connection.query.mockImplementation(async (sql: string) => {
      if (sql.includes("GET_LOCK")) throw new Error("lock failed");
      return [[{ released: 1 }]];
    });
    state.connection.end.mockClear();
    const retryModule = await import("./_core/rbac-initializer");
    await expect(retryModule.initializeRBACSystem()).rejects.toThrow(
      "lock failed"
    );
    expect(state.connection.end).toHaveBeenCalledTimes(1);
  });

  it("fails closed in production when DATABASE_URL is unavailable", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    const { initializeRBACSystem } = await import("./_core/rbac-initializer");

    await expect(initializeRBACSystem()).rejects.toThrow(
      "Database unavailable"
    );
    expect(state.createConnection).not.toHaveBeenCalled();
    expect(state.seed).not.toHaveBeenCalled();
  });
});
