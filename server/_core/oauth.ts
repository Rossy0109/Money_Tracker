import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parseCookie as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { timingSafeCompare } from "../timingSafe";
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
import { hashPassword, verifyPasswordConstantTime } from "./passwordAuth";
import {
  GITHUB_CALLBACK_PATH,
  GITHUB_LOGIN_PATH,
  GITHUB_TRANSACTION_COOKIE,
  createGitHubAuthorizationUrl,
  createGitHubTransaction,
  encodeGitHubTransaction,
  exchangeGitHubAuthorizationCode,
  fetchGitHubUser,
  githubTransactionCookieMaxAge,
  readGitHubTransaction,
  transactionMatchesGitHubState,
} from "./githubOAuth";
import logger from "./logger";

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

      const passwordHash = await hashPassword(password);
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Auth Register] Failed");
      res.status(400).json({ error: "রেজিস্ট্রেশন সম্পন্ন করা যায়নি" });
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
      const credentialsValid = await verifyPasswordConstantTime(password, user?.passwordHash);
      if (!user || !credentialsValid) {
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Auth Login] Failed");
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Google OAuth] Login initialization failed");
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
      const normalizedEmail = (identity.email || "").trim().toLowerCase();
      const role = bootstrapEmail && timingSafeCompare(normalizedEmail, bootstrapEmail) ? "admin" : undefined;

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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[Google OAuth] Callback failed");
      res.status(401).json({ error: "Google sign-in could not be verified" });
    }
  });

  // GitHub OAuth login endpoint
  app.get(GITHUB_LOGIN_PATH, (req: Request, res: Response) => {
    if (!process.env.GITHUB_CLIENT_ID) {
      res.status(503).json({ error: "GitHub OAuth is not configured on this server" });
      return;
    }
    try {
      const transaction = createGitHubTransaction();
      const options = getOAuthTransactionCookieOptions(req);
      res.cookie(GITHUB_TRANSACTION_COOKIE, encodeGitHubTransaction(transaction), {
        ...options,
        maxAge: githubTransactionCookieMaxAge,
      });
      const redirectUri = `${req.protocol}://${req.get("host")}${GITHUB_CALLBACK_PATH}`;
      res.redirect(302, createGitHubAuthorizationUrl(transaction, redirectUri));
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[GitHub OAuth] Login initialization failed");
      res.status(503).json({ error: "GitHub sign-in is temporarily unavailable" });
    }
  });

  // GitHub OAuth callback endpoint
  app.get(GITHUB_CALLBACK_PATH, async (req: Request, res: Response) => {
    if (!process.env.GITHUB_CLIENT_ID) {
      res.status(503).json({ error: "GitHub OAuth is not configured" });
      return;
    }

    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const transaction = readGitHubTransaction(req);
    const transactionCookieOptions = getOAuthTransactionCookieOptions(req);

    if (!code || !transaction || !transactionMatchesGitHubState(transaction, state)) {
      res.status(403).json({ error: "invalid github oauth state" });
      return;
    }
    res.clearCookie(GITHUB_TRANSACTION_COOKIE, transactionCookieOptions);

    try {
      const accessToken = await exchangeGitHubAuthorizationCode(code);
      const identity = await fetchGitHubUser(accessToken);

      const bootstrapEmail = (ENV.adminBootstrapEmail || "").trim().toLowerCase();
      const normalizedEmail = (identity.email || "").trim().toLowerCase();
      const role = bootstrapEmail && timingSafeCompare(normalizedEmail, bootstrapEmail) ? "admin" : undefined;

      await db.upsertUser({
        openId: identity.openId,
        name: identity.name,
        email: identity.email,
        loginMethod: "github",
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, "[GitHub OAuth] Callback failed");
      res.status(401).json({ error: "GitHub sign-in could not be verified" });
    }
  });
}
