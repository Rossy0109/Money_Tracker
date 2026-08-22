import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function getIsMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(getIsMobileViewport);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => {
      setIsMobile(getIsMobileViewport());
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
