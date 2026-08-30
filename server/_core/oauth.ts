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
import { hashPassword, verifyPassword } from "./passwordAuth";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Direct email & password registration endpoint
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body || {};
      if (!email || typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ error: "সঠিক ইমেইল ঠিকানা দিন" });
        return;
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে" });
        return;
      }

      const passwordHash = hashPassword(password);
      const user = await db.createPasswordUser({
        name: typeof name === "string" ? name : "",
        email,
        passwordHash,
      });

      if (user.status === "pending") {
        res.status(201).json({
          success: true,
          pendingApproval: true,
          message: "রেজিস্ট্রেশন সফল হয়েছে! আপনার অ্যাকাউন্টটি বর্তমানে অ্যাডমিন অনুমোদনের অপেক্ষায় রয়েছে। অনুমোদন পাওয়ার পর আপনি লগইন করতে পারবেন।",
          user: null,
        });
        return;
      }

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.status(201).json({
        success: true,
        pendingApproval: false,
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error("[Auth Register] Failed:", error);
      res.status(400).json({ error: error.message || "রেজিস্ট্রেশন সম্পন্ন করা যায়নি" });
    }
  });

  // Direct email & password login endpoint
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || typeof email !== "string" || !password || typeof password !== "string") {
        res.status(400).json({ error: "ইমেইল এবং পাসওয়ার্ড দিন" });
        return;
      }

      const user = await db.getUserByEmail(email);
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "ভুল ইমেইল অথবা পাসওয়ার্ড। আবার চেষ্টা করুন।" });
        return;
      }

      if (user.status === "pending") {
        res.status(403).json({
          error: "আপনার অ্যাকাউন্টটি এখনও অ্যাডমিন কর্তৃক অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের জন্য অপেক্ষা করুন।",
        });
        return;
      }

      if (user.status === "suspended") {
        res.status(403).json({
          error: "আপনার অ্যাকাউন্টটি স্থগিত (Suspended) করা হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
        });
        return;
      }

      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      console.error("[Auth Login] Failed:", error);
      res.status(500).json({ error: "লগইন প্রক্রিয়া ব্যর্থ হয়েছে" });
    }
  });

  // Direct logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.status(200).json({ success: true });
  });

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
