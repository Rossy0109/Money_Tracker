import * as React from "react";

import { cn } from "@/lib/utils";
import { resolveScrollEdges } from "@/lib/scroll-edges";

interface ScrollShadowProps extends React.ComponentPropsWithoutRef<"div"> {
  scrollerClassName?: string;
  scrollerRef?: React.Ref<HTMLDivElement>;
}

function ScrollShadow({
  className,
  scrollerClassName,
  scrollerRef,
  children,
  ...props
}: ScrollShadowProps) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useImperativeHandle(
    scrollerRef,
    () => innerRef.current as HTMLDivElement
  );

  const update = React.useCallback(() => {
    const node = innerRef.current;
    if (!node) return;
    const next = resolveScrollEdges(
      node.scrollLeft,
      node.scrollWidth,
      node.clientWidth
    );
    setEdges(previous =>
      previous.start === next.start && previous.end === next.end
        ? previous
        : next
    );
  }, []);

  React.useLayoutEffect(() => {
    update();
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    const firstChild = node.firstElementChild;
    if (firstChild) observer.observe(firstChild);
    return () => observer.disconnect();
  });

  const hiddenClass =
    "pointer-events-none absolute inset-y-0 z-20 w-10 transition-opacity duration-200";

  return (
    <div
      data-slot="scroll-shadow"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <div
        ref={innerRef}
        data-slot="scroll-shadow-scroller"
        onScroll={update}
        className={cn("relative overflow-x-auto", scrollerClassName)}
      >
        {children}
      </div>
      <span
        data-slot="scroll-shadow-start"
        aria-hidden="true"
        className={cn(
          `${hiddenClass} left-0 bg-gradient-to-r from-white via-white/70 to-transparent`,
          edges.start ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        data-slot="scroll-shadow-end"
        aria-hidden="true"
        className={cn(
          `${hiddenClass} right-0 bg-gradient-to-l from-white via-white/70 to-transparent`,
          edges.end ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}

export { ScrollShadow };
