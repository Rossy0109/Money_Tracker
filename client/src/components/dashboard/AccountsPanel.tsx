import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Empty } from "@/components/dashboard/DashboardMetrics";
import { bdt } from "./types";
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AccountItem =
  inferRouterOutputs<AppRouter>["finance"]["overview"]["accounts"][number];

interface AccountsPanelProps {
  accounts: AccountItem[];
  onAdd: () => void;
  onEdit: (account: AccountItem) => void;
  onDelete: (id: number) => void;
}

export function AccountsPanel({
  accounts,
  onAdd,
  onEdit,
  onDelete,
}: AccountsPanelProps) {
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  return (
    <article id="accounts" className="scroll-mt-20 finance-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">অ্যাকাউন্ট</p>
          <h2 className="section-title">টাকার উৎস</h2>
        </div>
        <Button
          size="icon"
          onClick={onAdd}
          variant="outline"
          className="rounded-xl"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {accounts.length ? (
          accounts.map(account => (
            <div
              key={account.id}
              className="rounded-xl bg-[#f5f8f5] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[#183d34]">
                    {account.name}
                  </p>
                  <p className="mt-1 text-sm text-[#668076]">
                    {account.type === "cash"
                      ? "নগদ"
                      : account.type === "bank"
                        ? "ব্যাংক"
                        : "মোবাইল ব্যাংকিং"}{" "}
                    · {bdt(account.currentBalance)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEdit(account)}
                  >
                    সম্পাদনা
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[#b64040] hover:text-[#8d2b2b]"
                    onClick={() => setDeleteTarget(account.id)}
                  >
                    মুছুন
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <Empty text="এখনও কোনো অ্যাকাউন্ট যোগ করা হয়নি" />
        )}
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>অ্যাকাউন্ট মুছুন</DialogTitle>
            <DialogDescription>
              কি আপনি নিশ্চিতভাবে এই অ্যাকাউন্টটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              বাতিল
            </Button>
            <Button variant="destructive" onClick={() => { onDelete(deleteTarget!); setDeleteTarget(null); }}>
              মুছুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
