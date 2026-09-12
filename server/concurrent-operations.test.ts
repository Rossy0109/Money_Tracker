import { beforeEach, describe, expect, it } from "vitest";

// Mutex / Lock helper for coordinating concurrent transaction processing
class AsyncLock {
  private promise: Promise<void> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const nextPromise = new Promise<void>(resolve => {
      release = resolve;
    });

    const previousPromise = this.promise;
    this.promise = nextPromise;

    await previousPromise;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

// In-memory concurrent account ledger simulator
class ConcurrentLedger {
  private balance = 1000;
  private processedTransactions = new Set<string>();
  private version = 1;
  private lock = new AsyncLock();

  getBalance(): number {
    return this.balance;
  }

  getVersion(): number {
    return this.version;
  }

  // Idempotency token to prevent double-click submissions in rapid concurrent requests
  async submitTransactionWithIdempotency(
    idempotencyKey: string,
    amount: number,
    type: "income" | "expense"
  ): Promise<{ success: boolean; balance: number; reason?: string }> {
    return this.lock.acquire(async () => {
      // Check duplicate idempotency key
      if (this.processedTransactions.has(idempotencyKey)) {
        return { success: false, balance: this.balance, reason: "Duplicate submission ignored" };
      }

      if (type === "expense" && this.balance < amount) {
        return { success: false, balance: this.balance, reason: "Insufficient balance" };
      }

      // Small async tick to simulate I/O delay
      await new Promise(res => setTimeout(res, 5));

      if (type === "income") {
        this.balance += amount;
      } else {
        this.balance -= amount;
      }

      this.processedTransactions.add(idempotencyKey);
      this.version += 1;

      return { success: true, balance: this.balance };
    });
  }

  // Optimistic concurrency control (OCC) simulation
  async updateWithOptimisticLock(
    expectedVersion: number,
    amountDelta: number
  ): Promise<{ success: boolean; currentVersion: number }> {
    return this.lock.acquire(async () => {
      if (this.version !== expectedVersion) {
        return { success: false, currentVersion: this.version };
      }
      this.balance += amountDelta;
      this.version += 1;
      return { success: true, currentVersion: this.version };
    });
  }
}

describe("server/concurrent-operations.test.ts", () => {
  let ledger: ConcurrentLedger;

  beforeEach(() => {
    ledger = new ConcurrentLedger();
  });

  describe("Critical: Rapid Double-Click & Idempotency", () => {
    it("handles multiple concurrent identical requests without duplicate deductions", async () => {
      const idempotencyKey = "tx-uuid-1001";
      
      // Simulate 5 simultaneous clicks on a payment / transaction button
      const attempts = await Promise.all([
        ledger.submitTransactionWithIdempotency(idempotencyKey, 200, "expense"),
        ledger.submitTransactionWithIdempotency(idempotencyKey, 200, "expense"),
        ledger.submitTransactionWithIdempotency(idempotencyKey, 200, "expense"),
        ledger.submitTransactionWithIdempotency(idempotencyKey, 200, "expense"),
        ledger.submitTransactionWithIdempotency(idempotencyKey, 200, "expense"),
      ]);

      const successCount = attempts.filter(a => a.success).length;
      const duplicateCount = attempts.filter(a => a.reason === "Duplicate submission ignored").length;

      expect(successCount).toBe(1);
      expect(duplicateCount).toBe(4);
      expect(ledger.getBalance()).toBe(800); // Only deducted once
    });
  });

  describe("Critical: Atomic Balance & Race Conditions", () => {
    it("safely serializes concurrent mixed deposits and withdrawals", async () => {
      // Initial balance is 1000
      // 5 concurrent deposits of 100 (+500)
      // 4 concurrent withdrawals of 150 (-600)
      // Expected final balance: 1000 + 500 - 600 = 900
      const operations: Array<Promise<{ success: boolean; balance: number }>> = [];

      for (let i = 0; i < 5; i++) {
        operations.push(ledger.submitTransactionWithIdempotency(`dep-${i}`, 100, "income"));
      }
      for (let i = 0; i < 4; i++) {
        operations.push(ledger.submitTransactionWithIdempotency(`with-${i}`, 150, "expense"));
      }

      const results = await Promise.all(operations);
      expect(results.every(r => r.success)).toBe(true);
      expect(ledger.getBalance()).toBe(900);
    });

    it("prevents negative balances under concurrent race condition", async () => {
      // Initial balance is 1000
      // 3 concurrent attempts to withdraw 600
      // Only 1 should succeed, 2 should fail with Insufficient balance
      const attempts = await Promise.all([
        ledger.submitTransactionWithIdempotency("req-1", 600, "expense"),
        ledger.submitTransactionWithIdempotency("req-2", 600, "expense"),
        ledger.submitTransactionWithIdempotency("req-3", 600, "expense"),
      ]);

      const successful = attempts.filter(a => a.success);
      const failed = attempts.filter(a => !a.success && a.reason === "Insufficient balance");

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(2);
      expect(ledger.getBalance()).toBe(400);
      expect(ledger.getBalance()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Critical: Optimistic Concurrency Control (OCC)", () => {
    it("rejects outdated writes when concurrent update changes version", async () => {
      const initialVersion = ledger.getVersion(); // 1

      // Two workers read the same version
      const worker1Version = initialVersion;
      const worker2Version = initialVersion;

      // Worker 1 writes first
      const res1 = await ledger.updateWithOptimisticLock(worker1Version, 100);
      expect(res1.success).toBe(true);
      expect(ledger.getVersion()).toBe(2);

      // Worker 2 attempts to write with stale version (1)
      const res2 = await ledger.updateWithOptimisticLock(worker2Version, 200);
      expect(res2.success).toBe(false);
      expect(res2.currentVersion).toBe(2);
    });
  });

  describe("Critical: Concurrent Offline Sync Playback", () => {
    it("resolves and plays offline operations in sequence without deadlocks", async () => {
      const offlineQueue = [
        { id: "off-1", amount: 50, type: "income" as const },
        { id: "off-2", amount: 300, type: "expense" as const },
        { id: "off-3", amount: 150, type: "income" as const },
        { id: "off-4", amount: 200, type: "expense" as const },
      ];

      // Playback simultaneously
      const syncResults = await Promise.all(
        offlineQueue.map(item =>
          ledger.submitTransactionWithIdempotency(item.id, item.amount, item.type)
        )
      );

      expect(syncResults.every(r => r.success)).toBe(true);
      // 1000 + 50 - 300 + 150 - 200 = 700
      expect(ledger.getBalance()).toBe(700);
    });
  });
});
