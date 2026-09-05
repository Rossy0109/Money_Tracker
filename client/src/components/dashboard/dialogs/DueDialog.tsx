import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/dashboard/DashboardMetrics";
import type { DueDraft } from "../types";

interface DueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DueDraft;
  onChange: (form: DueDraft) => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function DueDialog({
  open,
  onOpenChange,
  form,
  onChange,
  onSubmit,
  isPending,
}: DueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {form.type === "debt" ? "নতুন দেনা" : "নতুন পাওনা"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Tabs
            value={form.type}
            onValueChange={value =>
              onChange({ ...form, type: value as "debt" | "receivable" })
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="debt">দেনা</TabsTrigger>
              <TabsTrigger value="receivable">পাওনা</TabsTrigger>
            </TabsList>
          </Tabs>
          <Field
            label={
              form.type === "debt" ? "দেনাদারের নাম" : "পাওনাদারের নাম"
            }
          >
            <Input
              required
              value={form.counterparty}
              onChange={event =>
                onChange({ ...form, counterparty: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="টাকার অঙ্ক">
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={event =>
                  onChange({ ...form, amount: event.target.value })
                }
              />
            </Field>
            <Field label="তারিখ">
              <Input
                required
                type="date"
                value={form.openedAt}
                onChange={event =>
                  onChange({ ...form, openedAt: event.target.value })
                }
              />
            </Field>
            <Field label="পরিশোধের শেষ তারিখ (ঐচ্ছিক)">
              <Input
                type="date"
                min={form.openedAt}
                value={form.dueAt}
                onChange={event =>
                  onChange({ ...form, dueAt: event.target.value })
                }
              />
            </Field>
          </div>
          <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
          <Field label="বিবরণ">
            <Textarea
              value={form.note}
              onChange={event =>
                onChange({ ...form, note: event.target.value })
              }
            />
          </Field>
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
