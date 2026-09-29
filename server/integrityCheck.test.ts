import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./backupDb", () => ({
  countProjectRecords: vi.fn(),
  lastBackupForKind: vi.fn(),
}));

vi.mock("./db", () => ({
  listProjects: vi.fn(),
}));

import { countProjectRecords, lastBackupForKind } from "./backupDb";
import { listProjects } from "./db";
import { runIntegrityCheck } from "./integrityCheck";

const mockCounts = vi.mocked(countProjectRecords);
const mockLastBackup = vi.mocked(lastBackupForKind);
const mockProjects = vi.mocked(listProjects);

beforeEach(() => {
  vi.clearAllMocks();
  mockProjects.mockResolvedValue([{ id: 2, name: "P" }] as never);
  mockCounts.mockResolvedValue({ transactions: 5 });
});

describe("runIntegrityCheck", () => {
  it("reports NO_BACKUP without a backup row", async () => {
    mockLastBackup.mockResolvedValue(null);
    const result = await runIntegrityCheck(1, 2);
    expect(result.status).toBe("NO_BACKUP");
    expect(result.projectName).toBe("P");
    expect(result.liveCounts).toEqual({ transactions: 5 });
    expect(result.manifestCounts).toBeNull();
    expect(result.diffs).toEqual([]);
  });

  it("falls back to the id label for unknown projects", async () => {
    mockLastBackup.mockResolvedValue(null);
    mockProjects.mockResolvedValue([]);
    const result = await runIntegrityCheck(1, 99);
    expect(result.projectName).toBe("#99");
  });

  it("reports MISMATCH on corrupt manifests", async () => {
    mockLastBackup.mockResolvedValue({
      verifiedAt: new Date(),
      backupId: "1",
      fileName: "b.enc.json",
      recordCountsJson: "{corrupt",
    });
    const result = await runIntegrityCheck(1, 2);
    expect(result.status).toBe("MISMATCH");
    expect(result.manifestCounts).toBeNull();
  });

  it("reports VERIFIED on matching counts", async () => {
    mockLastBackup.mockResolvedValue({
      verifiedAt: new Date(),
      backupId: "1",
      fileName: "b.enc.json",
      recordCountsJson: JSON.stringify({ transactions: 5 }),
    });
    const result = await runIntegrityCheck(1, 2);
    expect(result.status).toBe("VERIFIED");
    expect(result.diffs).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("lists diffs and manifest-only entities", async () => {
    mockLastBackup.mockResolvedValue({
      verifiedAt: new Date(),
      backupId: "1",
      fileName: "b.enc.json",
      recordCountsJson: JSON.stringify({ transactions: 4, ghosts: 1 }),
    });
    const result = await runIntegrityCheck(1, 2);
    expect(result.status).toBe("MISMATCH");
    expect(result.diffs).toContainEqual({
      entity: "transactions",
      live: 5,
      manifest: 4,
    });
    expect(result.missing).toEqual(["ghosts"]);
  });
});
