import { Button } from "@/components/ui/button";
import { Plus, Check, Pencil, Trash2 } from "lucide-react";
import { bdt, dateText } from "@/lib/utils";

export function BillsPanel({
  bills,
  onAdd,
  onEdit,
  onPay,
  onDelete,
}: {
  bills: any[];
  onAdd: () => void;
  onEdit: (bill: any) => void;
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
      <div className="mt-4 divide-y divide-[#e8eee9]">
        {bills.length ? (
          bills.slice(0, 5).map(bill => (
            <div key={bill.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => onPay(bill.id, !bill.isPaid)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${bill.isPaid ? "border-[#2a8d5c] bg-[#eaf7ed] text-[#24834f]" : "border-[#d6e2d8] text-transparent"}`}
                aria-label="বিলের অবস্থা পরিবর্তন"
              >
                <Check className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-medium ${bill.isPaid ? "text-[#82948b] line-through" : "text-[#25483e]"}`}
                >
                  {bill.title}
                </p>
                <p className="mt-0.5 text-xs text-[#778980]">
                  {dateText(bill.dueAt)} · {bdt(bill.amount)}
                </p>
              </div>
              <button
                onClick={() => onEdit(bill)}
                aria-label="সম্পাদনা"
                className="text-[#577d6e]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(bill.id)}
                aria-label="মুছুন"
                className="text-[#bd6a63]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="py-5 text-center text-sm text-[#7b8d84]">এখনও কোনো বিল রিমাইন্ডার নেই</p>
        )}
      </div>
    </article>
  );
}
