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
import type { BillDraft } from "../types";

interface BillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingBillId: number | null;
  form: BillDraft;
  onChange: (form: BillDraft) => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function BillDialog({
  open,
  onOpenChange,
  editingBillId,
  form,
  onChange,
  onSubmit,
  isPending,
}: BillDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingBillId ? "বিল সম্পাদনা" : "নতুন বিল রিমাইন্ডার"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="বিলের নাম">
            <Input
              required
              value={form.title}
              onChange={event =>
                onChange({ ...form, title: event.target.value })
              }
            />
          </Field>
          <Field label="টাকার অঙ্ক">
            <Input
              required
              type="number"
              min="0.01"
              value={form.amount}
              onChange={event =>
                onChange({ ...form, amount: event.target.value })
              }
            />
          </Field>
          <Field label="শেষ তারিখ">
            <Input
              required
              type="date"
              value={form.dueAt}
              onChange={event =>
                onChange({ ...form, dueAt: event.target.value })
              }
            />
          </Field>
          {editingBillId && (
            <label className="flex items-center gap-2 text-sm text-[#38594d]">
              <input
                type="checkbox"
                checked={form.isPaid}
                onChange={event =>
                  onChange({ ...form, isPaid: event.target.checked })
                }
              />
              পরিশোধিত
            </label>
          )}
          <Button
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            সংরক্ষণ করুন
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
