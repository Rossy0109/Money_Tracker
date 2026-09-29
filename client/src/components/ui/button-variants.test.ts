import { describe, expect, it } from "vitest";
import { buttonVariants } from "./button-variants";

describe("buttonVariants", () => {
  it("renders base classes by default", () => {
    const out = buttonVariants();
    expect(out).toContain("inline-flex");
    expect(out).toContain("bg-primary");
    expect(out).toContain("h-9");
  });

  it("switches variant and size", () => {
    expect(buttonVariants({ variant: "destructive" })).toContain(
      "bg-destructive"
    );
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "icon" })).toContain("size-9");
  });

  it("merges a custom className", () => {
    expect(buttonVariants({ className: "extra" })).toContain("extra");
  });
});
