import { useEffect, useRef } from "react";
import {
  detectSwipeGesture,
  LongPressDetector,
  type TouchCoord,
} from "./touch-gestures";

/** What a horizontal swipe means on a data row. */
export type RowGestureAction = "edit" | "delete";

export const SWIPE_THRESHOLD_PX = 50;
export const SWIPE_MAX_DURATION_MS = 500;
export const LONG_PRESS_MS = 500;
/** Finger travel that cancels a pending long-press but still counts as a swipe. */
export const MOVE_SLOP_PX = 8;

/**
 * Map a completed touch gesture to a row action.
 * Right swipe edits, left swipe deletes, vertical movement and slow or short
 * drags are ignored so ordinary scrolling and tapping never fire an action.
 */
export function resolveRowGesture(
  start: TouchCoord,
  end: TouchCoord
): RowGestureAction | null {
  const { direction } = detectSwipeGesture(
    start,
    end,
    SWIPE_THRESHOLD_PX,
    SWIPE_MAX_DURATION_MS
  );
  if (direction === "right") return "edit";
  if (direction === "left") return "delete";
  return null;
}

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return target.closest("button, a, input, select, textarea, label") !== null;
};

const toCoord = (touch: { clientX: number; clientY: number }): TouchCoord => ({
  x: touch.clientX,
  y: touch.clientY,
  time: Date.now(),
});

/**
 * Touch handlers for a swipeable/long-pressable row.
 *
 * - swipe right → `onEdit`
 * - swipe left  → `onDelete`
 * - long-press  → `onLongPress`
 *
 * Gestures start only on non-interactive content, so tapping the row's own
 * edit/delete buttons keeps working unchanged.
 */
export function useRowGestures<TRow>({
  row,
  onEdit,
  onDelete,
  onLongPress,
  enabled = true,
}: {
  row: TRow;
  onEdit?: (row: TRow) => void;
  onDelete?: (row: TRow) => void;
  onLongPress?: (row: TRow) => void;
  enabled?: boolean;
}) {
  const startRef = useRef<TouchCoord | null>(null);
  const longPressRef = useRef<LongPressDetector | null>(null);

  useEffect(
    () => () => {
      longPressRef.current?.cancelTouch();
      longPressRef.current = null;
    },
    []
  );

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!enabled || !event.touches[0]) return;
    if (isInteractiveTarget(event.target)) {
      longPressRef.current?.cancelTouch();
      startRef.current = null;
      return;
    }
    startRef.current = toCoord(event.touches[0]);
    if (onLongPress) {
      const detector = new LongPressDetector(
        () => onLongPress(row),
        LONG_PRESS_MS
      );
      detector.startTouch();
      longPressRef.current = detector;
    }
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start || !event.touches[0]) return;
    const current = toCoord(event.touches[0]);
    const moved =
      Math.abs(current.x - start.x) > MOVE_SLOP_PX ||
      Math.abs(current.y - start.y) > MOVE_SLOP_PX;
    if (moved) longPressRef.current?.cancelTouch();
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    longPressRef.current?.cancelTouch();
    const start = startRef.current;
    startRef.current = null;
    if (!start || !event.changedTouches[0]) return;
    if (isInteractiveTarget(event.target)) return;

    const action = resolveRowGesture(start, toCoord(event.changedTouches[0]));
    if (action === "edit") onEdit?.(row);
    if (action === "delete") onDelete?.(row);
  };

  const onTouchCancel = () => {
    longPressRef.current?.cancelTouch();
    startRef.current = null;
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
