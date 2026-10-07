import { describe, expect, it } from "vitest";
import {
  checkPackageJson,
  collectMajorBumps,
  majorOf,
} from "./check-dependency-policy.mjs";

describe("majorOf", () => {
  it("reads the leading major from common range forms", () => {
    expect(majorOf("^5.6.0")).toBe(5);
    expect(majorOf("~4.13.9")).toBe(4);
    expect(majorOf(">=18.0.4")).toBe(18);
    expect(majorOf("  ^11.1.0  ")).toBe(11);
    expect(majorOf("v7.0.2")).toBe(7);
    expect(majorOf("4")).toBe(4);
  });

  it("returns null for ranges it cannot classify", () => {
    expect(majorOf("workspace:*")).toBeNull();
    expect(majorOf("file:../pkg")).toBeNull();
    expect(majorOf("*")).toBeNull();
    expect(majorOf("latest")).toBeNull();
    expect(majorOf(undefined)).toBeNull();
    expect(majorOf(42)).toBeNull();
  });

  it("reads through npm aliases", () => {
    expect(majorOf("npm:chalk@^5.3.0")).toBe(5);
  });
});

describe("collectMajorBumps", () => {
  const pkg = (deps, devDeps) => ({ dependencies: deps, devDependencies: devDeps });

  it("flags a dependency moving up a major", () => {
    const bumps = collectMajorBumps(
      pkg({ hono: "^4.13.9" }, {}),
      pkg({ hono: "^5.0.0" }, {}),
    );
    expect(bumps).toEqual([
      { field: "dependencies", name: "hono", from: "^4.13.9", to: "^5.0.0" },
    ]);
  });

  it("allows patch and minor moves", () => {
    const bumps = collectMajorBumps(
      pkg({ mysql2: "^3.24.4", pino: "^10.3.1" }, {}),
      pkg({ mysql2: "^3.24.5", pino: "^10.4.0" }, {}),
    );
    expect(bumps).toEqual([]);
  });

  it("allows additions and removals", () => {
    const bumps = collectMajorBumps(
      pkg({ a: "^1.0.0" }, {}),
      pkg({ b: "^9.0.0" }, {}),
    );
    expect(bumps).toEqual([]);
  });

  it("skips ranges it cannot classify", () => {
    const bumps = collectMajorBumps(
      pkg({ a: "workspace:*" }, {}),
      pkg({ a: "workspace:^2.0.0" }, {}),
    );
    expect(bumps).toEqual([]);
  });

  it("respects the allowlist", () => {
    const bumps = collectMajorBumps(
      pkg({ typescript: "^5.6.0" }, {}),
      pkg({ typescript: "^7.0.2" }, {}),
      new Set(["typescript"]),
    );
    expect(bumps).toEqual([]);
  });

  it("checks devDependencies and reports the field", () => {
    const bumps = collectMajorBumps(
      pkg({}, { eslint: "^10.11.0" }),
      pkg({}, { eslint: "^11.0.0" }),
    );
    expect(bumps).toEqual([
      { field: "devDependencies", name: "eslint", from: "^10.11.0", to: "^11.0.0" },
    ]);
  });

  it("handles missing fields", () => {
    expect(collectMajorBumps({}, {})).toEqual([]);
    expect(collectMajorBumps(undefined, undefined)).toEqual([]);
  });
});

describe("checkPackageJson", () => {
  it("passes when only patch and minor bumps are present", () => {
    const result = checkPackageJson(
      { dependencies: { dotenv: "^18.0.4" } },
      { dependencies: { dotenv: "^18.0.5" } },
    );
    expect(result.ok).toBe(true);
  });

  it("fails with an actionable message on a major bump", () => {
    const result = checkPackageJson(
      { dependencies: { typescript: "^5.6.0" } },
      { dependencies: { typescript: "^7.0.2" } },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("typescript: ^5.6.0 -> ^7.0.2");
    expect(result.message).toContain("--allow <pkg>");
  });

  it("pluralizes the failure message for multiple bumps", () => {
    const result = checkPackageJson(
      { dependencies: { a: "^1.0.0", b: "^2.0.0" } },
      { dependencies: { a: "^2.0.0", b: "^3.0.0" } },
    );
    expect(result.message).toContain("Major dependency bumps require");
  });
});
