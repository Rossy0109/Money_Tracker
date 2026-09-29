import { describe, expect, it } from "vitest";
import { getAccessToken } from "./driveOAuth";

describe("getAccessToken (stub)", () => {
  it("always resolves empty until a real provider lands", async () => {
    await expect(getAccessToken({})).resolves.toBe("");
    await expect(
      getAccessToken({ accessToken: "x", refreshToken: "y" })
    ).resolves.toBe("");
  });
});
