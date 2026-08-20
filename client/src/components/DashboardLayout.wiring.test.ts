import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);

describe("dashboard shell component wiring", () => {
  it("keeps Bengali sidebar copy and leaves the page landmark to the routed content", () => {
    expect(source).toContain("ব্যক্তিগত হিসাব");
    expect(source).toContain('className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-9">{children}</div>');
    expect(source).not.toContain('max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-9">{children}</main>');
  });

  it("keeps a visible keyboard focus state on the sign-out control", () => {
    expect(source).toContain('aria-label="সাইন আউট"');
    expect(source).toContain("focus-visible:ring-2 focus-visible:ring-[#bcecc6]");
  });
});
