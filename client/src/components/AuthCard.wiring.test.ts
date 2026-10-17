import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/AuthCard.tsx"),
  "utf8"
);

/**
 * Regression pins for the authentication card:
 *  - exactly one email/password divider (a conditional copy
 *    used to duplicate it in Google-auth mode),
 *  - every label is programmatically associated with its input,
 *  - the icon-only password toggle has an accessible name and
 *    exposes its pressed state,
 *  - the role and mode segmented buttons expose their pressed
 *    state instead of colour alone,
 *  - native validation bubbles must not preempt the Bengali
 *    validation messages in handleSubmit,
 *  - session-check failures surface a persistent, retryable
 *    notice instead of a bare login form.
 */
describe("AuthCard accessibility and error surfacing wiring", () => {
  it("renders exactly one email/password divider", () => {
    const dividers = source.match(/অথবা ইমেইল ও পাসওয়ার্ড/g) ?? [];
    expect(dividers).toHaveLength(1);
  });

  it("associates every label with its input", () => {
    expect(source).toContain('htmlFor="auth-name"');
    expect(source).toContain('id="auth-name"');
    expect(source).toContain('htmlFor="auth-email"');
    expect(source).toContain('id="auth-email"');
    expect(source).toContain('htmlFor="auth-password"');
    expect(source).toContain('id="auth-password"');
    expect(source).toContain('htmlFor="auth-confirm-password"');
    expect(source).toContain('id="auth-confirm-password"');
  });

  it("exposes the password visibility toggle name and state", () => {
    expect(
      source
    ).toContain('showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"');
    expect(source).toContain("aria-pressed={showPassword}");
  });

  it("marks the role and mode segmented buttons as toggles", () => {
    expect(source).toContain('aria-pressed={roleMode === "user"}');
    expect(source).toContain('aria-pressed={roleMode === "admin"}');
    expect(source).toContain('aria-pressed={mode === "login"}');
    expect(source).toContain('aria-pressed={mode === "register"}');
  });

  it("disables native validation so Bengali messages stay authoritative", () => {
    expect(source).toMatch(
      /onSubmit=\{handleSubmit\}\s*\n\s*noValidate/
    );
  });

  it("accepts and renders session-check failures with a retry", () => {
    expect(source).toContain("sessionError?: string | null;");
    expect(source).toContain("onRetrySession?: () => void;");
    expect(source).toContain("{sessionError && (");
    expect(source).toContain("সেশন যাচাই করা যায়নি");
    expect(source).toContain("আবার চেষ্টা করুন");
  });
});
