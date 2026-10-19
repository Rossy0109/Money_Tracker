import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRIVE_FOLDER_MIME,
  ensureDriveFolder,
  findDriveFileByName,
  uploadDriveFile,
} from "./driveApi";

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
const fetchMock = (impl: FetchLike) => vi.fn(impl);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findDriveFileByName", () => {
  it("builds a scoped query and returns the first file id", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({ files: [{ id: "file-9", name: "f" }] })
    );
    const found = await findDriveFileByName(
      "tok",
      "Backups",
      "parent-1",
      DRIVE_FOLDER_MIME,
      fetchImpl as unknown as typeof fetch
    );
    expect(found).toEqual({ id: "file-9" });

    const calledUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    const q = calledUrl.searchParams.get("q") ?? "";
    expect(q).toContain("name = 'Backups'");
    expect(q).toContain("trashed = false");
    expect(q).toContain(`mimeType = '${DRIVE_FOLDER_MIME}'`);
    expect(q).toContain("'parent-1' in parents");
  });

  it("escapes single quotes in the name", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ files: [] }));
    await findDriveFileByName(
      "tok",
      "O'Brien",
      null,
      undefined,
      fetchImpl as unknown as typeof fetch
    );
    const q = new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get("q");
    expect(q).toContain("name = 'O\\'Brien'");
  });

  it("returns null when nothing matches and throws on a failed list", async () => {
    const empty = fetchMock(async () => jsonResponse({ files: [] }));
    await expect(
      findDriveFileByName("tok", "x", null, undefined, empty as unknown as typeof fetch)
    ).resolves.toBeNull();

    const failing = fetchMock(async () => jsonResponse({}, false, 500));
    await expect(
      findDriveFileByName("tok", "x", null, undefined, failing as unknown as typeof fetch)
    ).rejects.toThrow(/list failed/);
  });

  it("requires a token", async () => {
    await expect(findDriveFileByName("", "x", null)).rejects.toThrow(
      /access token is required/
    );
  });
});

describe("ensureDriveFolder", () => {
  it("reuses an existing folder without creating one", async () => {
    const fetchImpl = fetchMock(async () =>
      jsonResponse({ files: [{ id: "existing-folder" }] })
    );
    const folder = await ensureDriveFolder(
      "tok",
      "Money_Tracker",
      null,
      fetchImpl as unknown as typeof fetch
    );
    expect(folder).toEqual({ id: "existing-folder" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("creates the folder when absent", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({}));
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "new-folder" }));
    const folder = await ensureDriveFolder(
      "tok",
      "Money_Tracker",
      null,
      fetchImpl as unknown as typeof fetch
    );
    expect(folder).toEqual({ id: "new-folder" });

    const createInit = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      name: "Money_Tracker",
      mimeType: DRIVE_FOLDER_MIME,
    });
  });

  it("throws when the create response has no id", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({}));
    fetchImpl
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({}));
    await expect(
      ensureDriveFolder("tok", "f", null, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/no id/);
  });
});

describe("uploadDriveFile", () => {
  it("posts a multipart/related body and returns the new id", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({ id: "uploaded-1" }));
    const result = await uploadDriveFile(
      "tok",
      { folderId: "folder-1", name: "backup.enc.json", content: "{}" },
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ id: "uploaded-1" });

    const [rawUrl, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get("uploadType")).toBe("multipart");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["content-type"]).toMatch(/multipart\/related; boundary=/);
    const body = String((init as RequestInit).body);
    expect(body).toContain('"name":"backup.enc.json"');
    expect(body).toContain('"parents":["folder-1"]');
  });

  it("throws when the upload fails", async () => {
    const fetchImpl = fetchMock(async () => jsonResponse({}, false, 403));
    await expect(
      uploadDriveFile(
        "tok",
        { name: "f", content: "{}" },
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow(/upload failed/);
  });
});
