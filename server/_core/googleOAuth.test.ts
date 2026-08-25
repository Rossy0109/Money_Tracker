import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleTransaction,
  decodeGoogleTransaction,
  encodeGoogleTransaction,
  transactionMatchesState,
  validateGoogleIdTokenClaims,
} from "./googleOAuth";

const audience = "staging-client-id.apps.googleusercontent.com";
const now = 1_800_000_000;
const nonce = "n".repeat(43);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: audience,
    exp: now + 60,
    sub: "1234567890",
    nonce,
    email: "Owner@Example.test",
    email_verified: true,
    name: "স্টেজিং মালিক",
    ...overrides,
  };
}

describe("Google OAuth transaction and ID-token claim boundary", () => {
  it("generates an opaque, round-trippable state/nonce/PKCE transaction", () => {
    const transaction = createGoogleTransaction();
    const decoded = decodeGoogleTransaction(encodeGoogleTransaction(transaction));

    expect(decoded).toEqual(transaction);
    expect(transaction.state).not.toContain("/");
    expect(transaction.nonce.length).toBeGreaterThanOrEqual(32);
    expect(transaction.verifier.length).toBeGreaterThanOrEqual(64);
  });

  it("rejects malformed transaction cookies and mismatched callback state", () => {
    const transaction = createGoogleTransaction();

    expect(decodeGoogleTransaction("not-a-cookie")).toBeNull();
    expect(decodeGoogleTransaction(undefined)).toBeNull();
    expect(transactionMatchesState(transaction, transaction.state)).toBe(true);
    expect(transactionMatchesState(transaction, `${transaction.state}x`)).toBe(false);
    expect(transactionMatchesState(null, transaction.state)).toBe(false);
  });

  it("creates the stable internal principal only for verified Google claims", () => {
    expect(validateGoogleIdTokenClaims(validClaims(), nonce, audience, now)).toEqual({
      openId: "google:1234567890",
      email: "owner@example.test",
      name: "স্টেজিং মালিক",
    });
  });

  it("builds the configured Google authorization request server-side with PKCE and no client secret", async () => {
    vi.stubEnv("AUTH_MODE", "google");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", audience);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "server-only-test-secret");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "https://preview.example.test/api/auth/google/callback");
    vi.stubEnv("SESSION_SECRET", "staging-session-secret");
    const { createGoogleAuthorizationUrl, createGoogleTransaction } = await import("./googleOAuth");
    const url = new URL(
      createGoogleAuthorizationUrl(
        {
          issuer: "https://accounts.google.com",
          authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          token_endpoint: "https://oauth2.googleapis.com/token",
          jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        },
        createGoogleTransaction(),
      ),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(audience);
    expect(url.searchParams.get("redirect_uri")).toBe("https://preview.example.test/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.toString()).not.toContain("server-only-test-secret");
  });

  it.each([
    ["nonce", { nonce: "wrong-nonce" }],
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "other-client" }],
    ["expiry", { exp: now }],
    ["unverified email", { email_verified: false }],
    ["missing subject", { sub: "" }],
  ])("fails closed for an invalid %s claim", (_label, overrides) => {
    expect(() => validateGoogleIdTokenClaims(validClaims(overrides), nonce, audience, now)).toThrow(
      "Google ID token claims are invalid",
    );
  });
});
