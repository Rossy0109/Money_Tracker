import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hookSource = readFileSync(resolve(process.cwd(), "client/src/hooks/useMobile.tsx"), "utf8");

describe("compact sidebar breakpoint", () => {
  it("uses the viewport synchronously on the first browser render instead of briefly rendering the desktop sidebar", () => {
    expect(hookSource).toContain('typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT');
    expect(hookSource).toContain("React.useState(getIsMobileViewport)");
    expect(hookSource).toContain("setIsMobile(getIsMobileViewport())");
  });
});
