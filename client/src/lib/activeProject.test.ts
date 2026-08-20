import { describe, expect, it } from "vitest";
import { resolveActiveProjectId } from "./activeProject";

describe("resolveActiveProjectId", () => {
  it("keeps the currently selected project when it belongs to the signed-in user", () => {
    expect(resolveActiveProjectId([4, 9], 9, 4)).toBe(9);
  });

  it("restores a saved project only when it belongs to the signed-in user", () => {
    expect(resolveActiveProjectId([4, 9], null, 9)).toBe(9);
    expect(resolveActiveProjectId([4, 9], null, 77)).toBe(4);
  });

  it("returns null when the signed-in user has no projects", () => {
    expect(resolveActiveProjectId([], 9, 9)).toBeNull();
  });
});
