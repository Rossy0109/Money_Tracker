import { afterEach, describe, expect, it } from "vitest";
import { getAuthEnvMode, validateAuthMode } from "./loadEnv";

const savedNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

describe("getAuthEnvMode", () => {
  it("returns production only for NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(getAuthEnvMode()).toBe("production");
  });

  it("falls back to development otherwise", () => {
    for (const value of ["test", "development", undefined]) {
      if (value === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = value;
      expect(getAuthEnvMode()).toBe("development");
    }
  });
});

describe("validateAuthMode", () => {
  it("accepts google and password", () => {
    expect(validateAuthMode("google")).toBe(true);
    expect(validateAuthMode("password")).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of [undefined, "", "GOOGLE", "admin", "oauth"]) {
      expect(validateAuthMode(value)).toBe(false);
    }
  });
});
