import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabaseConnection,
  databaseRequired,
  getDb,
  setDbHandle,
} from "./dbConnection";

const savedUrl = process.env.DATABASE_URL;

afterEach(async () => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
  setDbHandle(null);
  await closeDatabaseConnection();
  vi.restoreAllMocks();
});

describe("databaseRequired", () => {
  it("throws when the handle is null", () => {
    expect(() => databaseRequired(null)).toThrow("Database unavailable");
  });

  it("returns the handle otherwise", () => {
    const handle = { ping: true };
    expect(databaseRequired(handle)).toBe(handle);
  });
});

describe("db handle lifecycle", () => {
  it("returns null when no handle is injected and no URL is set", async () => {
    delete process.env.DATABASE_URL;
    expect(await getDb()).toBeNull();
  });

  it("returns the injected handle", async () => {
    const fake = { fake: true } as never;
    setDbHandle(fake);
    expect(await getDb()).toBe(fake);
  });

  it("close clears the injected handle", async () => {
    setDbHandle({ fake: true } as never);
    await closeDatabaseConnection();
    delete process.env.DATABASE_URL;
    expect(await getDb()).toBeNull();
  });

  it("double close is safe", async () => {
    await closeDatabaseConnection();
    await expect(closeDatabaseConnection()).resolves.toBeUndefined();
  });

  it("invalid DATABASE_URL resolves to null without throwing", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@host:5432/db";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getDb()).toBeNull();
  });

  it("creates a lazy pool for a valid URL and closes it cleanly", async () => {
    process.env.DATABASE_URL = "mysql://root@127.0.0.1:3306/money_tracker";
    const db = await getDb();
    expect(db).not.toBeNull();
    await expect(closeDatabaseConnection()).resolves.toBeUndefined();
  });
});
