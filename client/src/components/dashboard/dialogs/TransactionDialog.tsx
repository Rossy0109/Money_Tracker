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
import { Sparkles } from "lucide-react";
import { Field } from "@/components/dashboard/DashboardMetrics";
import { bdt } from "../types";
import type { TransactionDraft } from "../types";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTransactionId: number | null;
  transactionType: "income" | "expense";
  setTransactionType: (type: "income" | "expense") => void;
  transactionForm: TransactionDraft;
  setTransactionForm: React.Dispatch<React.SetStateAction<TransactionDraft>>;
  categories: Array<{ id: number; name: string }>;
  accounts?: Array<{ id: number; name: string; currentBalance: number | string; [key: string]: any }>;
  showSmsHelper: boolean;
  setShowSmsHelper: (show: boolean) => void;
  smsInput: string;
  setSmsInput: (input: string) => void;
  onApplySMS: () => void;
  onSubmit: (event: FormEvent) => void;
  isPending: boolean;
}

export function TransactionDialog({
  open,
  onOpenChange,
  editingTransactionId,
  transactionType,
  setTransactionType,
  transactionForm,
  setTransactionForm,
  categories,
  accounts,
  showSmsHelper,
  setShowSmsHelper,
  smsInput,
  setSmsInput,
  onApplySMS,
  onSubmit,
  isPending,
}: TransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingTransactionId ? "লেনদেন সম্পাদনা করুন" : "নতুন লেনদেন"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <Tabs
            value={transactionType}
            onValueChange={value => {
              setTransactionType(value as "income" | "expense");
              setTransactionForm(current => ({ ...current, categoryId: "" }));
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="expense">ব্যয়</TabsTrigger>
              <TabsTrigger value="income">আয়</TabsTrigger>
            </TabsList>
          </Tabs>

          {!editingTransactionId && (
            <div className="rounded-xl border border-[#cbe4d3] bg-[#f4faf5] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-[#144434]">
                  <Sparkles className="h-4 w-4 text-[#166534]" />
                  <span>ব্যাংক বা বিকাশ/নগদ SMS দিয়ে অটো-পূরণ</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSmsHelper(!showSmsHelper)}
                  className="h-7 text-xs text-[#166534] hover:bg-[#e2f2e5]"
                >
                  {showSmsHelper ? "লুকান" : "SMS পেস্ট করুন"}
                </Button>
              </div>
              {showSmsHelper && (
                <div className="mt-2 space-y-2 pt-2 border-t border-[#d8ece0]">
                  <Textarea
                    placeholder="এখানে বিকাশ, নগদ, রকেট বা ব্যাংকের ট্রানজ্যাকশন SMS পেস্ট করুন..."
                    value={smsInput}
                    onChange={e => setSmsInput(e.target.value)}
                    className="h-16 text-xs bg-white resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={onApplySMS}
                      className="h-7 rounded-lg bg-[#166534] hover:bg-[#114f29] text-white text-xs px-3"
                    >
                      অটো-বসিয়ে দিন
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Field label="টাকার অঙ্ক">
            <Input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={transactionForm.amount}
              onChange={event =>
                setTransactionForm({
                  ...transactionForm,
                  amount: event.target.value,
                })
              }
            />
          </Field>
          <Field label="ক্যাটাগরি">
            <select
              required
              className="finance-input"
              value={transactionForm.categoryId}
              onChange={event =>
                setTransactionForm({
                  ...transactionForm,
                  categoryId: event.target.value,
                })
              }
            >
              <option value="">ক্যাটাগরি বাছাই করুন</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং সেটিংসের নির্ধারিত রেঞ্জ থেকে স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="তারিখ">
              <Input
                required
                type="date"
                value={transactionForm.occurredAt}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    occurredAt: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="পেমেন্ট">
              <select
                className="finance-input"
                value={transactionForm.paymentMethod}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    paymentMethod: event.target.value,
                  })
                }
              >
                <option value="Cash">নগদ</option>
                <option value="Bank Transfer">ব্যাংক ট্রান্সফার</option>
                <option>bKash</option>
                <option>Nagad</option>
                <option>Card</option>
              </select>
            </Field>
          </div>
          <Field label="অ্যাকাউন্ট">
            <select
              className="finance-input"
              value={transactionForm.accountId}
              onChange={event =>
                setTransactionForm({
                  ...transactionForm,
                  accountId: event.target.value,
                })
              }
            >
              <option value="none">অ্যাকাউন্ট ছাড়া</option>
              {accounts?.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name} — {bdt(account.currentBalance)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="বিবরণ">
            <Textarea
              value={transactionForm.note}
              onChange={event =>
                setTransactionForm({
                  ...transactionForm,
                  note: event.target.value,
                })
              }
            />
          </Field>
          <Button
            disabled={isPending}
            className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            {editingTransactionId ? "আপডেট করুন" : "সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
