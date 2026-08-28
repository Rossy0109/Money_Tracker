import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readActiveProjectId, resolveActiveProjectId, saveActiveProjectId } from "@/lib/activeProject";
import { trpc } from "@/lib/trpc";
import { AlarmClock, CalendarClock, CheckCircle2, CircleDollarSign, Loader2, Play, ReceiptText } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const bdt = (value: number | string) => `৳ ${new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const dateLabel = (value: Date | string) => new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
type RecurringForm = { categoryId: string; accountId: string; type: "income" | "expense"; amount: string; paymentMethod: string; note: string; frequency: "monthly" | "weekly"; scheduleDay: string; nextRunAt: string };
const initialRecurring = (): RecurringForm => ({ categoryId: "", accountId: "", type: "expense", amount: "", paymentMethod: "নগদ", note: "", frequency: "monthly", scheduleDay: String(new Date().getDate()), nextRunAt: new Date().toISOString().slice(0, 10) });

const SUBSCRIPTION_PRESETS = [
  { name: "ইন্টারনেট / WiFi বিল", type: "expense" as const, amount: "1000", paymentMethod: "bKash", frequency: "monthly" as const, note: "মাসিক ইন্টারনেট বিল" },
  { name: "বিদ্যুৎ বিল (DESCO/DPDC)", type: "expense" as const, amount: "1500", paymentMethod: "bKash", frequency: "monthly" as const, note: "মাসিক বিদ্যুৎ বিল" },
  { name: "বাসা ভাড়া", type: "expense" as const, amount: "15000", paymentMethod: "ব্যাংক ট্রান্সফার", frequency: "monthly" as const, note: "মাসিক বাসা ভাড়া" },
  { name: "Netflix / OTT সাবস্ক্রিপশন", type: "expense" as const, amount: "800", paymentMethod: "কার্ড", frequency: "monthly" as const, note: "মাসিক স্ট্রিমিং সাবস্ক্রিপশন" },
  { name: "মোবাইল রিচার্জ / প্যাক", type: "expense" as const, amount: "500", paymentMethod: "bKash", frequency: "monthly" as const, note: "মাসিক মোবাইল বিল" },
  { name: "মাসিক বেতন আয়", type: "income" as const, amount: "50000", paymentMethod: "ব্যাংক ট্রান্সফার", frequency: "monthly" as const, note: "মাসিক নিয়মিত বেতন" },
];

export default function FinanceAutomation() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [form, setForm] = useState<RecurringForm>(initialRecurring);
  useEffect(() => { if (projects.length) setActiveProjectId(current => resolveActiveProjectId(projects.map(project => project.id), current, readActiveProjectId())); }, [projects]);
  const projectId = activeProjectId ?? 0;
  const { data: overview } = trpc.finance.overview.useQuery({ projectId }, { enabled: projectId > 0 });
  const { data: automation, isLoading } = trpc.finance.automationOverview.useQuery({ projectId }, { enabled: projectId > 0 });
  const refresh = async () => { await Promise.all([utils.finance.automationOverview.invalidate({ projectId }), utils.finance.overview.invalidate({ projectId })]); };
  const enableRecurring = trpc.finance.enableRecurringSchedule.useMutation({ onError: error => toast.error(error.message || "স্বয়ংক্রিয় সময়সূচি চালু করা যায়নি") });
  const addRecurring = trpc.finance.addRecurringTemplate.useMutation({
    onSuccess: async (id) => {
      try { await enableRecurring.mutateAsync({ projectId, id }); toast.success("পুনরাবৃত্ত লেনদেন ও দৈনিক যাচাই চালু হয়েছে"); } catch { toast.warning("টেমপ্লেট তৈরি হয়েছে; সময়সূচি চালুর জন্য আবার চেষ্টা করুন"); }
      setForm(initialRecurring()); await refresh();
    },
    onError: error => toast.error(error.message || "পুনরাবৃত্ত লেনদেন তৈরি করা যায়নি"),
  });
  const runNow = trpc.finance.generateRecurringNow.useMutation({ onSuccess: async result => { await refresh(); toast.success(result.created ? `${new Intl.NumberFormat("bn-BD").format(result.created)}টি নির্ধারিত লেনদেন যোগ হয়েছে` : "আজ নতুন কোনো নির্ধারিত লেনদেন নেই"); }, onError: error => toast.error(error.message) });
  const toggleRecurring = trpc.finance.setRecurringActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const enableBill = trpc.finance.enableBillReminder.useMutation({ onSuccess: async () => { await refresh(); toast.success("বিলের দৈনিক স্মরণ পরীক্ষা চালু হয়েছে"); }, onError: error => toast.error(error.message || "বিল স্মরণ চালু করা যায়নি") });
  const chooseProject = (value: string) => { const id = Number(value); setActiveProjectId(id); saveActiveProjectId(id); };
  const applyPreset = (preset: typeof SUBSCRIPTION_PRESETS[0]) => {
    const matchedCategory = overview?.categories.find(c => c.type === preset.type && (c.name.includes("বিল") || c.name.includes("বেতন") || c.name.includes("বাসা") || c.name.includes("যাতায়াত") || c.name.includes("Salary") || c.name.includes("Business")));
    setForm(current => ({
      ...current,
      type: preset.type,
      amount: preset.amount,
      paymentMethod: preset.paymentMethod,
      note: preset.note,
      frequency: preset.frequency,
      categoryId: matchedCategory ? String(matchedCategory.id) : current.categoryId,
    }));
    toast.info(`"${preset.name}" প্রিসেট ফর্ম-এ বসানো হয়েছে`);
  };
  const submitRecurring = (event: FormEvent) => { event.preventDefault(); if (!projectId || !form.categoryId || !form.amount || !form.nextRunAt) return; addRecurring.mutate({ projectId, categoryId: Number(form.categoryId), accountId: form.accountId ? Number(form.accountId) : undefined, type: form.type, amount: Number(form.amount), paymentMethod: form.paymentMethod, note: form.note || undefined, frequency: form.frequency, scheduleDay: Number(form.scheduleDay), nextRunAt: new Date(`${form.nextRunAt}T12:00:00`) }); };
  const relevantCategories = overview?.categories.filter(category => category.type === form.type) ?? [];
  if (projectsLoading) return <DashboardLayout><div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#2c6c57]" /></div></DashboardLayout>;
  return <DashboardLayout><main className="space-y-5 sm:space-y-7">
    <header className="flex flex-col gap-4 rounded-[1.75rem] bg-[#173f36] p-5 text-white shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-7"><div><p className="text-xs font-bold tracking-[.18em] text-[#bcecc6]">নিয়মিত হিসাব</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">পুনরাবৃত্ত লেনদেন ও বিল স্মরণ</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">সময়সূচি আপনার অনুমতিতে চলে। কোনো নির্ধারিত লেনদেন একাধিকবার যোগ হয় না।</p></div><label className="grid gap-1.5 text-sm font-medium text-[#e3f3e7]">হিসাবখাতা<select aria-label="হিসাবখাতা নির্বাচন" value={activeProjectId ?? ""} onChange={event => chooseProject(event.target.value)} className="h-11 min-w-0 rounded-xl border border-white/25 bg-white px-3 text-sm font-semibold text-[#123c32] focus:outline-none focus:ring-2 focus:ring-[#bcecc6] sm:min-w-60">{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></header>
    {!projects.length ? <Card><CardContent className="p-7 text-center text-sm text-muted-foreground">হিসাবখাতা প্রস্তুত হচ্ছে।</CardContent></Card> : <>
      {/* Quick Subscription & Expense Presets */}
      <Card className="border-[#dbe7dd] bg-[#f9fbf9]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[#173f36] flex items-center gap-2">
            ⚡ দ্রুত সাবস্ক্রিপশন ও বিল প্রিসেট (১-ক্লিকে সিলেক্ট করুন)
          </CardTitle>
          <CardDescription className="text-xs">
            বহুল ব্যবহৃত মাসিক বিল ও সাবস্ক্রিপশনের তথ্য এক ক্লিকে ফর্মে বসাতে নিচের যেকোনো বাটনে ট্যাপ করুন।
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUBSCRIPTION_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#c2ded0] bg-white px-3 py-2 text-xs font-medium text-[#173f36] shadow-sm transition hover:bg-[#eaf4ee] hover:border-[#86c4a5] active:scale-95"
              >
                <span>{preset.type === "expense" ? "💸" : "💰"}</span>
                <span>{preset.name}</span>
                <span className="text-[#1b704d] font-semibold">({bdt(preset.amount)})</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><Card className="border-[#dbe7dd]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><CalendarClock className="h-5 w-5 text-[#1d7a50]" />পুনরাবৃত্ত লেনদেন</CardTitle><CardDescription>সাপ্তাহিক বা মাসিক আয়-ব্যয় নির্ধারণ করুন। পরবর্তী তারিখে দৈনিক নিরাপদ যাচাই লেনদেনটি তৈরি করবে।</CardDescription></CardHeader><CardContent><form onSubmit={submitRecurring} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">ধরন<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as RecurringForm["type"], categoryId: "" }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="expense">ব্যয়</option><option value="income">আয়</option></select></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">ক্যাটাগরি<select required value={form.categoryId} onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="">নির্বাচন করুন</option>{relevantCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">পরিমাণ<Input required inputMode="decimal" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} className="h-11" /></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">অ্যাকাউন্ট<select value={form.accountId} onChange={event => setForm(current => ({ ...current, accountId: event.target.value }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="">অ্যাকাউন্ট ছাড়া</option>{overview?.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">পুনরাবৃত্তি<select value={form.frequency} onChange={event => setForm(current => ({ ...current, frequency: event.target.value as RecurringForm["frequency"] }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="monthly">প্রতি মাসে</option><option value="weekly">প্রতি সপ্তাহে</option></select></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">দিন (১–৩১)<Input required type="number" min="1" max="31" value={form.scheduleDay} onChange={event => setForm(current => ({ ...current, scheduleDay: event.target.value }))} className="h-11" /></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">শুরুর তারিখ<Input required type="date" value={form.nextRunAt} onChange={event => setForm(current => ({ ...current, nextRunAt: event.target.value }))} className="h-11" /></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">পরিশোধ পদ্ধতি<Input required value={form.paymentMethod} onChange={event => setForm(current => ({ ...current, paymentMethod: event.target.value }))} className="h-11" /></label><label className="grid gap-1 text-xs font-semibold text-[#4b6c60] sm:col-span-2">বিবরণ (ঐচ্ছিক)<Input value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} className="h-11" /></label><Button type="submit" disabled={addRecurring.isPending || enableRecurring.isPending} className="h-11 rounded-xl bg-[#1b704d] sm:col-span-2">{addRecurring.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}পুনরাবৃত্ত লেনদেন চালু করুন</Button></form></CardContent></Card>
      <Card className="border-[#dbe7dd]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><AlarmClock className="h-5 w-5 text-[#ba6a18]" />বিল স্মরণ</CardTitle><CardDescription>অপরিশোধিত বিলের নির্ধারিত দিনের আগে প্রতিদিন স্মরণ পরীক্ষা করা হয়।</CardDescription></CardHeader><CardContent className="space-y-3">{isLoading ? <div className="grid min-h-36 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2c6c57]" /></div> : automation?.bills.filter(bill => !bill.isPaid).length ? automation.bills.filter(bill => !bill.isPaid).map(bill => <article key={bill.id} className="rounded-2xl border border-[#eee2cc] bg-[#fffaf1] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-[#5f461f]">{bill.title}</p><p className="mt-1 text-sm text-[#886a3b]">{bdt(bill.amount)} · পরিশোধের তারিখ {dateLabel(bill.dueAt)}</p><p className="mt-1 text-xs text-[#9a7b4a]">{bill.reminderDaysBefore} দিন আগে থেকে স্মরণ {bill.lastReminderAt ? `· সর্বশেষ পরীক্ষা ${dateLabel(bill.lastReminderAt)}` : ""}</p></div><Button size="sm" className="h-10 rounded-xl bg-[#a96518] hover:bg-[#845111]" disabled={enableBill.isPending} onClick={() => enableBill.mutate({ projectId, id: bill.id, reminderDaysBefore: bill.reminderDaysBefore })}><AlarmClock className="h-4 w-4" />স্মরণ চালু</Button></div></article>) : <p className="rounded-2xl bg-[#f5faf6] p-4 text-sm text-[#5d786c]">এখন কোনো অপরিশোধিত বিল নেই। ড্যাশবোর্ড থেকে বিল যোগ করুন।</p>}</CardContent></Card></section>
      <section className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]"><Card className="border-[#dbe7dd]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><ReceiptText className="h-5 w-5 text-[#2c6c57]" />চালু পুনরাবৃত্ত তালিকা</CardTitle><CardDescription>প্রিভিউ দেখে প্রয়োজনে একবার হাতে চালান বা সাময়িক বিরতি দিন।</CardDescription></CardHeader><CardContent className="space-y-3">{automation?.recurring.length ? automation.recurring.map(item => <article key={item.id} className="rounded-2xl border border-[#e2ece5] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#23463a]">{item.categoryName}</p><Badge variant={item.isActive ? "secondary" : "outline"}>{item.isActive ? "চালু" : "বিরতিতে"}</Badge></div><p className="mt-1 text-sm text-[#637c71]">{item.type === "expense" ? "ব্যয়" : "আয়"} {bdt(item.amount)} · {item.frequency === "monthly" ? "মাসিক" : "সাপ্তাহিক"} · পরবর্তী {dateLabel(item.nextRunAt)}</p><p className="mt-1 text-xs text-[#789084]">{item.note || "বিবরণ নেই"}{item.accountName ? ` · ${item.accountName}` : ""}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" className="h-10 rounded-xl" disabled={runNow.isPending || !item.isActive} onClick={() => runNow.mutate({ projectId, id: item.id })}><Play className="h-4 w-4" />এখন চালান</Button><Button variant="outline" size="sm" className="h-10 rounded-xl" disabled={toggleRecurring.isPending} onClick={() => toggleRecurring.mutate({ projectId, id: item.id, isActive: !item.isActive })}>{item.isActive ? "বিরতি" : "চালু"}</Button></div></div></article>) : <p className="rounded-2xl bg-[#f5faf6] p-4 text-sm text-[#5d786c]">কোনো পুনরাবৃত্ত লেনদেন নেই। উপরের ফর্ম থেকে তৈরি করুন।</p>}</CardContent></Card>
      <Card className="border-[#dbe7dd]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><CircleDollarSign className="h-5 w-5 text-[#7153a0]" />দেনা ও পাওনার বয়সভিত্তিক অবস্থা</CardTitle><CardDescription>বকেয়ার বয়স ও পরিশোধের তারিখ ধরে অগ্রাধিকার ঠিক করুন।</CardDescription></CardHeader><CardContent className="space-y-3">{automation?.ageing.length ? automation.ageing.map(item => <article key={item.id} className="rounded-2xl border border-[#e8e3f1] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#3f3159]">{item.counterparty}</p><p className="mt-1 text-sm text-[#6e6380]">{item.type === "debt" ? "দেনা" : "পাওনা"} · বাকি {bdt(item.outstandingAmount)}</p><p className="mt-1 text-xs text-[#82768f]">{item.dueAt ? `পরিশোধের তারিখ ${dateLabel(item.dueAt)}` : "পরিশোধের তারিখ নির্ধারিত নয়"}</p></div><Badge className={item.status.includes("overdue") ? "bg-[#fbe5e1] text-[#a33a2a]" : item.status === "due_today" ? "bg-[#fff0d4] text-[#9a5a09]" : "bg-[#edf5ee] text-[#26704a]"}>{item.status === "overdue_31_plus" ? "৩১+ দিন বকেয়া" : item.status === "overdue_1_30" ? `${new Intl.NumberFormat("bn-BD").format(item.daysOverdue || 0)} দিন বকেয়া` : item.status === "due_today" ? "আজ পরিশোধযোগ্য" : item.status === "undated" ? "তারিখ দিন" : "আগামী"}</Badge></div></article>) : <p className="rounded-2xl bg-[#f7f4fb] p-4 text-sm text-[#6f6680]">এখন কোনো বকেয়া দেনা বা পাওনা নেই।</p>}</CardContent></Card></section>
    </>}</main></DashboardLayout>;
}
