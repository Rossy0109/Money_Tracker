import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { getQueuedOfflineTransactions, removeQueuedOfflineTransaction } from "@/lib/offlineQueue";
import { toast } from "sonner";

export function useOfflineSync() {
  const { activeProjectId } = useActiveProject();
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);

  const utils = trpc.useUtils();
  const syncMutation = trpc.finance.syncOfflineTransactions.useMutation();

  const syncQueue = async () => {
    if (!activeProjectId || !navigator.onLine) return;

    try {
      const items = await getQueuedOfflineTransactions();
      const projectItems = items.filter(item => item.projectId === activeProjectId);
      setPendingCount(projectItems.length);

      if (projectItems.length === 0) return;

      toast.info(`অফলাইন সংরক্ষিত ${projectItems.length}টি লেনদেন সিঙ্ক হচ্ছে...`);

      const payload = projectItems.map(item => ({
        projectId: item.projectId,
        accountId: item.accountId,
        categoryId: item.categoryId,
        type: item.type,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        note: item.note,
        occurredAt: new Date(item.occurredAt),
      }));

      await syncMutation.mutateAsync({
        projectId: activeProjectId,
        items: payload,
      });

      for (const item of projectItems) {
        await removeQueuedOfflineTransaction(item.id);
      }

      setPendingCount(0);
      toast.success(`${projectItems.length}টি অফলাইন লেনদেন ক্লাউডে সিঙ্ক সম্পন্ন হয়েছে!`);
      utils.finance.overview.invalidate();
    } catch {
      // Sync failed, keep in queue for next reconnect
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("ইন্টারনেট সংযোগ বিচ্ছিন্ন। লেনদেন অফলাইনে সংরক্ষিত হবে।");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    getQueuedOfflineTransactions().then(items => {
      if (activeProjectId) {
        setPendingCount(items.filter(i => i.projectId === activeProjectId).length);
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [activeProjectId]);

  return {
    isOnline,
    pendingCount,
    syncQueue,
  };
}
