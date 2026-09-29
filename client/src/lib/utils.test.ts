import { describe, expect, it } from "vitest";
import { bdt, cn, dateText, monthText } from "./utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy inputs", () => {
    const hidden: string | false = false;
    expect(cn("a", hidden && "b", undefined, null, "")).toBe("a");
  });

  it("resolves tailwind conflicts last-wins", () => {
    expect(cn("px-1", "px-2")).toBe("px-2");
  });
});

describe("bdt", () => {
  it("formats zero for nullish input", () => {
    expect(bdt(null)).toBe("৳ ০");
    expect(bdt(undefined)).toBe("৳ ০");
  });

  it("formats amounts with the taka prefix", () => {
    const out = bdt(1500);
    expect(out.startsWith("৳ ")).toBe(true);
    expect(out).toContain("১,৫০০");
  });
});

describe("dateText / monthText", () => {
  it("renders Bengali dates", () => {
    const out = dateText(new Date("2026-01-15T12:00:00Z"));
    expect(typeof out).toBe("string");
    expect(out).toContain("২০২৬");
    expect(monthText("2026-01").length).toBeGreaterThan(0);
  });
});
