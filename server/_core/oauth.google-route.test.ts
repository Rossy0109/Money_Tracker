import { createServer as createHttpServer, request as nodeRequest } from "node:http";
import { describe, expect, it, vi } from "vitest";

const stubDiscovery = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
};

function makeRequest(url: string): Promise<{ status: number; rawHeaders: string[]; location: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = nodeRequest(
      { 
        hostname: parsed.hostname, 
        port: parsed.port, 
        path: parsed.pathname, 
        method: "GET",
        headers: { Host: parsed.host }
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, rawHeaders: res.rawHeaders, location: res.headers.location ?? "" });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function getSetCookies(rawHeaders: string[]): string[] {
  const cookies: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === "set-cookie") cookies.push(rawHeaders[i + 1]);
  }
  return cookies;
}

describe("Google login route (google mode)", () => {
  let originalFetch: typeof globalThis.fetch;

  it("redirects to Google with localhost redirect_uri and sets Secure cookie", { timeout: 30000 }, async () => {
    vi.stubEnv("AUTH_MODE", "google");
    vi.stubEnv("VITE_AUTH_MODE", "google");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "http://127.0.0.1/api/auth/google/callback");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-minimum-32-chars");

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes("googleapis.com") || url.includes("accounts.google.com")) {
        return new Response(JSON.stringify(stubDiscovery), { status: 200 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const { createApiApp } = await import("./app");
    const app = createApiApp();
    const server = createHttpServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");

    try {
      const res = await makeRequest(`http://127.0.0.1:${address.port}/api/auth/google/login`);
      expect(res.status).toBe(302);
      expect(res.location).toContain("accounts.google.com/o/oauth2/v2/auth");

      const authUrl = new URL(res.location);
      expect(authUrl.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
      expect(authUrl.searchParams.get("redirect_uri")).toBe("http://127.0.0.1/api/auth/google/callback");
      expect(authUrl.searchParams.get("response_type")).toBe("code");
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();

      const cookies = getSetCookies(res.rawHeaders);
      const googleCookie = cookies.find(c => c.startsWith("__Host-google_oauth="));
      expect(googleCookie).toBeDefined();
      expect(googleCookie).toContain("Secure");
      expect(googleCookie).toContain("HttpOnly");
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())));
    }
  });

  it("returns 404 when AUTH_MODE is not google", { timeout: 30000 }, async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    // Leave AUTH_MODE unset → defaults to password
    const { createApiApp } = await import("./app");
    const app = createApiApp();
    const server = createHttpServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");

    try {
      const res = await makeRequest(`http://127.0.0.1:${address.port}/api/auth/google/login`);
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())));
    }
  });
});
