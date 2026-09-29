import { describe, expect, it } from "vitest";
import { toggleVariants } from "./toggle-variants";

describe("toggleVariants", () => {
  it("renders base classes by default", () => {
    const out = toggleVariants();
    expect(out).toContain("inline-flex");
    expect(out).toContain("bg-transparent");
    expect(out).toContain("h-9");
  });

  it("switches variant and size", () => {
    expect(toggleVariants({ variant: "outline" })).toContain("border-input");
    expect(toggleVariants({ size: "lg" })).toContain("h-10");
  });

  it("merges a custom className", () => {
    expect(toggleVariants({ className: "extra" })).toContain("extra");
  });
});
