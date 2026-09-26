import { describe, expect, it } from "vitest";
import { isSecureRequest } from "./cookies";

describe("isSecureRequest", () => {
  it("returns false for undefined or missing request", () => {
    expect(isSecureRequest()).toBe(false);
    expect(isSecureRequest(undefined)).toBe(false);
  });

  it("returns true for direct HTTPS", () => {
    expect(
      isSecureRequest({
        protocol: "https",
        headers: {},
        hostname: "example.com",
      } as any)
    ).toBe(true);
  });

  it("returns true when x-forwarded-proto is https (single header)", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: { "x-forwarded-proto": "https" },
        hostname: "example.com",
      } as any)
    ).toBe(true);
  });

  it("returns true when x-forwarded-proto contains https in a comma list", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: { "x-forwarded-proto": "http, https" },
        hostname: "example.com",
      } as any)
    ).toBe(true);
  });

  it("returns false for plain http on a non-loopback host", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: {},
        hostname: "evil.example.com",
      } as any)
    ).toBe(false);
  });

  it("returns true for plain http on localhost", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: {},
        hostname: "localhost",
      } as any)
    ).toBe(true);
  });

  it("returns true for plain http on 127.0.0.1", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: {},
        hostname: "127.0.0.1",
      } as any)
    ).toBe(true);
  });

  it("returns true for plain http on ::1 (with and without brackets)", () => {
    expect(
      isSecureRequest({
        protocol: "http",
        headers: {},
        hostname: "::1",
      } as any)
    ).toBe(true);
    expect(
      isSecureRequest({
        protocol: "http",
        headers: {},
        hostname: "[::1]",
      } as any)
    ).toBe(true);
  });
});
