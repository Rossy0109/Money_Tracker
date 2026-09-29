import { describe, expect, it } from "vitest";
import { APP_VERSION, SCHEMA_VERSION } from "./backupManifest";

describe("backup manifest versions", () => {
  it("pins app and schema versions", () => {
    expect(APP_VERSION).toBe("1.0.0");
    expect(SCHEMA_VERSION).toBe("1");
  });
});
