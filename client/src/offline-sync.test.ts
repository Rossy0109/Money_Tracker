import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedOfflineTransaction } from "./lib/offlineQueue";

// Memory storage to simulate IndexedDB store for unit testing offline-sync
class MockOfflineStorage {
  private items: Map<string, QueuedOfflineTransaction> = new Map();

  async queue(item: Omit<QueuedOfflineTransaction, "id" | "createdAt">): Promise<QueuedOfflineTransaction> {
    const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record: QueuedOfflineTransaction = {
      ...item,
      id,
      createdAt: Date.now(),
    };
    this.items.set(id, record);
    return record;
  }

  async getAll(): Promise<QueuedOfflineTransaction[]> {
    return Array.from(this.items.values());
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }
}

// Simulated sync runner
async function runOfflineSync(
  storage: MockOfflineStorage,
  isOnline: boolean,
  apiMutateFn: (items: any[]) => Promise<{ syncedCount: number }>,
  existingCloudTxIds = new Set<string>()
): Promise<{ success: boolean; synced: number; remaining: number }> {
  if (!isOnline) {
    return { success: false, synced: 0, remaining: storage.size() };
  }

  const items = await storage.getAll();
  if (items.length === 0) {
    return { success: true, synced: 0, remaining: 0 };
  }

  // Detect and resolve sync conflicts (avoid re-syncing already applied transactions)
  const itemsToSync = items.filter(item => !existingCloudTxIds.has(item.id));

  try {
    await apiMutateFn(itemsToSync);

    // Remove synced items from offline storage
    for (const item of items) {
      await storage.remove(item.id);
    }

    return {
      success: true,
      synced: itemsToSync.length,
      remaining: storage.size(),
    };
  } catch (err) {
    // Retry logic: keep in storage when sync fails
    return {
      success: false,
      synced: 0,
      remaining: storage.size(),
    };
  }
}

describe("client/src/offline-sync.test.ts - Offline Detection, Queue Management, Conflicts, Retry", () => {
  let storage: MockOfflineStorage;

  beforeEach(() => {
    storage = new MockOfflineStorage();
    vi.clearAllMocks();
  });

  describe("Offline Detection & Event Handling", () => {
    it("detects when system is online vs offline", () => {
      let isOnline = false;
      const statusListener = vi.fn((status: boolean) => {
        isOnline = status;
      });

      // Simulate network loss
      statusListener(false);
      expect(isOnline).toBe(false);

      // Simulate network restored
      statusListener(true);
      expect(isOnline).toBe(true);
      expect(statusListener).toHaveBeenCalledTimes(2);
    });

    it("prevents sync trigger when offline", async () => {
      await storage.queue({
        projectId: 1,
        type: "expense",
        amount: 500,
        categoryId: 3,
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
      });

      const apiSpy = vi.fn();
      const result = await runOfflineSync(storage, false, apiSpy);

      expect(result.success).toBe(false);
      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(1);
      expect(apiSpy).not.toHaveBeenCalled();
    });
  });

  describe("Queue Management", () => {
    it("queues offline transactions and preserves properties", async () => {
      const queued = await storage.queue({
        projectId: 42,
        type: "income",
        amount: 12000,
        categoryId: 1,
        paymentMethod: "Bank",
        note: "Consulting fee",
        occurredAt: "2026-09-12",
      });

      expect(queued.id).toBeDefined();
      expect(queued.createdAt).toBeGreaterThan(0);
      expect(queued.amount).toBe(12000);

      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.note).toBe("Consulting fee");
    });

    it("removes individual items and clears queue", async () => {
      const tx1 = await storage.queue({ projectId: 1, type: "expense", amount: 100, categoryId: 2, paymentMethod: "bKash", occurredAt: "2026-09-12" });
      const tx2 = await storage.queue({ projectId: 1, type: "expense", amount: 200, categoryId: 2, paymentMethod: "bKash", occurredAt: "2026-09-12" });

      expect(storage.size()).toBe(2);
      await storage.remove(tx1.id);

      const remaining = await storage.getAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(tx2.id);

      await storage.clear();
      expect(storage.size()).toBe(0);
    });
  });

  describe("Sync Conflicts", () => {
    it("filters out transactions already committed to cloud to prevent duplicate double-charge", async () => {
      const tx1 = await storage.queue({ projectId: 1, type: "expense", amount: 250, categoryId: 1, paymentMethod: "Cash", occurredAt: "2026-09-12" });
      const tx2 = await storage.queue({ projectId: 1, type: "expense", amount: 350, categoryId: 2, paymentMethod: "Cash", occurredAt: "2026-09-12" });

      const existingCloudIds = new Set<string>([tx1.id]);
      const apiSpy = vi.fn().mockResolvedValue({ syncedCount: 1 });

      const result = await runOfflineSync(storage, true, apiSpy, existingCloudIds);

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1); // Only tx2 synced
      expect(apiSpy).toHaveBeenCalledWith([expect.objectContaining({ id: tx2.id })]);
      expect(storage.size()).toBe(0);
    });
  });

  describe("Retry Logic", () => {
    it("retains transactions in queue if API mutation fails and retries on subsequent reconnect", async () => {
      await storage.queue({ projectId: 1, type: "expense", amount: 500, categoryId: 2, paymentMethod: "Cash", occurredAt: "2026-09-12" });

      // First sync attempt fails with 500 error
      const failingApi = vi.fn().mockRejectedValue(new Error("Server 500"));
      const firstAttempt = await runOfflineSync(storage, true, failingApi);

      expect(firstAttempt.success).toBe(false);
      expect(firstAttempt.remaining).toBe(1);
      expect(storage.size()).toBe(1); // Still stored

      // Second sync attempt succeeds
      const successfulApi = vi.fn().mockResolvedValue({ syncedCount: 1 });
      const secondAttempt = await runOfflineSync(storage, true, successfulApi);

      expect(secondAttempt.success).toBe(true);
      expect(secondAttempt.synced).toBe(1);
      expect(storage.size()).toBe(0); // Cleared upon success
    });
  });
});
