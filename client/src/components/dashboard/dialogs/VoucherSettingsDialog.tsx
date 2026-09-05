import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/dashboard/DashboardMetrics";
import type { VoucherSettingsDraft } from "../types";

interface VoucherSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: VoucherSettingsDraft;
  onChange: (form: VoucherSettingsDraft) => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
  activeVoucherData?: { prefix: string; nextNumber: number };
}

export function VoucherSettingsDialog({
  open,
  onOpenChange,
  form,
  onChange,
  onSubmit,
  isPending,
  activeVoucherData,
}: VoucherSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ভাউচার সেটিংস</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">
            প্রতিটি নতুন লেনদেন, দেনা/পাওনা ও সমন্বয়ের জন্য নির্ধারিত
            রেঞ্জ থেকে পরবর্তী ভাউচার নম্বর স্বয়ংক্রিয়ভাবে দেওয়া হবে।
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ভাউচার প্রিফিক্স">
              <Input
                required
                maxLength={20}
                value={form.prefix}
                onChange={event =>
                  onChange({
                    ...form,
                    prefix: event.target.value,
                  })
                }
                placeholder="V"
              />
            </Field>
            <Field label="পরবর্তী নম্বর">
              <Input
                readOnly
                value={
                  activeVoucherData
                    ? `${activeVoucherData.prefix}-${String(activeVoucherData.nextNumber).padStart(6, "0")}`
                    : "লোড হচ্ছে…"
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="শুরুর নম্বর">
              <Input
                required
                type="number"
                min="1"
                step="1"
                value={form.startNumber}
                onChange={event =>
                  onChange({
                    ...form,
                    startNumber: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="শেষ নম্বর">
              <Input
                required
                type="number"
                min="1"
                step="1"
                value={form.endNumber}
                onChange={event =>
                  onChange({
                    ...form,
                    endNumber: event.target.value,
                  })
                }
              />
            </Field>
          </div>
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            {isPending ? "সংরক্ষণ হচ্ছে…" : "সেটিংস সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
