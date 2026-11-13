import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import {
  getQueuedOfflineTransactions,
  removeQueuedOfflineTransaction,
  updateQueuedOfflineTransaction,
} from "@/lib/offlineQueue";
import { toast } from "sonner";

/**
 * Server-side cap for finance.syncOfflineTransactions items
 * (z.array(...).max(500)). Offline batches larger than this are
 * synced in sequential chunks so one oversized batch is never
 * rejected wholesale.
 */
export const SYNC_CHUNK_SIZE = 500;

/**
 * Split queued items into chunks of at most `max` items, preserving
 * order. Pure function — unit-tested directly (node environment).
 */
export function buildSyncChunks<T>(items: T[], max = SYNC_CHUNK_SIZE): T[][] {
  if (items.length === 0) return [];
  if (max <= 0) return [items];
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += max) {
    chunks.push(items.slice(start, start + max));
  }
  return chunks;
}

export function useOfflineSync() {
  const { activeProjectId } = useActiveProject();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);

  const utils = trpc.useUtils();
  const syncMutation = trpc.finance.syncOfflineTransactions.useMutation();
  const { mutateAsync: syncMutateAsync } = syncMutation;

  const refreshCount = useCallback(async () => {
    try {
      const items = await getQueuedOfflineTransactions();
      if (activeProjectId) {
        setPendingCount(
          items.filter(i => i.projectId === activeProjectId).length
        );
      } else {
        setPendingCount(items.length);
      }
    } catch {
      // Ignore
    }
  }, [activeProjectId]);

  const syncQueue = useCallback(async () => {
    if (!activeProjectId || !navigator.onLine || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const items = await getQueuedOfflineTransactions();
      const projectItems = items.filter(
        item => item.projectId === activeProjectId
      );
      setPendingCount(projectItems.length);

      if (projectItems.length === 0) {
        isSyncingRef.current = false;
        setIsSyncing(false);
        return;
      }

      toast.info(
        `অফলাইন সংরক্ষিত ${projectItems.length}টি লেনদেন সিঙ্ক হচ্ছে...`
      );

      let syncedTotal = 0;
      // Server caps one sync call at SYNC_CHUNK_SIZE items; chunk and
      // clear each chunk only after it is durably synced, so a failure
      // partway through leaves exactly the unsynced remainder queued.
      for (const chunk of buildSyncChunks(projectItems)) {
        const payload = chunk.map(item => ({
          projectId: item.projectId,
          accountId: item.accountId,
          categoryId: item.categoryId,
          type: item.type,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          note: item.note,
          occurredAt: new Date(item.occurredAt),
          idempotencyKey: item.id,
        }));

        try {
          await syncMutateAsync({
            projectId: activeProjectId,
            items: payload,
          });

          for (const item of chunk) {
            await removeQueuedOfflineTransaction(item.id);
          }
          syncedTotal += chunk.length;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          for (const item of chunk) {
            await updateQueuedOfflineTransaction(item.id, {
              status: "failed",
              lastError: errMsg,
            });
          }
          throw err;
        }
      }

      setPendingCount(0);
      toast.success(
        `${syncedTotal}টি অফলাইন লেনদেন ক্লাউডে সিঙ্ক সম্পন্ন হয়েছে!`
      );
      utils.finance.overview.invalidate();
    } catch {
      // Sync failed, keep in queue for next reconnect
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      refreshCount();
    }
  }, [activeProjectId, refreshCount, syncMutateAsync, utils]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("ইন্টারনেট সংযোগ বিচ্ছিন্ন। লেনদেন অফলাইনে সংরক্ষিত হবে।");
    };

    const handleQueueChanged = () => {
      refreshCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-queue-changed", handleQueueChanged);

    // Asynchronous initial check so setState is deferred to the resolved promise microtask
    void getQueuedOfflineTransactions().then(items => {
      if (activeProjectId) {
        setPendingCount(
          items.filter(i => i.projectId === activeProjectId).length
        );
      } else {
        setPendingCount(items.length);
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
    };
  }, [activeProjectId, refreshCount, syncQueue]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncQueue,
    refreshCount,
  };
}
