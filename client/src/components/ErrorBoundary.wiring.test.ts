import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/ErrorBoundary.tsx"),
  "utf8"
);

describe("ErrorBoundary recovery UI", () => {
  it("shows Bengali recovery copy without exposing an error stack", () => {
    expect(source).toContain("একটি অপ্রত্যাশিত সমস্যা হয়েছে");
    expect(source).toContain("পৃষ্ঠাটি আবার লোড করুন");
    expect(source).not.toContain("error?.stack");
  });
});
