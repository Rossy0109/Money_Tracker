import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadLatestBackupObject } from "./backupDownload";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "S3_BUCKET_NAME",
  "AWS_S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "AWS_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "S3_REGION",
  "S3_ENDPOINT",
] as const;

const saved: Record<string, string | undefined> = {};

function clearEnv() {
  for (const name of ENV_KEYS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
}

function restoreEnv() {
  for (const name of ENV_KEYS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function envelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    formatVersion: "finance-encrypted-cloud-backup-v1",
    checksum: "a".repeat(64),
    projectId: 7,
    projectName: "My App",
    timestamp: "2026-10-01T00:00:00.000Z",
    iv: "bb",
    encrypted: "cc",
    tag: "dd",
    ...overrides,
  });
}

const s3Send = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = s3Send;
  },
  ListObjectsV2Command: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

beforeEach(() => {
  clearEnv();
  s3Send.mockReset();
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

describe("downloadLatestBackupObject", () => {
  it("reports why nothing could be read when no provider is configured", async () => {
    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toBeNull();
    expect(result.miss).toContain("no readable backup provider");
  });

  it("lists the bucket root and downloads the newest matching object", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const fetchMock = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const href = String(url);
        if (href.includes("/storage/v1/object/list/")) {
          // Supabase treats a file-name prefix as a folder path, so
          // the listing is always against the bucket root.
          expect(JSON.parse(String(init?.body))).toMatchObject({
            prefix: "",
          });
          return new Response(
            JSON.stringify([
              { name: "unrelated-note.txt" },
              { name: "My-App-backup-2026-09-01-11111111.enc.json" },
              { name: "project-9-backup-2026-10-01-99999999.enc.json" },
              { name: "My-App-backup-2026-10-01-22222222.enc.json" },
            ]),
            { status: 200 }
          );
        }
        expect(href).toContain(
          "/storage/v1/object/amar-hisab-backups/My-App-backup-2026-10-01-22222222.enc.json"
        );
        expect((init?.headers as Record<string, string>).Authorization).toBe(
          "Bearer service-key"
        );
        return new Response(envelope(), { status: 200 });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toMatchObject({
      provider: "supabase",
      fileName: "My-App-backup-2026-10-01-22222222.enc.json",
    });
    expect(result.object?.payload).toContain(
      "finance-encrypted-cloud-backup-v1"
    );
    expect(result.miss).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says when the bucket holds nothing for the project's prefix", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          { name: "project-9-backup-2026-10-01-99999999.enc.json" },
        ]),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toBeNull();
    expect(result.miss).toContain(
      'project 7 "My App"'
    );
    expect(result.miss).toContain("none start with \"My-App-backup-\"");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips objects that belong to another project sharing the name prefix", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/storage/v1/object/list/")) {
        return new Response(
          JSON.stringify([
            { name: "My-App-backup-2026-10-01-33333333.enc.json" },
          ]),
          { status: 200 }
        );
      }
      expect(href).toContain("My-App-backup-2026-10-01-33333333.enc.json");
      // Same truncated prefix, different project.
      return new Response(
        envelope({ projectId: 9, projectName: "My Application" }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toBeNull();
    expect(result.miss).toContain("My-App-backup-2026-10-01-33333333.enc.json");
    expect(result.miss).toContain('is for project 9 "My Application"');
  });

  it("surfaces a failed Supabase listing instead of pretending the bucket is empty", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 }))
    );

    await expect(
      downloadLatestBackupObject({ projectName: "My App", projectId: 7 })
    ).rejects.toThrow(/Supabase listing failed \(500/);
  });

  it("downloads from S3 with the same credentials and key prefix as the upload", async () => {
    process.env.S3_BUCKET_NAME = "my-bucket";
    process.env.S3_ACCESS_KEY_ID = "access";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_REGION = "eu-central-1";

    s3Send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "backups/My-App-backup-2026-10-01-44444444.enc.json" },
        ],
      })
      .mockResolvedValueOnce({
        Body: { transformToString: async () => envelope() },
      });

    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toMatchObject({
      provider: "s3",
      fileName: "My-App-backup-2026-10-01-44444444.enc.json",
    });
    expect(result.miss).toBeNull();
    expect(s3Send).toHaveBeenCalledTimes(2);
    const listCall = s3Send.mock.calls[0][0] as {
      input: { Bucket: string; Prefix: string };
    };
    expect(listCall.input).toMatchObject({
      Bucket: "my-bucket",
      Prefix: "backups/My-App-backup-",
    });
  });

  it("reports why S3 holds nothing under the project's prefix", async () => {
    process.env.S3_BUCKET_NAME = "my-bucket";
    process.env.S3_ACCESS_KEY_ID = "access";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    s3Send.mockResolvedValueOnce({ Contents: [] });

    const result = await downloadLatestBackupObject({
      projectName: "My App",
      projectId: 7,
    });
    expect(result.object).toBeNull();
    expect(result.miss).toContain(
      'project 7 "My App"'
    );
    expect(result.miss).toContain('under "My-App-backup-"');
    expect(s3Send).toHaveBeenCalledTimes(1);
  });
});
