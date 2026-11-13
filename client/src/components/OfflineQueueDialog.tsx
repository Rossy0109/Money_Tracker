import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  clearOfflineQueue,
  getQueuedOfflineTransactions,
  removeQueuedOfflineTransaction,
  type QueuedOfflineTransaction,
} from "@/lib/offlineQueue";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface OfflineQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncNow?: () => Promise<void>;
  isOnline: boolean;
  isSyncing?: boolean;
}

export function OfflineQueueDialog({
  open,
  onOpenChange,
  onSyncNow,
  isOnline,
  isSyncing = false,
}: OfflineQueueDialogProps) {
  const [items, setItems] = useState<QueuedOfflineTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await getQueuedOfflineTransactions();
      setItems(data.sort((a, b) => b.createdAt - a.createdAt));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadItems();
    }
  }, [open]);

  useEffect(() => {
    const handleQueueChanged = () => {
      if (open) {
        loadItems();
      }
    };
    window.addEventListener("offline-queue-changed", handleQueueChanged);
    return () => {
      window.removeEventListener("offline-queue-changed", handleQueueChanged);
    };
  }, [open]);

  const handleDeleteItem = async (id: string) => {
    await removeQueuedOfflineTransaction(id);
    setItems(prev => prev.filter(item => item.id !== id));
    toast.success("অফলাইন লেনদেনটি মুছে ফেলা হয়েছে");
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (window.confirm("আপনি কি নিশ্চিত যে সমস্ত অফলাইন লেনদেন ড্রাফট মুছে ফেলতে চান?")) {
      await clearOfflineQueue();
      setItems([]);
      toast.success("সমস্ত অফলাইন ড্রাফট মুছে ফেলা হয়েছে");
    }
  };

  const handleSync = async () => {
    if (!isOnline) {
      toast.error("ইন্টারনেট সংযোগ নেই। সংযোগ ফিরলে চেষ্টা করুন।");
      return;
    }
    if (onSyncNow) {
      await onSyncNow();
      await loadItems();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              অফলাইন লেনদেন ড্রাফট কিউ
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              মোট: {items.length}টি
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            ইন্টারনেট বিচ্ছিন্ন অবস্থায় সংরক্ষিত লেনদেনসমূহ। ইন্টারনেট সংযোগ পেলে এগুলি স্বয়ংক্রিয়ভাবে ক্লাউডে সিঙ্ক হয়ে যাবে।
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-3 min-h-[160px] max-h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              ড্রাফট লোড হচ্ছে...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground space-y-1">
              <Clock className="h-8 w-8 opacity-40 mb-2" />
              <p className="font-medium">কোনো পেন্ডিং অফলাইন লেনদেন নেই</p>
              <p className="text-xs text-muted-foreground/75">
                সব লেনদেন ক্লাউডের সাথে সম্পূর্ণরূপে সিঙ্ক করা আছে।
              </p>
            </div>
          ) : (
            items.map(item => {
              const isIncome = item.type === "income";
              const dateStr = item.occurredAt
                ? new Date(item.occurredAt).toLocaleDateString("bn-BD", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "আজ";

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/50 hover:bg-muted/40 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          ৳{Number(item.amount).toLocaleString("bn-BD")}
                        </span>
                        <Badge
                          variant={isIncome ? "default" : "secondary"}
                          className={`text-[10px] py-0 px-1.5 ${
                            isIncome
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : ""
                          }`}
                        >
                          {isIncome ? "আয়" : "ব্যয়"}
                        </Badge>
                        {item.status === "failed" && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] py-0 px-1.5 flex items-center gap-1"
                          >
                            <AlertCircle className="h-2.5 w-2.5" />
                            সিঙ্ক ব্যর্থ
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 truncate">
                        <span>{dateStr}</span>
                        {item.paymentMethod && <span>• {item.paymentMethod}</span>}
                        {item.note && <span className="truncate">• {item.note}</span>}
                      </div>
                      {item.lastError && (
                        <p className="text-[11px] text-destructive mt-0.5 truncate">
                          ত্রুটি: {item.lastError}
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteItem(item.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                    aria-label="মুছে ফেলুন"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={items.length === 0 || isSyncing}
            className="text-xs rounded-xl text-destructive hover:text-destructive"
          >
            সব মুছুন
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl"
            >
              বন্ধ করুন
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSync}
              disabled={!isOnline || items.length === 0 || isSyncing}
              className="text-xs rounded-xl flex items-center gap-1.5 bg-primary"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "সিঙ্ক হচ্ছে..." : "এখনই সিঙ্ক করুন"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
