import type { Express, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.GOOGLE_DRIVE_CLIENT_ID = "drive-client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = "drive-client-secret";
  process.env.GOOGLE_DRIVE_REDIRECT_URI =
    "https://app.example.com/api/drive/oauth/callback";
  process.env.GOOGLE_DRIVE_TOKEN_KEY = "unit-test-drive-token-key";
});

vi.mock("./sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));
vi.mock("../backupDb", () => ({
  upsertDriveConnection: vi.fn(async () => {}),
  getDriveConnection: vi.fn(async () => null),
}));
vi.mock("../drive/driveApi", () => ({
  ensureDriveFolder: vi.fn(async () => ({ id: "folder-1" })),
}));
vi.mock("../db", () => ({
  logAudit: vi.fn(async () => {}),
}));

import { sdk } from "./sdk";
import { upsertDriveConnection } from "../backupDb";
import { ensureDriveFolder } from "../drive/driveApi";
import {
  DRIVE_CALLBACK_PATH,
  DRIVE_LOGIN_PATH,
  DRIVE_TRANSACTION_COOKIE,
  createDriveTransaction,
  encodeDriveTransaction,
} from "../drive/driveOAuth";
import { registerDriveRoutes } from "./driveRoutes";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

function captureRoutes() {
  const handlers: Record<
    string,
    (req: Request, res: Response) => Promise<void> | void
  > = {};
  registerDriveRoutes({
    get: (path: string, handler: never) => {
      handlers[path] = handler;
    },
  } as unknown as Express);
  return handlers;
}

function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  res.redirect.mockReturnValue(res);
  return res;
}

const handlers = captureRoutes();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/drive/oauth/start", () => {
  it("401s when the caller is not authenticated", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("no session")
    );
    const res = mockRes();
    await handlers[DRIVE_LOGIN_PATH](
      { headers: {}, query: {} } as unknown as Request,
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("sets a transaction cookie and redirects to Google consent", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
    });
    const res = mockRes();
    await handlers[DRIVE_LOGIN_PATH](
      { headers: {}, query: {} } as unknown as Request,
      res as unknown as Response
    );

    expect(res.cookie).toHaveBeenCalledWith(
      DRIVE_TRANSACTION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    const redirectUrl = new URL(String(res.redirect.mock.calls[0][1]));
    expect(redirectUrl.hostname).toBe("accounts.google.com");
    expect(redirectUrl.searchParams.get("scope")).toContain("drive.file");
    expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("GET /api/drive/oauth/callback", () => {
  it("403s on a state mismatch", async () => {
    const transaction = createDriveTransaction(7);
    const res = mockRes();
    await handlers[DRIVE_CALLBACK_PATH](
      {
        headers: {
          cookie: `${DRIVE_TRANSACTION_COOKIE}=${encodeDriveTransaction(
            transaction
          )}`,
        },
        query: { code: "code-1", state: "wrong-state" },
      } as unknown as Request,
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(upsertDriveConnection).not.toHaveBeenCalled();
  });

  it("persists the connection and redirects on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          access_token: "at-1",
          refresh_token: "rt-1",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.file",
        })
      )
    );
    const transaction = createDriveTransaction(7);
    const res = mockRes();
    await handlers[DRIVE_CALLBACK_PATH](
      {
        headers: {
          cookie: `${DRIVE_TRANSACTION_COOKIE}=${encodeDriveTransaction(
            transaction
          )}`,
        },
        query: { code: "code-1", state: transaction.state },
      } as unknown as Request,
      res as unknown as Response
    );

    expect(ensureDriveFolder).toHaveBeenCalledWith(
      "at-1",
      "Money_Tracker",
      null
    );
    expect(upsertDriveConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        rootFolderId: "folder-1",
        accessTokenEnc: expect.any(String),
        refreshTokenEnc: expect.any(String),
      })
    );
    expect(res.redirect).toHaveBeenCalledWith(302, "/health?drive=connected");
  });

  it("redirects with an error when the token exchange fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 400)));
    const transaction = createDriveTransaction(7);
    const res = mockRes();
    await handlers[DRIVE_CALLBACK_PATH](
      {
        headers: {
          cookie: `${DRIVE_TRANSACTION_COOKIE}=${encodeDriveTransaction(
            transaction
          )}`,
        },
        query: { code: "code-1", state: transaction.state },
      } as unknown as Request,
      res as unknown as Response
    );
    expect(res.redirect).toHaveBeenCalledWith(302, "/health?drive=error");
    expect(upsertDriveConnection).not.toHaveBeenCalled();
  });
});
