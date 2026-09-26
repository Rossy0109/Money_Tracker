import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parseCookie as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import logger from "./logger";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

interface OAuthProviderConfig {
  name: string;
  clientId: string;
  clientSecret?: string;
}

class OAuthService {
  private providers: Map<string, OAuthProviderConfig> = new Map();
  private defaultProvider: string;

  constructor(providers: OAuthProviderConfig[], defaultProvider: string) {
    this.providers = new Map(providers.map(p => [p.name, p]));
    this.defaultProvider = defaultProvider;

    for (const provider of providers) {
      logger.info(
        { name: provider.name },
        `[OAuth] Provider ${provider.name} initialized`
      );
    }

    if (!this.providers.has(defaultProvider)) {
      throw new Error(
        `Default provider "${defaultProvider}" not found in providers`
      );
    }
  }

  getProvider(name?: string): OAuthProviderConfig {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider "${providerName}" not configured`);
    }
    return provider;
  }

  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

function createOAuthService(): OAuthService {
  const providers: OAuthProviderConfig[] = [];

  // Google OAuth provider
  if (ENV.googleOAuthClientId) {
    providers.push({
      name: "google",
      clientId: ENV.googleOAuthClientId,
      clientSecret: ENV.googleOAuthClientSecret || undefined,
    });
  }

  // If no providers configured, create a mock provider for testing
  if (providers.length === 0) {
    providers.push({
      name: "mock",
      clientId: "mock-client-id",
    });
  }

  const defaultProvider = providers.find(p => p.name === "google")
    ? "google"
    : providers[0]?.name || "mock";

  return new OAuthService(providers, defaultProvider);
}

class SDKServer {
  private readonly oauthService: OAuthService;

  constructor() {
    this.oauthService = createOAuthService();
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.sessionSecret;
    if (!secret) {
      throw new Error("SESSION_SECRET is required");
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId, { providerName: "google" });
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; providerName?: string } = {}
  ): Promise<string> {
    // Determine the provider to use - prefer the one specified, then check authMode, then fall back to available providers
    let providerName = options.providerName;
    if (!providerName) {
      // Check which providers are available and use an appropriate default
      const availableProviders = this.oauthService.listProviders();
      if (availableProviders.includes("google")) {
        providerName = "google";
      } else if (availableProviders.length > 0) {
        providerName = availableProviders[0];
      } else {
        throw new Error("No OAuth providers configured");
      }
    }
    const provider = this.oauthService.getProvider(providerName);
    return this.signSession(
      {
        openId,
        appId: provider.clientId,
        name: options.name || "",
      },
      // Honor the caller's requested TTL (login flows pass ONE_YEAR_MS to match
      // the session cookie). Falling back to the 15-minute access-token default
      // caused JWTs to expire while the cookie was still valid.
      { expiresInMs: options.expiresInMs ?? ACCESS_TOKEN_TTL_MS }
    );
  }

  async createRefreshToken(
    openId: string,
    options: { name?: string; providerName?: string } = {}
  ): Promise<string> {
    let providerName = options.providerName;
    if (!providerName) {
      const availableProviders = this.oauthService.listProviders();
      if (availableProviders.includes("google")) {
        providerName = "google";
      } else if (availableProviders.length > 0) {
        providerName = availableProviders[0];
      } else {
        throw new Error("No OAuth providers configured");
      }
    }
    const provider = this.oauthService.getProvider(providerName);
    return this.signSession(
      {
        openId,
        appId: provider.clientId,
        name: options.name || "",
      },
      { expiresInMs: REFRESH_TOKEN_TTL_MS }
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ACCESS_TOKEN_TTL_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
    if (!cookieValue) {
      logger.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        logger.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
      };
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error : new Error(String(error)) },
        "[Auth] Session verification failed"
      );
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // 1. Prefer the session cookie (regular OAuth login).
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken: string | undefined = cookies.get(COOKIE_NAME);

    // 2. Fallback to the Authorization header (Preview auto-login via
    //    sessionStorage), used when the browser blocks iframe cookies such as
    //    Safari ITP, private browsing, or iOS/Android WebView.
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    // Session revocation: stateless JWT alone is not enough — honor the
    // user_sessions table so logout / password-reset can kill live tokens.
    if (sessionToken) {
      const [revoked] = await db.findRevokedSessionByToken(sessionToken);
      if (revoked) {
        logger.warn(
          { openId: session.openId },
          "[Auth] Rejected revoked session token"
        );
        throw ForbiddenError("Session has been revoked");
      }
    }

    const sessionUserId = session.openId;
    const user = await db.getUserByOpenId(sessionUserId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    return user;
  }
}

/** Result of `sdk.authenticateRequest`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

export const sdk = new SDKServer();
