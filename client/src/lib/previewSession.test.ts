import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import {
  SESSION_MIRROR_KEY,
  isPreviewHost,
  readMirroredSessionCookie,
} from "./previewSession";

describe("isPreviewHost", () => {
  it("allows loopback hosts", () => {
    expect(isPreviewHost("localhost")).toBe(true);
    expect(isPreviewHost("127.0.0.1")).toBe(true);
    expect(isPreviewHost("[::1]")).toBe(true);
    expect(isPreviewHost("LOCALHOST")).toBe(true);
  });

  it("allows Netlify deploy previews", () => {
    expect(
      isPreviewHost("deploy-preview-284--moneytrackerwebapp.netlify.app")
    ).toBe(true);
  });

  it("allows Vercel branch previews", () => {
    expect(
      isPreviewHost("money-tracker-git-fix-login-user.vercel.app")
    ).toBe(true);
  });

  it("rejects production-style hosts", () => {
    expect(isPreviewHost("app.example.com")).toBe(false);
    expect(isPreviewHost("moneytrackerwebapp.netlify.app")).toBe(false);
    // Plain Vercel production host (no -git- segment).
    expect(isPreviewHost("money-tracker.vercel.app")).toBe(false);
    expect(isPreviewHost("money-tracker.pages.dev")).toBe(false);
  });
});

describe("readMirroredSessionCookie", () => {
  function stubHost(
    hostname: string,
    getItem: (key: string) => string | null
  ) {
    vi.stubGlobal("window", {
      location: { hostname },
      sessionStorage: { getItem: vi.fn(getItem) },
    });
  }

  beforeEach(() => {
    stubHost("localhost", () => null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without a window (SSR)", () => {
    vi.unstubAllGlobals();
    expect(readMirroredSessionCookie()).toBeNull();
  });

  it("extracts the token from a mirrored cookie string on a preview host", () => {
    stubHost(
      "deploy-preview-1--site.netlify.app",
      () => `${COOKIE_NAME}=abc123; Path=/; HttpOnly`
    );
    expect(readMirroredSessionCookie()).toBe("abc123");
  });

  it("ignores the mirror entirely on production hosts", () => {
    const getItem = vi.fn(() => `${COOKIE_NAME}=abc123`);
    stubHost("app.example.com", getItem);
    expect(readMirroredSessionCookie()).toBeNull();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("returns null when the mirror is absent", () => {
    stubHost("localhost", () => null);
    expect(readMirroredSessionCookie()).toBeNull();
  });

  it("returns null when the mirror lacks the session cookie", () => {
    stubHost("localhost", () => "other=value");
    expect(readMirroredSessionCookie()).toBeNull();
  });

  it("swallows storage failures", () => {
    stubHost("localhost", () => {
      throw new Error("storage disabled");
    });
    expect(readMirroredSessionCookie()).toBeNull();
  });

  it("uses the documented mirror key", () => {
    expect(SESSION_MIRROR_KEY).toBe("auth-session-cookie");
  });
});
