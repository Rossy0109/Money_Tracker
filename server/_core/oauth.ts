import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getOAuthTransactionCookieOptions, getSessionCookieOptions } from "./cookies";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_LOGIN_PATH,
  GOOGLE_TRANSACTION_COOKIE,
  createGoogleAuthorizationUrl,
  createGoogleTransaction,
  encodeGoogleTransaction,
  exchangeGoogleAuthorizationCode,
  getGoogleDiscovery,
  googleTransactionCookieMaxAge,
  readGoogleTransaction,
  transactionMatchesState,
  verifyGoogleIdToken,
} from "./googleOAuth";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.get(GOOGLE_LOGIN_PATH, async (req: Request, res: Response) => {
    if (ENV.authMode !== "google") {
      res.status(404).json({ error: "Google OAuth is not enabled" });
      return;
    }
    try {
      const transaction = createGoogleTransaction();
      const discovery = await getGoogleDiscovery();
      const options = getOAuthTransactionCookieOptions(req);
      res.cookie(GOOGLE_TRANSACTION_COOKIE, encodeGoogleTransaction(transaction), {
        ...options,
        maxAge: googleTransactionCookieMaxAge,
      });
      res.redirect(302, createGoogleAuthorizationUrl(discovery, transaction));
    } catch (error) {
      console.error("[Google OAuth] Login initialization failed", String(error));
      res.status(503).json({ error: "Google sign-in is temporarily unavailable" });
    }
  });

  app.get(GOOGLE_CALLBACK_PATH, async (req: Request, res: Response) => {
    if (ENV.authMode !== "google") {
      res.status(404).json({ error: "Google OAuth is not enabled" });
      return;
    }

    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const transaction = readGoogleTransaction(req);
    const transactionCookieOptions = getOAuthTransactionCookieOptions(req);
    if (!code || !transaction || !transactionMatchesState(transaction, state)) {
      res.status(403).json({ error: "invalid google oauth state" });
      return;
    }
    res.clearCookie(GOOGLE_TRANSACTION_COOKIE, transactionCookieOptions);

    try {
      const discovery = await getGoogleDiscovery();
      const idToken = await exchangeGoogleAuthorizationCode(code, transaction, discovery);
      const identity = await verifyGoogleIdToken(idToken, transaction, discovery);
      const bootstrapEmail = ENV.adminBootstrapEmail.trim().toLowerCase();
      const role = bootstrapEmail && identity.email === bootstrapEmail ? "admin" : undefined;

      await db.upsertUser({
        openId: identity.openId,
        name: identity.name,
        email: identity.email,
        loginMethod: "google",
        ...(role ? { role } : {}),
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(identity.openId, {
        name: identity.name ?? identity.email,
        expiresInMs: ONE_YEAR_MS,
      });
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Google OAuth] Callback failed", String(error));
      res.status(401).json({ error: "Google sign-in could not be verified" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
