import { Button } from "@/components/ui/button";
import { Plus, MessageCircle } from "lucide-react";
import { bdt, dateText } from "@/lib/utils";
import { generateDueReminderMessage, getWhatsAppShareUrl } from "@/lib/dueReminder";

export function DuesPanel({
  title,
  eyebrow,
  dues,
  onAdd,
  onSettle,
}: {
  title: string;
  eyebrow: string;
  dues: any[];
  onAdd: () => void;
  onSettle: (due: any) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">{eyebrow}</p>
          <h2 className="section-title">{title}</h2>
        </div>
        <Button
          size="sm"
          onClick={onAdd}
          className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
        >
          <Plus className="mr-1 h-4 w-4" />
          যোগ করুন
        </Button>
      </div>
      <p className="mt-2 text-xs text-[#6d8278]">
        সমন্বয় করলে বকেয়া কমবে; আয় বা ব্যয়ের হিসাবে যোগ হবে না।
      </p>
      <div className="mt-4 divide-y divide-[#e8eee9]">
        {dues.length ? (
          dues.map(due => (
            <div key={due.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#25483e]">
                    {due.counterparty}
                  </p>
                  <p className="mt-1 text-xs text-[#778980]">
                    {due.voucherNo ? `ভাউচার: ${due.voucherNo} · ` : ""}
                    {due.note ?? "কোনো বিবরণ নেই"}
                  </p>
                </div>
                <p className="font-semibold text-[#a56d20]">
                  {bdt(due.outstandingAmount)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-[#778980]">
                  মোট {bdt(due.originalAmount)} · {dateText(due.openedAt)}
                </p>
                <div className="flex items-center gap-2">
                  {due.type === "receivable" && Number(due.outstandingAmount) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const msg = generateDueReminderMessage({
                          counterparty: due.counterparty,
                          outstandingAmount: due.outstandingAmount,
                          voucherNo: due.voucherNo,
                          dueAt: due.dueAt,
                          reason: due.reason || due.note,
                        });
                        const url = getWhatsAppShareUrl(null, msg);
                        window.open(url, "_blank");
                      }}
                      className="h-8 rounded-xl border-[#25d366]/40 hover:bg-[#25d366]/10 text-[#0d7335] text-xs font-semibold flex items-center gap-1 shadow-sm"
                      title="WhatsApp এ বকেয়া তাগাদা পাঠান"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-[#25d366]" />
                      তাগাদা
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSettle(due)}
                    className="h-8 rounded-xl"
                  >
                    সমন্বয়
                  </Button>
                </div>
              </div>
              {due.settlements?.length ? (
                <div className="mt-3 rounded-lg bg-[#f6faf7] p-2">
                  <p className="text-xs font-semibold text-[#587466]">
                    সমন্বয়ের ইতিহাস
                  </p>
                  {due.settlements.map((settlement: any) => (
                    <div
                      key={settlement.id}
                      className="mt-2 grid gap-1 border-t border-[#e5eee7] pt-2 text-xs text-[#667d72] sm:grid-cols-2"
                    >
                      <span>
                        {dateText(settlement.occurredAt)} ·{" "}
                        {settlement.voucherNo
                          ? `ভাউচার: ${settlement.voucherNo}`
                          : "ভাউচার নেই"}
                      </span>
                      <span className="font-medium text-[#25483e] sm:text-right">
                        {bdt(settlement.amount)} ·{" "}
                        {settlement.accountName ?? "অ্যাকাউন্ট ছাড়া"}
                      </span>
                      <span className="sm:col-span-2">
                        {settlement.note ?? "কোনো বিবরণ নেই"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#8a9a92]">
                  এখনও কোনো সমন্বয় হয়নি
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="py-5 text-center text-sm text-[#7b8d84]">{`${eyebrow}র কোনো বকেয়া নেই`}</p>
        )}
      </div>
    </article>
  );
}
