import { describe, expect, it, vi } from "vitest";

// ENV.backupEncryptionKey is captured at import time, so the key must exist
// before ./routers pulls in server/_core/env.
vi.hoisted(() => {
  process.env.BACKUP_ENCRYPTION_KEY = "restore-envelope-test-key";
});

import { appRouter } from "./routers";
import * as financeDb from "./db";
import {
  aesGcmEncrypt,
  bytesToHex,
  hexToBytes,
  randomBytesHex,
  sha256Hex,
} from "../shared/platform/crypto";

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, restoreProjectBackup: vi.fn() };
});

vi.mock("./_core/rbac", () => ({
  initializeRBAC: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
  hasAnyPermission: vi.fn().mockResolvedValue(true),
  hasAllPermissions: vi.fn().mockResolvedValue(true),
  hasRole: vi.fn().mockResolvedValue(true),
  getUserPermissions: vi.fn().mockResolvedValue([]),
  getUserRoles: vi.fn().mockResolvedValue([]),
  isAdminRoleUser: vi.fn().mockResolvedValue(true),
}));

const BACKUP_KEY = "restore-envelope-test-key";

const authenticatedContext = {
  user: {
    id: 42,
    openId: "finance-owner",
    email: "owner@example.com",
    name: "Owner",
    loginMethod: "google",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn() },
} as any;

function sampleBackup() {
  return {
    formatVersion: "finance-project-backup-v1" as const,
    exportedAt: "2026-10-01T00:00:00.000Z",
    project: { id: 7, name: "পরিবার" },
    accounts: [
      {
        id: 1,
        name: "নগদ",
        type: "cash" as const,
        openingBalance: 0,
        currentBalance: 0,
      },
    ],
    categories: [
      { id: 3, name: "খাবার", type: "expense" as const, isDefault: false },
    ],
    transactions: [
      {
        id: 5,
        accountId: 1,
        categoryId: 3,
        type: "expense" as const,
        amount: 100,
        paymentMethod: "নগদ",
        note: "চা",
        occurredAt: "2026-09-15T08:00:00.000Z",
      },
    ],
    budgets: [],
    bills: [],
    dues: [],
    settlements: [],
    recurring: [],
  };
}

async function sealBackup(
  plaintext: unknown,
  key = BACKUP_KEY
): Promise<Record<string, unknown>> {
  const rawJson = JSON.stringify(plaintext, null, 2);
  const iv = hexToBytes(randomBytesHex(12));
  const sealed = await aesGcmEncrypt(await sha256Hex(key), iv, rawJson);
  return {
    ...(plaintext as Record<string, unknown>),
    iv: bytesToHex(iv),
    encrypted: sealed.encrypted,
    tag: sealed.tag,
    checksum: await sha256Hex(rawJson),
  };
}

function caller() {
  return appRouter.createCaller(authenticatedContext);
}

describe("restore envelope verification through the router", () => {
  it("previews a plaintext export with no envelope (the app's own flow)", async () => {
    const preview = await caller().finance.previewProjectBackup({
      backup: sampleBackup() as any,
    });

    expect(preview.sourceProjectName).toBe("পরিবার");
    expect(preview.counts.transactions).toBe(1);
  });

  it("previews a sealed cloud backup, proving the schema keeps envelope fields", async () => {
    const sealed = await sealBackup(sampleBackup());

    const preview = await caller().finance.previewProjectBackup({
      backup: sealed as any,
    });

    expect(preview.sourceProjectName).toBe("পরিবার");
    expect(preview.counts.accounts).toBe(1);
  });

  it("rejects rows edited after decryption, before preview runs", async () => {
    const sealed = await sealBackup(sampleBackup());

    await expect(
      caller().finance.previewProjectBackup({
        backup: {
          ...sealed,
          transactions: [
            {
              ...sampleBackup().transactions[0],
              amount: 999_999,
            },
          ],
        } as any,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: /মূল ব্যাকআপের সাথে মেলেনি/,
    });
  });

  it("rejects a partially stripped envelope rather than skipping the check", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    delete sealed.tag;

    await expect(
      caller().finance.previewProjectBackup({ backup: sealed as any })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: /অসম্পূর্ণ/,
    });
  });

  it("rejects an incomplete envelope on restore without touching the database", async () => {
    const sealed = (await sealBackup(sampleBackup())) as Record<string, unknown>;
    delete sealed.checksum;

    await expect(
      caller().finance.restoreProjectBackup({
        projectName: "restored-copy",
        confirmation: "RESTORE_NEW_PROJECT",
        backup: sealed as any,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(financeDb.restoreProjectBackup).not.toHaveBeenCalled();
  });

  it("rejects a restore whose envelope was sealed with another key", async () => {
    const sealed = await sealBackup(sampleBackup(), "some-other-key");

    await expect(
      caller().finance.restoreProjectBackup({
        projectName: "restored-copy",
        confirmation: "RESTORE_NEW_PROJECT",
        backup: sealed as any,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: /ডিক্রিপ্ট/,
    });

    expect(financeDb.restoreProjectBackup).not.toHaveBeenCalled();
  });

  it("passes a verified envelope through to the restore path", async () => {
    const sealed = await sealBackup(sampleBackup());
    vi.mocked(financeDb.restoreProjectBackup).mockResolvedValue({
      projectId: 99,
      projectName: "restored-copy",
      counts: { accounts: 1, transactions: 1 },
    } as any);

    const result = await caller().finance.restoreProjectBackup({
      projectName: "restored-copy",
      confirmation: "RESTORE_NEW_PROJECT",
      backup: sealed as any,
    });

    expect(result).toMatchObject({ projectId: 99 });
    expect(financeDb.restoreProjectBackup).toHaveBeenCalledTimes(1);

    const [userId, args] = vi.mocked(financeDb.restoreProjectBackup).mock
      .calls[0]!;
    expect(userId).toBe(42);
    expect(args.projectName).toBe("restored-copy");
    const forwarded = args.backup as Record<string, any>;
    expect(forwarded.transactions).toHaveLength(1);
    expect(forwarded.transactions[0]).toMatchObject({
      id: 5,
      accountId: 1,
      categoryId: 3,
      amount: 100,
    });
    // zod coerces date fields before the database layer sees them.
    expect(forwarded.transactions[0].occurredAt).toBeInstanceOf(Date);
    expect(forwarded.transactions[0].occurredAt.toISOString()).toBe(
      "2026-09-15T08:00:00.000Z"
    );
    // Envelope fields ride along so the payload stays auditable.
    expect(forwarded.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
