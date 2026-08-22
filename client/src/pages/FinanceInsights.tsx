import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { readActiveProjectId, resolveActiveProjectId, saveActiveProjectId } from "@/lib/activeProject";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Filter, Loader2, Search, Sparkles, TrendingUp } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const bdt = (value: number | string) =>
  `৳ ${new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("bn-BD", { month: "short", year: "numeric" }).format(new Date(`${value}-01T12:00:00Z`));

const dateLabel = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

type SearchForm = {
  query: string;
  categoryId: string;
  type: "all" | "income" | "expense";
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
};

const emptySearch: SearchForm = { query: "", categoryId: "", type: "all", from: "", to: "", minAmount: "", maxAmount: "" };

export default function FinanceInsights() {
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [planMonth, setPlanMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [searchForm, setSearchForm] = useState<SearchForm>(emptySearch);
  const [appliedSearch, setAppliedSearch] = useState<SearchForm>(emptySearch);

  useEffect(() => {
    if (projects.length) setActiveProjectId(current => resolveActiveProjectId(projects.map(project => project.id), current, readActiveProjectId()));
  }, [projects]);

  const projectId = activeProjectId ?? 0;
  const { data: overview } = trpc.finance.overview.useQuery({ projectId }, { enabled: projectId > 0 });
  const { data: plan, isLoading: planLoading } = trpc.finance.budgetPlan.useQuery({ projectId, monthKey: planMonth }, { enabled: projectId > 0 });
  const { data: analytics, isLoading: analyticsLoading } = trpc.finance.analytics.useQuery({ projectId, months: 6 }, { enabled: projectId > 0 });
  const searchInput = useMemo(() => ({
    projectId,
    query: appliedSearch.query.trim() || undefined,
    categoryId: appliedSearch.categoryId ? Number(appliedSearch.categoryId) : undefined,
    type: appliedSearch.type === "all" ? undefined : appliedSearch.type,
    from: appliedSearch.from ? new Date(`${appliedSearch.from}T00:00:00`) : undefined,
    to: appliedSearch.to ? new Date(`${appliedSearch.to}T23:59:59.999`) : undefined,
    minAmount: appliedSearch.minAmount ? Number(appliedSearch.minAmount) : undefined,
    maxAmount: appliedSearch.maxAmount ? Number(appliedSearch.maxAmount) : undefined,
    limit: 100,
  }), [projectId, appliedSearch]);
  const { data: results = [], isFetching: searching } = trpc.finance.searchTransactions.useQuery(searchInput, { enabled: projectId > 0 });
  const saveBudget = trpc.finance.saveBudget.useMutation({
    onSuccess: async (_result, input) => {
      await Promise.all([
        utils.finance.budgetPlan.invalidate({ projectId: input.projectId, monthKey: input.monthKey }),
        utils.finance.analytics.invalidate({ projectId: input.projectId, months: 6 }),
        utils.finance.overview.invalidate({ projectId: input.projectId }),
      ]);
      toast.success("প্রস্তাবিত বাজেট সংরক্ষণ হয়েছে");
    },
    onError: error => toast.error(error.message || "বাজেট সংরক্ষণ করা যায়নি"),
  });

  const chooseProject = (value: string) => {
    const id = Number(value);
    setActiveProjectId(id);
    saveActiveProjectId(id);
  };
  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedSearch(searchForm);
  };
  const clearSearch = () => {
    setSearchForm(emptySearch);
    setAppliedSearch(emptySearch);
  };

  if (projectsLoading) {
    return <DashboardLayout><div className="grid min-h-[50vh] place-items-center text-[#43655a]"><Loader2 className="h-7 w-7 animate-spin" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-7">
        <header className="flex flex-col gap-4 rounded-[1.75rem] bg-[#123c32] p-5 text-white shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#bcecc6]">পরিকল্পনা ও বিশ্লেষণ</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">আগাম পরিকল্পনা, প্রবণতা ও দ্রুত খোঁজ</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">প্রতিটি ফলাফল কেবল নির্বাচিত হিসাবখাতার তথ্য ব্যবহার করে তৈরি হয়।</p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-[#e3f3e7]">
            হিসাবখাতা
            <select aria-label="হিসাবখাতা নির্বাচন" value={activeProjectId ?? ""} onChange={event => chooseProject(event.target.value)} className="h-11 min-w-0 rounded-xl border border-white/25 bg-white px-3 text-sm font-semibold text-[#123c32] focus:outline-none focus:ring-2 focus:ring-[#bcecc6] sm:min-w-60">
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </header>

        {!projects.length ? (
          <Card><CardContent className="p-7 text-center text-sm text-muted-foreground">হিসাবখাতা প্রস্তুত হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।</CardContent></Card>
        ) : (
          <>
            <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
              <Card className="border-[#dbe7dd] shadow-sm">
                <CardHeader className="gap-3 border-b border-[#edf2ee] pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div><CardTitle className="flex items-center gap-2 text-[#173f36]"><Sparkles className="h-5 w-5 text-[#16804c]" />মাসিক বাজেট পরিকল্পনা</CardTitle><CardDescription className="mt-1">আগের মাসের খরচ ও বাজেট দেখে প্রস্তাব আসে; আপনার ক্লিক ছাড়া কোনো বাজেট বদলানো হবে না।</CardDescription></div>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">মাস
                    <Input type="month" value={planMonth} onChange={event => setPlanMonth(event.target.value)} className="h-10 w-full sm:w-36" />
                  </label>
                </CardHeader>
                <CardContent className="p-0">
                  {planLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2c6c57]" /></div> : (
                    <div className="divide-y divide-[#eef3ef]">
                      {plan?.plans.map(item => <article key={item.categoryId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="min-w-0"><p className="font-semibold text-[#1b4035]">{item.categoryName}</p><p className="mt-1 text-xs text-[#6a8278]">গত মাসে খরচ {bdt(item.previousSpent)}{item.previousBudget !== null ? ` · বাজেট ছিল ${bdt(item.previousBudget)}` : ""}</p></div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end"><span className="text-sm font-bold text-[#195f45]">প্রস্তাব {bdt(item.suggestedAmount)}</span><Button size="sm" className="h-10 rounded-xl bg-[#1b704d] px-3 hover:bg-[#125b3d]" disabled={item.suggestedAmount <= 0 || saveBudget.isPending} onClick={() => saveBudget.mutate({ projectId, categoryId: item.categoryId, monthKey: planMonth, amount: item.suggestedAmount })}>প্রস্তাব নিন</Button></div>
                      </article>)}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="border-[#dbe7dd] shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><CalendarDays className="h-5 w-5 text-[#2c6c57]" />বর্তমান মাসের সারাংশ</CardTitle><CardDescription>নির্বাচিত হিসাবখাতার সাম্প্রতিক অবস্থা।</CardDescription></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#edf8ef] p-4"><p className="text-xs font-medium text-[#477360]">মোট আয়</p><p className="mt-1 text-lg font-bold text-[#17643f]">{bdt(overview?.totals.totalIncome ?? 0)}</p></div>
                  <div className="rounded-2xl bg-[#fff2e6] p-4"><p className="text-xs font-medium text-[#8a5a2b]">মোট ব্যয়</p><p className="mt-1 text-lg font-bold text-[#a34c15]">{bdt(overview?.totals.totalExpense ?? 0)}</p></div>
                  <div className="rounded-2xl bg-[#eff5ff] p-4"><p className="text-xs font-medium text-[#476283]">হাতে থাকা</p><p className="mt-1 text-lg font-bold text-[#24548e]">{bdt(overview?.totals.totalBalance ?? 0)}</p></div>
                  <div className="rounded-2xl bg-[#f7f2ff] p-4"><p className="text-xs font-medium text-[#69537f]">নিট ফলাফল</p><p className="mt-1 text-lg font-bold text-[#63438b]">{bdt(overview?.totals.netAmount ?? 0)}</p></div>
                </CardContent>
              </Card>
            </section>

            <Card className="border-[#dbe7dd] shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><TrendingUp className="h-5 w-5 text-[#2c6c57]" />ছয় মাসের আয়, ব্যয় ও সঞ্চয়</CardTitle><CardDescription>আয় থেকে ব্যয় বাদ দিয়ে সঞ্চয়ের পরিমাণ হিসাব করা হয়েছে। বাজেট ব্যবহারও একই মাসের বাজেটের বিপরীতে দেখানো হয়।</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="h-64 w-full" aria-label="ছয় মাসের আর্থিক প্রবণতা চার্ট">
                  {analyticsLoading ? <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2c6c57]" /></div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics?.data ?? []} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e4ece6" vertical={false} /><XAxis dataKey="monthKey" tickFormatter={monthLabel} tick={{ fill: "#648074", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={value => new Intl.NumberFormat("bn-BD", { notation: "compact" }).format(value)} tick={{ fill: "#648074", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={value => bdt(Array.isArray(value) ? value[0] ?? 0 : value ?? 0)} labelFormatter={label => typeof label === "string" ? monthLabel(label) : ""} /><Bar dataKey="income" name="আয়" fill="#238653" radius={[6, 6, 0, 0]} /><Bar dataKey="expense" name="ব্যয়" fill="#e37833" radius={[6, 6, 0, 0]} /><Bar dataKey="savings" name="সঞ্চয়" fill="#587ebc" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{analytics?.data.map(point => <div key={point.monthKey} className="rounded-xl border border-[#e6eee8] p-3 text-sm"><div className="flex items-center justify-between"><span className="font-semibold text-[#284e40]">{monthLabel(point.monthKey)}</span><Badge variant="secondary">{point.budgetUsagePercentage === null ? "বাজেট নেই" : `বাজেট ${new Intl.NumberFormat("bn-BD").format(point.budgetUsagePercentage)}%`}</Badge></div><p className="mt-2 text-xs text-[#627a70]">সঞ্চয় <span className="font-bold text-[#315f4c]">{bdt(point.savings)}</span></p></div>)}</div>
              </CardContent>
            </Card>

            <Card className="border-[#dbe7dd] shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><Search className="h-5 w-5 text-[#2c6c57]" />লেনদেন খোঁজা ও ফিল্টার</CardTitle><CardDescription>বিবরণ, স্বয়ংক্রিয় ভাউচার নম্বর, ক্যাটাগরি, তারিখ এবং টাকার পরিমাণ দিয়ে নির্বাচিত হিসাবখাতার লেনদেন খুঁজুন।</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={applySearch} className="grid gap-3 rounded-2xl bg-[#f7faf8] p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60] lg:col-span-2">বিবরণ বা ভাউচার নম্বর<Input value={searchForm.query} onChange={event => setSearchForm(form => ({ ...form, query: event.target.value }))} placeholder="যেমন: বাজার বা V-000123" className="h-11 bg-white" /></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">ক্যাটাগরি<select value={searchForm.categoryId} onChange={event => setSearchForm(form => ({ ...form, categoryId: event.target.value }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="">সব ক্যাটাগরি</option>{overview?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">ধরন<select value={searchForm.type} onChange={event => setSearchForm(form => ({ ...form, type: event.target.value as SearchForm["type"] }))} className="h-11 rounded-xl border border-input bg-white px-3 text-sm"><option value="all">সব ধরন</option><option value="income">আয়</option><option value="expense">ব্যয়</option></select></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">শুরুর তারিখ<Input type="date" value={searchForm.from} onChange={event => setSearchForm(form => ({ ...form, from: event.target.value }))} className="h-11 bg-white" /></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">শেষের তারিখ<Input type="date" value={searchForm.to} onChange={event => setSearchForm(form => ({ ...form, to: event.target.value }))} className="h-11 bg-white" /></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">সর্বনিম্ন টাকা<Input inputMode="decimal" type="number" min="0" value={searchForm.minAmount} onChange={event => setSearchForm(form => ({ ...form, minAmount: event.target.value }))} className="h-11 bg-white" /></label>
                  <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">সর্বোচ্চ টাকা<Input inputMode="decimal" type="number" min="0" value={searchForm.maxAmount} onChange={event => setSearchForm(form => ({ ...form, maxAmount: event.target.value }))} className="h-11 bg-white" /></label>
                  <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" className="h-11 flex-1 rounded-xl bg-[#173f36] hover:bg-[#0f3028]"><Filter className="mr-2 h-4 w-4" />ফিল্টার প্রয়োগ করুন</Button><Button type="button" variant="outline" className="h-11 rounded-xl bg-white" onClick={clearSearch}>মুছুন</Button></div>
                </form>
                <div className="overflow-x-auto rounded-xl border border-[#e4ece6]"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f3f7f4] text-xs text-[#527064]"><tr><th className="px-4 py-3">তারিখ</th><th className="px-4 py-3">ভাউচার</th><th className="px-4 py-3">ক্যাটাগরি</th><th className="px-4 py-3">বিবরণ</th><th className="px-4 py-3">ধরন</th><th className="px-4 py-3 text-right">টাকা</th></tr></thead><tbody className="divide-y divide-[#edf2ee]">{searching ? <tr><td colSpan={6} className="px-4 py-8 text-center text-[#60786d]"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : results.length ? results.map(row => <tr key={row.id}><td className="whitespace-nowrap px-4 py-3 text-[#5d776d]">{dateLabel(row.occurredAt)}</td><td className="px-4 py-3 font-mono text-xs text-[#526e63]">{row.voucherNo || "—"}</td><td className="px-4 py-3 font-medium text-[#284e40]">{row.categoryName}</td><td className="max-w-64 truncate px-4 py-3 text-[#5d776d]">{row.note || "—"}</td><td className="px-4 py-3"><Badge className={row.type === "income" ? "bg-[#e2f5e7] text-[#17643f] hover:bg-[#e2f5e7]" : "bg-[#fff0e5] text-[#a34c15] hover:bg-[#fff0e5]"}>{row.type === "income" ? "আয়" : "ব্যয়"}</Badge></td><td className="px-4 py-3 text-right font-bold text-[#294f42]">{bdt(row.amount)}</td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-[#60786d]">এই শর্তে কোনো লেনদেন পাওয়া যায়নি।</td></tr>}</tbody></table></div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
