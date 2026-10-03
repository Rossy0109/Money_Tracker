export interface TouchCoord {
  x: number;
  y: number;
  time: number;
}

export type SwipeDirection = "left" | "right" | "up" | "down" | "none";

export function detectSwipeGesture(
  start: TouchCoord,
  end: TouchCoord,
  thresholdPx = 50,
  maxDurationMs = 500
): { direction: SwipeDirection; distance: number } {
  const duration = end.time - start.time;
  if (duration > maxDurationMs) {
    return { direction: "none", distance: 0 };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (Math.max(absDx, absDy) < thresholdPx) {
    return { direction: "none", distance: 0 };
  }

  if (absDx > absDy) {
    return {
      direction: dx > 0 ? "right" : "left",
      distance: absDx,
    };
  } else {
    return {
      direction: dy > 0 ? "down" : "up",
      distance: absDy,
    };
  }
}

/** Fires `onTrigger` once the touch is held for `durationMs` without moving. */
export class LongPressDetector {
  private timer: NodeJS.Timeout | null = null;
  private durationMs: number;
  private onTrigger: () => void;

  constructor(onTrigger: () => void, durationMs = 500) {
    this.onTrigger = onTrigger;
    this.durationMs = durationMs;
  }

  startTouch() {
    this.cancelTouch();
    this.timer = setTimeout(() => {
      this.onTrigger();
      this.timer = null;
    }, this.durationMs);
  }

  cancelTouch() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// Orientation and mobile viewport helper
export function resolveViewportMode(
  width: number,
  height: number
): {
  isMobile: boolean;
  orientation: "portrait" | "landscape";
} {
  const isMobile = width <= 768;
  const orientation = height >= width ? "portrait" : "landscape";
  return { isMobile, orientation };
}
