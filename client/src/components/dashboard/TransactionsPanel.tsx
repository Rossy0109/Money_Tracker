import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { bdt, dateText } from "@/lib/utils";

export function TransactionsPanel({
  rows,
  filter,
  setFilter,
  onAdd,
  onEdit,
  onDelete,
}: {
  rows: any[];
  filter: "all" | "income" | "expense";
  setFilter: (value: "all" | "income" | "expense") => void;
  onAdd: () => void;
  onEdit: (row: any) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">লেনদেন</p>
          <h2 className="section-title">সাম্প্রতিক হিসাব</h2>
        </div>
        <div className="flex gap-2">
          <select
            className="finance-input h-10 text-sm"
            value={filter}
            onChange={event => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">সব</option>
            <option value="income">আয়</option>
            <option value="expense">ব্যয়</option>
          </select>
          <Button
            onClick={onAdd}
            className="h-10 rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            লেনদেন
          </Button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-[#e8eee9] text-xs text-[#71867c]">
            <tr>
              <th className="px-2 py-3 font-semibold">তারিখ</th>
              <th className="px-2 py-3 font-semibold">বিবরণ</th>
              <th className="px-2 py-3 font-semibold">ক্যাটাগরি</th>
              <th className="px-2 py-3 font-semibold">অ্যাকাউন্ট</th>
              <th className="px-2 py-3 text-right font-semibold">
                টাকার পরিমাণ
              </th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(row => (
                <tr key={row.id} className="border-b border-[#edf1ee]">
                  <td className="px-2 py-3 text-[#647d72]">
                    {dateText(row.occurredAt)}
                  </td>
                  <td className="px-2 py-3">
                    <p
                      className="max-w-48 truncate font-medium text-[#264a3f]"
                      title={row.note ?? ""}
                    >
                      {row.note ?? "—"}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-[#264a3f]">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-[#819188]">
                      {row.paymentMethod}
                    </p>
                  </td>
                  <td className="px-2 py-3 text-[#647d72]">
                    {row.accountName ?? "—"}
                  </td>
                  <td
                    className={`px-2 py-3 text-right font-semibold ${row.type === "income" ? "text-[#278050]" : "text-[#c4675d]"}`}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {bdt(row.amount)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(row)}
                        aria-label="সম্পাদনা"
                        className="text-[#577d6e]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(row.id)}
                        aria-label="মুছুন"
                        className="text-[#bd6a63]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <p className="py-5 text-center text-sm text-[#7b8d84]">এই ফিল্টারে কোনো লেনদেন নেই</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
