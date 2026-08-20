import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dbSource = readFileSync(resolve(import.meta.dirname, "db.ts"), "utf8");

describe("default finance workspace", () => {
  it("seeds the Daily Transaction Ledger instead of the deleted legacy workspace", () => {
    expect(dbSource).toContain('const DEFAULT_PROJECT_NAME = "দৈনিক লেনদেনের খাতা"');
    expect(dbSource).not.toContain('const DEFAULT_PROJECT_NAME = "Face Two Button"');
  });
});
