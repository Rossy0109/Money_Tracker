import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirnameFromMetaUrl } from "../dirname";

const dbSource = readFileSync(resolve(dirnameFromMetaUrl(import.meta.url), "db.ts"), "utf8");

describe("default finance workspace", () => {
  it("seeds the Daily Transaction Ledger instead of the deleted legacy workspace", () => {
    expect(dbSource).toContain('const DEFAULT_PROJECT_NAME = "দৈনিক লেনদেনের খাতা"');
    expect(dbSource).not.toContain('const DEFAULT_PROJECT_NAME = "Face Two Button"');
  });
});
