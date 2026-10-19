import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import logger from "./logger";
import { getOAuthTransactionCookieOptions } from "./cookies";
import {
  DRIVE_CALLBACK_PATH,
  DRIVE_LOGIN_PATH,
  DRIVE_TRANSACTION_COOKIE,
  buildDriveAuthorizationUrl,
  createDriveTransaction,
  driveTransactionCookieMaxAge,
  encodeDriveTransaction,
  exchangeDriveAuthorizationCode,
  encryptDriveToken,
  isDriveConfigured,
  readDriveTransaction,
  transactionMatchesState,
} from "../drive/driveOAuth";
import { ensureDriveFolder } from "../drive/driveApi";
import { upsertDriveConnection } from "../backupDb";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Registers the Google Drive *backup* OAuth routes.
 *
 * Deliberately separate from the sign-in flow: connecting Drive requires an
 * already-authenticated session, and the resulting tokens are bound to that
 * user id via a signed-host cookie (HttpOnly, `__Host-`), never a client value.
 */
export function registerDriveRoutes(app: Express) {
  app.get(DRIVE_LOGIN_PATH, async (req: Request, res: Response) => {
    if (!isDriveConfigured()) {
      res
        .status(503)
        .json({ error: "Google Drive integration is not configured" });
      return;
    }

    let userId: number | null;
    try {
      const user = await sdk.authenticateRequest(req);
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const requestedFolder = getQueryParam(req, "folder");
    try {
      const transaction = createDriveTransaction(userId, requestedFolder);
      res.cookie(
        DRIVE_TRANSACTION_COOKIE,
        encodeDriveTransaction(transaction),
        {
          ...getOAuthTransactionCookieOptions(req),
          maxAge: driveTransactionCookieMaxAge,
        }
      );
      res.redirect(302, await buildDriveAuthorizationUrl(transaction));
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        "[Drive OAuth] Initialization failed"
      );
      res
        .status(503)
        .json({ error: "Google Drive connection is temporarily unavailable" });
    }
  });

  app.get(DRIVE_CALLBACK_PATH, async (req: Request, res: Response) => {
    if (!isDriveConfigured()) {
      res
        .status(503)
        .json({ error: "Google Drive integration is not configured" });
      return;
    }

    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const transaction = readDriveTransaction(req);
    const cookieOptions = getOAuthTransactionCookieOptions(req);
    if (!code || !transaction || !transactionMatchesState(transaction, state)) {
      res.status(403).json({ error: "invalid google drive oauth state" });
      return;
    }
    res.clearCookie(DRIVE_TRANSACTION_COOKIE, cookieOptions);

    try {
      const tokens = await exchangeDriveAuthorizationCode(code, transaction);
      const folder = await ensureDriveFolder(
        tokens.accessToken,
        transaction.rootFolderName,
        null
      );

      await upsertDriveConnection({
        userId: transaction.userId,
        rootFolderName: transaction.rootFolderName,
        rootFolderId: folder.id,
        scope: tokens.scope,
        accessTokenEnc: await encryptDriveToken(tokens.accessToken),
        refreshTokenEnc: tokens.refreshToken
          ? await encryptDriveToken(tokens.refreshToken)
          : null,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      });

      try {
        await db.logAudit({
          actorUserId: transaction.userId,
          actorRole: "user",
          action: "update",
          entityType: "backup",
          summary: `Google Drive connected for cloud backups (folder: ${transaction.rootFolderName})`,
        });
      } catch {
        // Non-blocking audit failure.
      }

      res.redirect(302, "/health?drive=connected");
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        "[Drive OAuth] Callback failed"
      );
      res.redirect(302, "/health?drive=error");
    }
  });
}
