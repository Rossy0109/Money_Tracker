import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/dashboard/DashboardMetrics";
import type { SettlementDraft } from "../types";

interface SettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: SettlementDraft;
  onChange: (form: SettlementDraft) => void;
  accounts?: Array<{ id: number; name: string }>;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function SettlementDialog({
  open,
  onOpenChange,
  form,
  onChange,
  accounts,
  onSubmit,
  isPending,
}: SettlementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>দেনা/পাওনা সমন্বয়</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">
            এই সমন্বয়টি আয় বা ব্যয় নয়; কেবল বকেয়া পরিমাণ কমাবে।
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="পরিশোধ/প্রাপ্তির তারিখ">
              <Input
                required
                type="date"
                value={form.occurredAt}
                onChange={event =>
                  onChange({
                    ...form,
                    occurredAt: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="টাকার অঙ্ক">
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={event =>
                  onChange({
                    ...form,
                    amount: event.target.value,
                  })
                }
              />
            </Field>
          </div>
          <Field label="যে অ্যাকাউন্টে লেনদেন হয়েছে">
            <select
              className="finance-input"
              value={form.accountId}
              onChange={event =>
                onChange({
                  ...form,
                  accountId: event.target.value,
                })
              }
            >
              <option value="none">অ্যাকাউন্ট ছাড়া</option>
              {accounts?.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
          <Field label="বিবরণ">
            <Textarea
              value={form.note}
              onChange={event =>
                onChange({
                  ...form,
                  note: event.target.value,
                })
              }
            />
          </Field>
          <Button
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            বকেয়া সমন্বয় করুন
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
