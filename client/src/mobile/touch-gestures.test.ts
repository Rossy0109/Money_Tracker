import { describe, expect, it, vi } from "vitest";
import {
  detectSwipeGesture,
  LongPressDetector,
  resolveViewportMode,
  type TouchCoord,
} from "./touch-gestures";

describe("client/src/mobile/touch-gestures.test.ts - Swipe, Long-press, Orientation", () => {
  describe("Swipe Actions", () => {
    it("detects left swipe for deleting/dismissing a transaction card", () => {
      const start: TouchCoord = { x: 300, y: 150, time: 1000 };
      const end: TouchCoord = { x: 180, y: 155, time: 1250 }; // moved 120px left in 250ms

      const gesture = detectSwipeGesture(start, end, 50, 500);
      expect(gesture.direction).toBe("left");
      expect(gesture.distance).toBe(120);
    });

    it("detects right swipe for editing or archiving a row", () => {
      const start: TouchCoord = { x: 50, y: 100, time: 2000 };
      const end: TouchCoord = { x: 220, y: 105, time: 2200 }; // moved 170px right in 200ms

      const gesture = detectSwipeGesture(start, end, 50, 500);
      expect(gesture.direction).toBe("right");
      expect(gesture.distance).toBe(170);
    });

    it("ignores movements below the minimum threshold distance", () => {
      const start: TouchCoord = { x: 100, y: 100, time: 1000 };
      const end: TouchCoord = { x: 120, y: 102, time: 1100 }; // moved only 20px

      const gesture = detectSwipeGesture(start, end, 50, 500);
      expect(gesture.direction).toBe("none");
    });

    it("ignores slow drags exceeding the maximum gesture duration", () => {
      const start: TouchCoord = { x: 100, y: 100, time: 1000 };
      const end: TouchCoord = { x: 250, y: 100, time: 2000 }; // took 1000ms > max 500ms

      const gesture = detectSwipeGesture(start, end, 50, 500);
      expect(gesture.direction).toBe("none");
    });
  });

  describe("Long-press Menus", () => {
    it("triggers contextual menu action after holding touch for threshold duration", () => {
      vi.useFakeTimers();
      const menuTrigger = vi.fn();
      const detector = new LongPressDetector(menuTrigger, 500);

      detector.startTouch();
      expect(menuTrigger).not.toHaveBeenCalled();

      // Fast forward past threshold
      vi.advanceTimersByTime(500);
      expect(menuTrigger).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("cancels long-press trigger if user releases or moves finger before threshold", () => {
      vi.useFakeTimers();
      const menuTrigger = vi.fn();
      const detector = new LongPressDetector(menuTrigger, 500);

      detector.startTouch();
      vi.advanceTimersByTime(250); // Released halfway
      detector.cancelTouch();

      vi.advanceTimersByTime(300);
      expect(menuTrigger).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe("Orientation and Viewport Changes", () => {
    it("detects mobile portrait viewport (standard phone)", () => {
      const mode = resolveViewportMode(390, 844);
      expect(mode.isMobile).toBe(true);
      expect(mode.orientation).toBe("portrait");
    });

    it("detects mobile landscape orientation (phone rotated)", () => {
      const mode = resolveViewportMode(750, 390);
      expect(mode.isMobile).toBe(true);
      expect(mode.orientation).toBe("landscape");
    });

    it("detects desktop / tablet landscape orientation", () => {
      const mode = resolveViewportMode(1280, 800);
      expect(mode.isMobile).toBe(false);
      expect(mode.orientation).toBe("landscape");
    });
  });
});
