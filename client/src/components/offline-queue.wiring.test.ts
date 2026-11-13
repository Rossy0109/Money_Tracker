import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  resolve(process.cwd(), "client/src/components/DashboardLayout.tsx"),
  "utf8"
);
const homeSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/Home.tsx"),
  "utf8"
);
const dialogSource = readFileSync(
  resolve(process.cwd(), "client/src/components/OfflineQueueDialog.tsx"),
  "utf8"
);
const queueSource = readFileSync(
  resolve(process.cwd(), "client/src/lib/offlineQueue.ts"),
  "utf8"
);

describe("PWA offline write queue wiring (F-01)", () => {
  it("mounts OfflineQueueDialog and exposes draft queue actions in the dashboard shell", () => {
    expect(layoutSource).toContain("OfflineQueueDialog");
    expect(layoutSource).toContain("showOfflineQueue");
    expect(layoutSource).toContain("ড্রাফট কিউ");
    expect(layoutSource).toContain("এখনই সিঙ্ক করুন");
  });

  it("handles offline queuing in IndexedDB with status and retry support", () => {
    expect(queueSource).toContain("ahmed_finance_offline_db");
    expect(queueSource).toContain("offline_transactions");
    expect(queueSource).toContain("updateQueuedOfflineTransaction");
    expect(queueSource).toContain("getOfflineQueueStats");
    expect(queueSource).toContain("offline-queue-changed");
  });

  it("automatically catches network failures on transaction submission and queues offline", () => {
    expect(homeSource).toContain("queueOfflineTransaction");
    expect(homeSource).toContain("failed to fetch");
    expect(homeSource).toContain("networkerror");
    expect(homeSource).toContain("নেটওয়ার্ক সংযোগ বিচ্ছিন্ন হওয়ায় লেনদেনটি অফলাইনে সংরক্ষিত হয়েছে");
  });

  it("renders offline queue drawer with delete, clear-all, and sync-now actions", () => {
    expect(dialogSource).toContain("getQueuedOfflineTransactions");
    expect(dialogSource).toContain("removeQueuedOfflineTransaction");
    expect(dialogSource).toContain("clearOfflineQueue");
    expect(dialogSource).toContain("isOnline");
    expect(dialogSource).toContain("ইন্টারনেট সংযোগ নেই");
    expect(dialogSource).toContain("সিঙ্ক ব্যর্থ");
  });
});
