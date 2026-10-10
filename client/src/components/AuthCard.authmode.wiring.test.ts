import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract: when VITE_AUTH_MODE === "google", self-service
 * registration must be hidden in the UI (the API already
 * returns FORBIDDEN/404 for auth.register outside password
 * mode). The raw Express /api/auth/register gate makes this
 * defence in depth — the client must never offer a door the
 * server would refuse.
 */
const authCardSource = readFileSync(
  resolve(process.cwd(), "client/src/components/AuthCard.tsx"),
  "utf8"
);

describe("AuthCard registration gating (VITE_AUTH_MODE contract)", () => {
  it("derives isGoogleAuth from VITE_AUTH_MODE", () => {
    expect(
      authCardSource.includes(
        'import.meta.env.VITE_AUTH_MODE === "google"'
      )
    ).toBe(true);
  });

  it("hides the user sign-up toggle in google mode", () => {
    // The role-select block that offers "register" is gated.
    expect(
      authCardSource.includes(
        "{roleMode === \"user\" && !isGoogleAuth && ("
      )
    ).toBe(true);
  });

  it("shows the Google sign-in buttons in google mode", () => {
    expect(authCardSource.includes("{isGoogleAuth && (")).toBe(true);
  });

  it("keeps the register branch behind the mode check", () => {
    expect(authCardSource.includes('if (mode === "register")')).toBe(
      true
    );
  });
});
