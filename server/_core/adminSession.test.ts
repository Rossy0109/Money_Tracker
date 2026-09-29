import { describe, expect, it } from "vitest";
import {
  issueAdminToken,
  verifyAdminToken,
  extractAdminTokenFromRequest,
} from "./adminSession";
import { ADMIN_SESSION_COOKIE } from "../../shared/const";

describe("Admin Elevation Session Management", () => {
  it("issues and verifies a valid HMAC admin token", async () => {
    const token = await issueAdminToken(1, "system-owner", 15 * 60 * 1000);
    expect(token).toBeDefined();

    const payload = await verifyAdminToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(1);
    expect(payload?.openId).toBe("system-owner");
    expect(payload?.role).toBe("admin");
    expect(payload?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("rejects tampered admin tokens in constant time", async () => {
    const token = await issueAdminToken(1, "system-owner", 15 * 60 * 1000);
    const [payload, signature] = token.split(".");

    // Tamper with signature
    const tamperedSig =
      signature.slice(0, -2) + (signature.slice(-2) === "00" ? "ff" : "00");
    expect(await verifyAdminToken(`${payload}.${tamperedSig}`)).toBeNull();

    // Tamper with payload
    const modifiedPayload = Buffer.from(
      JSON.stringify({
        userId: 2,
        openId: "attacker",
        role: "admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
      })
    ).toString("base64url");
    expect(await verifyAdminToken(`${modifiedPayload}.${signature}`)).toBeNull();
  });

  it("rejects expired admin tokens", async () => {
    // Expired 1 second ago
    const token = await issueAdminToken(1, "system-owner", -1000);
    expect(await verifyAdminToken(token)).toBeNull();
  });

  it("extracts token from cookie or x-admin-token or AdminBearer header", () => {
    const token = "mock.signed.token";

    // From cookie
    const reqCookie = {
      headers: {
        cookie: `${ADMIN_SESSION_COOKIE}=${token}; other=value`,
      },
    } as any;
    expect(extractAdminTokenFromRequest(reqCookie)).toBe(token);

    // From x-admin-token header
    const reqHeader = {
      headers: {
        "x-admin-token": token,
      },
    } as any;
    expect(extractAdminTokenFromRequest(reqHeader)).toBe(token);

    // From AdminBearer authorization
    const reqAuth = {
      headers: {
        authorization: `AdminBearer ${token}`,
      },
    } as any;
    expect(extractAdminTokenFromRequest(reqAuth)).toBe(token);
  });
});
