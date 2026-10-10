import { describe, expect, it } from "vitest";
import {
  buildSyncChunks,
  SYNC_CHUNK_SIZE,
} from "./useOfflineSync";

describe("buildSyncChunks", () => {
  it("returns no chunks for empty input", () => {
    expect(buildSyncChunks([])).toEqual([]);
  });

  it("keeps a small batch in one chunk", () => {
    const items = [1, 2, 3];
    const chunks = buildSyncChunks(items);
    expect(chunks).toEqual([[1, 2, 3]]);
  });

  it("splits an oversized batch into 500-item chunks", () => {
    const items = Array.from({ length: 1250 }, (_, i) => i);
    const chunks = buildSyncChunks(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(SYNC_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(SYNC_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(250);
  });

  it("produces an exact-size final chunk for a multiple of the cap", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const chunks = buildSyncChunks(items);
    expect(chunks).toHaveLength(2);
    expect(chunks.every(c => c.length === SYNC_CHUNK_SIZE)).toBe(true);
  });

  it("preserves order across chunks", () => {
    const items = Array.from({ length: 600 }, (_, i) => i);
    const chunks = buildSyncChunks(items);
    expect(chunks.flat()).toEqual(items);
  });

  it("honours a custom max", () => {
    const items = [1, 2, 3, 4, 5];
    expect(buildSyncChunks(items, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("degrades safely for a nonsensical max", () => {
    const items = [1, 2, 3];
    expect(buildSyncChunks(items, 0)).toEqual([items]);
  });
});
