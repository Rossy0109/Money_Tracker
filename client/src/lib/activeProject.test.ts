import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  readActiveProjectId,
  resolveActiveProjectId,
  saveActiveProjectId,
} from "./activeProject";

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

describe("resolveActiveProjectId — additional branches", () => {
  it("falls back to the first project when neither id is valid", () => {
    expect(resolveActiveProjectId([4, 9], 77, 88)).toBe(4);
  });

  it("prefers the current project over the stored one", () => {
    expect(resolveActiveProjectId([4, 9], 4, 9)).toBe(4);
  });

  it("uses the stored project when the current one is stale", () => {
    expect(resolveActiveProjectId([4, 9], 99, 9)).toBe(9);
  });

  it("uses the first project when both ids are null", () => {
    expect(resolveActiveProjectId([8], null, null)).toBe(8);
  });
});

describe("sessionStorage persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: vi.fn(), setItem: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGetItem(value: string | null) {
    vi.mocked(window.sessionStorage.getItem).mockReturnValue(value);
  }

  it("reads a positive integer id", () => {
    stubGetItem("12");
    expect(readActiveProjectId()).toBe(12);
  });

  it.each([null, "not-a-number", "0", "-4", "4.5"])(
    "returns null for %s",
    value => {
      stubGetItem(value);
      expect(readActiveProjectId()).toBeNull();
    }
  );

  it("returns null when sessionStorage access throws", () => {
    vi.mocked(window.sessionStorage.getItem).mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(readActiveProjectId()).toBeNull();
  });

  it("persists the id under the documented key", () => {
    saveActiveProjectId(21);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      ACTIVE_PROJECT_STORAGE_KEY,
      "21"
    );
  });

  it("swallows storage write failures", () => {
    vi.mocked(window.sessionStorage.setItem).mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => saveActiveProjectId(21)).not.toThrow();
  });
});
