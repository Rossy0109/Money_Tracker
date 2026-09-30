import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateConnection } = vi.hoisted(() => ({
  mockCreateConnection: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  createConnection: mockCreateConnection,
}));

import {
  buildRbacLockConnectionOptions,
  runWithRBACLock,
} from "./rbac-initializer";

const TIDB_URL =
  "mysql://admin:p%40ss%3Aw0rd@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/money_tracker?ssl={\"rejectUnauthorized\":true}";

function fakeConnection(acquired = 1) {
  return {
    query: vi.fn(async (sql: string) => {
      if (String(sql).includes("RELEASE_LOCK")) return [{ affectedRows: 1 }, []];
      return [[{ acquired }], []];
    }),
    end: vi.fn(async () => undefined),
  };
}

describe("buildRbacLockConnectionOptions", () => {
  it("parses a TiDB URL to explicit options (never localhost)", () => {
    const options = buildRbacLockConnectionOptions(TIDB_URL);
    expect(options.host).toBe(
      "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
    );
    expect(options.host).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(options.port).toBe(4000);
    expect(options.user).toBe("admin");
    expect(options.password).toBe("p@ss:w0rd");
    expect(options.database).toBe("money_tracker");
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("maps ssl-mode params", () => {
    const options = buildRbacLockConnectionOptions(
      "mysql://u:p@host:3306/db?ssl-mode=REQUIRED"
    );
    expect(options.host).toBe("host");
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("throws for an empty URL", () => {
    expect(() => buildRbacLockConnectionOptions("")).toThrow(
      "Database unavailable"
    );
  });
});

describe("runWithRBACLock", () => {
  beforeEach(() => {
    mockCreateConnection.mockReset();
  });

  it("connects with explicit options, locks, initializes, unlocks", async () => {
    const connection = fakeConnection(1);
    mockCreateConnection.mockResolvedValue(connection);
    const initialize = vi.fn(async () => undefined);

    await runWithRBACLock(TIDB_URL, initialize);

    expect(mockCreateConnection).toHaveBeenCalledTimes(1);
    const arg = mockCreateConnection.mock.calls[0][0];
    expect(typeof arg).toBe("object");
    expect(arg.host).toBe(
      "gateway01.ap-southeast-1.prod.aws.tidbcloud.com"
    );
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(
      connection.query.mock.calls.some(([sql]: [string]) =>
        String(sql).includes("RELEASE_LOCK")
      )
    ).toBe(true);
    expect(connection.end).toHaveBeenCalledTimes(1);
  });

  it("throws when the lock cannot be acquired", async () => {
    const connection = fakeConnection(0);
    mockCreateConnection.mockResolvedValue(connection);
    const initialize = vi.fn(async () => undefined);

    await expect(runWithRBACLock(TIDB_URL, initialize)).rejects.toThrow(
      "could not be acquired"
    );
    expect(initialize).not.toHaveBeenCalled();
  });
});
