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
import type { BudgetDraft } from "../types";

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: BudgetDraft;
  onChange: (form: BudgetDraft) => void;
  expenseCategories: Array<{ id: number; name: string }>;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function BudgetDialog({
  open,
  onOpenChange,
  form,
  onChange,
  expenseCategories,
  onSubmit,
  isPending,
}: BudgetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>মাসিক বাজেট</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Field label="ব্যয় ক্যাটাগরি">
            <select
              className="finance-input"
              value={form.categoryId}
              onChange={event =>
                onChange({
                  ...form,
                  categoryId: event.target.value,
                })
              }
            >
              <option value="">ক্যাটাগরি বাছাই করুন</option>
              {expenseCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="বাজেটের অঙ্ক">
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
          <Button
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            বাজেট সংরক্ষণ করুন
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
