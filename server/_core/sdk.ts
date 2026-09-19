import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS, decodeOAuthState } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parseCookie as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import logger from "./logger";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/oauthTypes";
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

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

interface OAuthProviderConfig {
  name: string;
  baseURL: string;
  exchangeTokenPath: string;
  getUserInfoPath: string;
  getUserInfoWithJwtPath?: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  authorizationEndpoint?: string;
  jwksUri?: string;
  issuer?: string[];
}

class OAuthService {
  private providers: Map<string, OAuthProviderConfig> = new Map();
  private defaultProvider: string;

  constructor(providers: OAuthProviderConfig[], defaultProvider: string) {
    this.providers = new Map(providers.map(p => [p.name, p]));
    this.defaultProvider = defaultProvider;
    
    for (const provider of providers) {
      logger.info({ name: provider.name, baseURL: provider.baseURL }, `[OAuth] Provider ${provider.name} initialized`);
    }
    
    if (!this.providers.has(defaultProvider)) {
      throw new Error(`Default provider "${defaultProvider}" not found in providers`);
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

  private decodeState(state: string): string {
    return decodeOAuthState(state).redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string,
    providerName?: string
  ): Promise<ExchangeTokenResponse> {
    const provider = this.getProvider(providerName);
    const payload: ExchangeTokenRequest = {
      clientId: provider.clientId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    if (provider.clientSecret) {
      (payload as any).clientSecret = provider.clientSecret;
    }

    const { data } = await this.getClient(provider).post<ExchangeTokenResponse>(
      provider.exchangeTokenPath,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse,
    providerName?: string
  ): Promise<GetUserInfoResponse> {
    const provider = this.getProvider(providerName);
    const { data } = await this.getClient(provider).post<GetUserInfoResponse>(
      provider.getUserInfoPath,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }

  private getClient(provider: OAuthProviderConfig): AxiosInstance {
    return axios.create({
      baseURL: provider.baseURL,
      timeout: AXIOS_TIMEOUT_MS,
    });
  }

  public getClientForProvider(providerName: string): AxiosInstance {
    const provider = this.getProvider(providerName);
    return this.getClient(provider);
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

function createOAuthService(): OAuthService {
  const providers: OAuthProviderConfig[] = [];
  
  // Google OAuth provider
  if (ENV.googleOAuthClientId && ENV.googleOAuthClientSecret && ENV.googleOAuthRedirectUri) {
    providers.push({
      name: "google",
      baseURL: "https://oauth2.googleapis.com",
      exchangeTokenPath: "/token",
      getUserInfoPath: "/oauth2/v2/userinfo",
      clientId: ENV.googleOAuthClientId,
      clientSecret: ENV.googleOAuthClientSecret,
    });
  }
  
  // Manus OAuth provider (optional)
  if (ENV.oAuthServerUrl) {
    providers.push({
      name: "manus",
      baseURL: ENV.oAuthServerUrl,
      exchangeTokenPath: EXCHANGE_TOKEN_PATH,
      getUserInfoPath: GET_USER_INFO_PATH,
      getUserInfoWithJwtPath: GET_USER_INFO_WITH_JWT_PATH,
      clientId: ENV.appId,
    });
  }
  
  // If no providers configured, create a mock provider for testing
  if (providers.length === 0) {
    providers.push({
      name: "mock",
      baseURL: "http://localhost",
      exchangeTokenPath: "/token",
      getUserInfoPath: "/userinfo",
      clientId: "mock-client-id",
    });
  }
  
  const defaultProvider = providers.find(p => p.name === "google") ? "google" : 
                          providers.find(p => p.name === "manus") ? "manus" : 
                          providers[0]?.name || "mock";
  
  return new OAuthService(providers, defaultProvider);
}

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = createOAuthService();
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state, "google");
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    providerName?: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state, providerName);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken, "google");
   */
  async getUserInfo(accessToken: string, providerName?: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse, providerName);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.authMode === "google" ? ENV.sessionSecret : ENV.cookieSecret;
    if (!secret) {
      throw new Error(
        ENV.authMode === "google"
          ? "SESSION_SECRET is required when AUTH_MODE=google"
          : "JWT_SECRET is required for Manus authentication",
      );
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
      if (ENV.authMode === "google" && availableProviders.includes("google")) {
        providerName = "google";
      } else if (ENV.authMode === "manus" && availableProviders.includes("manus")) {
        providerName = "manus";
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
      { expiresInMs: ACCESS_TOKEN_TTL_MS }
    );
  }

  async createRefreshToken(
    openId: string,
    options: { name?: string; providerName?: string } = {}
  ): Promise<string> {
    let providerName = options.providerName;
    if (!providerName) {
      const availableProviders = this.oauthService.listProviders();
      if (ENV.authMode === "google" && availableProviders.includes("google")) {
        providerName = "google";
      } else if (ENV.authMode === "manus" && availableProviders.includes("manus")) {
        providerName = "manus";
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
      logger.warn({ err: error instanceof Error ? error : new Error(String(error)) }, "[Auth] Session verification failed");
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string,
    providerName?: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const providerNameResolved = providerName ?? "google";
    const provider = this.oauthService.getProvider(providerName ?? "google");
    const client = this.oauthService.getClientForProvider(providerName ?? "google");
    const getUserInfoWithJwtPath = provider.getUserInfoWithJwtPath ?? GET_USER_INFO_WITH_JWT_PATH;
    const { data } = await client.post<GetUserInfoWithJwtResponse>(
      getUserInfoWithJwtPath,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
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

    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // Determine which OAuth provider was used based on user's login method or auth mode
    const providerName = user?.loginMethod === "google" ? "google" : 
                         user?.loginMethod === "manus" ? "manus" :
                         ENV.authMode;

    // If user not in DB, sync from OAuth server automatically
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "", providerName);
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Auth] Failed to sync user from OAuth");
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    return user;
  }
}

const CRON_OPEN_ID_PREFIX = "cron_";

/** Result of `sdk.authenticateRequest`. Cron callbacks set `isCron=true` and `taskUid`; see `/home/ubuntu/skills/webdev-periodic-updates/SKILL.md`. */
export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

function buildCronUser(
  userInfo: GetUserInfoWithJwtResponse
): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  } as AuthenticatedUser;
}

export const sdk = new SDKServer();
