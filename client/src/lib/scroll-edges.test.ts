import { describe, expect, it } from "vitest";
import { resolveScrollEdges, SCROLL_EDGE_EPSILON_PX } from "./scroll-edges";

describe("resolveScrollEdges", () => {
  it("shows no fade when the content fits", () => {
    expect(resolveScrollEdges(0, 320, 320)).toEqual({
      start: false,
      end: false,
    });
    expect(resolveScrollEdges(40, 320, 320)).toEqual({
      start: false,
      end: false,
    });
  });

  it("only shows the end fade while scrolled to the start", () => {
    expect(resolveScrollEdges(0, 900, 320)).toEqual({
      start: false,
      end: true,
    });
  });

  it("shows both fades while content is hidden on both sides", () => {
    expect(resolveScrollEdges(300, 900, 320)).toEqual({
      start: true,
      end: true,
    });
  });

  it("only shows the start fade when scrolled to the end", () => {
    expect(resolveScrollEdges(580, 900, 320)).toEqual({
      start: true,
      end: false,
    });
  });

  it("treats a pixel at either edge as being at that edge", () => {
    expect(SCROLL_EDGE_EPSILON_PX).toBe(1);
    expect(resolveScrollEdges(1, 900, 320)).toEqual({
      start: false,
      end: true,
    });
    expect(resolveScrollEdges(579, 900, 320)).toEqual({
      start: true,
      end: false,
    });
  });

  it("ignores overflow of one pixel or less", () => {
    expect(resolveScrollEdges(0, 321, 320)).toEqual({
      start: false,
      end: false,
    });
  });

  it("stays quiet when measurements are not available yet", () => {
    expect(resolveScrollEdges(NaN, NaN, NaN)).toEqual({
      start: false,
      end: false,
    });
    expect(resolveScrollEdges(0, 100, 0)).toEqual({
      start: false,
      end: false,
    });
  });
});
