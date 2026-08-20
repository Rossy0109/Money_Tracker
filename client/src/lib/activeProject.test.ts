import { describe, expect, it, vi } from "vitest";
import { activeProjectStorageKey, persistPreferredProjectId, preferredProjectId } from "./activeProject";

describe("active project continuity", () => {
  it("uses a valid saved project for the signed-in user and falls back to the first owned project", () => {
    const getItem = vi.fn().mockReturnValue("22");
    vi.stubGlobal("window", { sessionStorage: { getItem, setItem: vi.fn() } });
    const projects = [{ id: 11 }, { id: 22 }];
    expect(preferredProjectId(7, projects)).toBe(22);
    getItem.mockReturnValue("99");
    expect(preferredProjectId(7, projects)).toBe(11);
    expect(preferredProjectId(7, [])).toBeNull();
  });

  it("stores the selected project under a user-specific session key", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { sessionStorage: { getItem: vi.fn(), setItem } });
    persistPreferredProjectId(7, 22);
    expect(activeProjectStorageKey(7)).toBe("my-hisab-active-project-7");
    expect(setItem).toHaveBeenCalledWith("my-hisab-active-project-7", "22");
  });
});
