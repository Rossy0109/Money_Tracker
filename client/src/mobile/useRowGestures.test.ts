import { describe, expect, it } from "vitest";
import {
  resolveRowGesture,
  SWIPE_MAX_DURATION_MS,
  SWIPE_THRESHOLD_PX,
} from "./useRowGestures";
import type { TouchCoord } from "./touch-gestures";

const coord = (x: number, y: number, time = 1000): TouchCoord => ({
  x,
  y,
  time,
});

describe("resolveRowGesture", () => {
  it("maps a right swipe to edit", () => {
    expect(resolveRowGesture(coord(40, 100), coord(40 + 120, 102, 1200))).toBe(
      "edit"
    );
  });

  it("maps a left swipe to delete", () => {
    expect(resolveRowGesture(coord(300, 100), coord(300 - 140, 98, 1150))).toBe(
      "delete"
    );
  });

  it("ignores vertical scrolling", () => {
    expect(
      resolveRowGesture(coord(100, 200), coord(102, 200 - 220, 1200))
    ).toBeNull();
  });

  it("ignores taps and micro-drags below the swipe threshold", () => {
    expect(
      resolveRowGesture(coord(100, 100), coord(108, 101, 1050))
    ).toBeNull();
    expect(SWIPE_THRESHOLD_PX).toBeGreaterThan(8);
  });

  it("ignores slow drags so a held finger is a long-press, not a swipe", () => {
    expect(
      resolveRowGesture(
        coord(100, 100),
        coord(260, 100, 1000 + SWIPE_MAX_DURATION_MS + 1)
      )
    ).toBeNull();
  });
});
