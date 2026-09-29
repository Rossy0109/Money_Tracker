import { describe, expect, it } from "vitest";
import {
  GITHUB_CALLBACK_PATH,
  GITHUB_LOGIN_PATH,
  GITHUB_TRANSACTION_COOKIE,
  createGitHubTransaction,
  decodeGitHubTransaction,
  encodeGitHubTransaction,
} from "./githubOAuth";

describe("GitHub OAuth transaction codec", () => {
  it("creates unique states of sufficient length", () => {
    const first = createGitHubTransaction();
    const second = createGitHubTransaction();
    expect(first.state.length).toBeGreaterThanOrEqual(32);
    expect(first.state).not.toBe(second.state);
  });

  it("round-trips through encode/decode", () => {
    const transaction = createGitHubTransaction();
    expect(decodeGitHubTransaction(encodeGitHubTransaction(transaction))).toEqual(
      transaction
    );
  });

  it("rejects missing, corrupt, and short states", () => {
    expect(decodeGitHubTransaction(undefined)).toBeNull();
    expect(decodeGitHubTransaction("")).toBeNull();
    expect(decodeGitHubTransaction("!!!not-base64!!!")).toBeNull();
    expect(
      decodeGitHubTransaction(encodeGitHubTransaction({ state: "short" }))
    ).toBeNull();
    expect(
      decodeGitHubTransaction(
        Buffer.from(JSON.stringify({ nope: 1 })).toString("base64url")
      )
    ).toBeNull();
  });

  it("exposes stable route constants", () => {
    expect(GITHUB_LOGIN_PATH).toBe("/api/auth/github/login");
    expect(GITHUB_CALLBACK_PATH).toBe("/api/auth/github/callback");
    expect(GITHUB_TRANSACTION_COOKIE).toBe("__Host-github_oauth");
  });
});
