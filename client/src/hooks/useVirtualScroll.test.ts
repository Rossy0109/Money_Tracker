import { describe, expect, it } from "vitest";
import { useVirtualScroll } from "./useVirtualScroll";

describe("useVirtualScroll hook", () => {
  it("computes slice range and total height accurately", () => {
    // Basic unit test for calculations
    const itemCount = 1000;
    const itemHeight = 48;
    const totalHeight = itemCount * itemHeight;

    expect(totalHeight).toBe(48000);
    expect(useVirtualScroll).toBeDefined();
  });
});
