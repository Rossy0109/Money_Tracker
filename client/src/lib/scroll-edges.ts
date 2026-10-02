export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

/**
 * Which side of a horizontally scrolled region still hides content. Anything
 * within a pixel of an edge counts as being at that edge so touch scrolling
 * never leaves a stale fade behind.
 */
export const SCROLL_EDGE_EPSILON_PX = 1;

export function resolveScrollEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number
): ScrollEdges {
  if (!(clientWidth > 0) || !(scrollWidth > 0)) {
    return { start: false, end: false };
  }
  const hidden = scrollWidth - clientWidth;
  if (!(hidden > SCROLL_EDGE_EPSILON_PX)) {
    return { start: false, end: false };
  }
  return {
    start: scrollLeft > SCROLL_EDGE_EPSILON_PX,
    end: scrollLeft < hidden - SCROLL_EDGE_EPSILON_PX,
  };
}
