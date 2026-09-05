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
import type { AccountDraft } from "../types";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAccountId: number | null;
  form: AccountDraft;
  onChange: (form: AccountDraft) => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function AccountDialog({
  open,
  onOpenChange,
  editingAccountId,
  form,
  onChange,
  onSubmit,
  isPending,
}: AccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingAccountId ? "অ্যাকাউন্ট সম্পাদনা" : "নতুন অ্যাকাউন্ট"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="নাম">
            <Input
              required
              value={form.name}
              onChange={event =>
                onChange({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="ধরন">
            <select
              className="finance-input"
              value={form.type}
              onChange={event =>
                onChange({
                  ...form,
                  type: event.target.value as AccountDraft["type"],
                })
              }
            >
              <option value="cash">নগদ</option>
              <option value="bank">ব্যাংক</option>
              <option value="mobile">মোবাইল ব্যাংকিং</option>
            </select>
          </Field>
          <Field label="প্রারম্ভিক ব্যালেন্স">
            <Input
              required
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={event =>
                onChange({
                  ...form,
                  openingBalance: event.target.value,
                })
              }
            />
          </Field>
          <Button
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            {editingAccountId ? "আপডেট করুন" : "অ্যাকাউন্ট যোগ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
