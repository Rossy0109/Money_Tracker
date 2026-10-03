import { Button } from "@/components/ui/button";
import { Plus, Check, Pencil, Trash2 } from "lucide-react";
import { bdt, dateText } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type BillItem =
  inferRouterOutputs<AppRouter>["finance"]["overview"]["bills"][number];

export function BillsPanel({
  bills,
  onAdd,
  onEdit,
  onPay,
  onDelete,
}: {
  bills: BillItem[];
  onAdd: () => void;
  onEdit: (bill: BillItem) => void;
  onPay: (id: number, isPaid: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">বিল রিমাইন্ডার</p>
          <h2 className="section-title">আসন্ন বিল</h2>
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
      <div className="mt-4 divide-y divide-border">
        {bills.length ? (
          bills.slice(0, 5).map(bill => (
            <div key={bill.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => onPay(bill.id, !bill.isPaid)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${bill.isPaid ? "border-[#2a8d5c] bg-background text-positive" : "border-border text-transparent"}`}
                aria-label="বিলের অবস্থা পরিবর্তন"
              >
                <Check className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-medium ${bill.isPaid ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {bill.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dateText(bill.dueAt)} · {bdt(bill.amount)}
                </p>
              </div>
              <button
                onClick={() => onEdit(bill)}
                aria-label="সম্পাদনা"
                className="text-muted-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(bill.id)}
                aria-label="মুছুন"
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="py-5 text-center text-sm text-muted-foreground">
            এখনও কোনো বিল রিমাইন্ডার নেই
          </p>
        )}
      </div>
    </article>
  );
}
