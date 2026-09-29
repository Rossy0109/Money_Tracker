import { describe, expect, it } from "vitest";
import { findDriveFileByName } from "./driveApi";

describe("findDriveFileByName (stub)", () => {
  it("always resolves null until a real provider lands", async () => {
    await expect(findDriveFileByName("tok", "f", null)).resolves.toBeNull();
    await expect(
      findDriveFileByName("tok", "f", "parent", "mime")
    ).resolves.toBeNull();
  });
});
