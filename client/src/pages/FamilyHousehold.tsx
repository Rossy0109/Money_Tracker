import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, ChartColumnIncreasing, Clock3, House, Plus, ShieldCheck, UserPlus, UsersRound, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const taka = (value: number) => `৳ ${new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(value)}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const comparisonColors = ["#2d8554", "#2d6ea1", "#b4672d", "#8257a6", "#bd4d69", "#337c82"];
const monthText = (monthKey: string) => new Intl.DateTimeFormat("bn-BD", { month: "short" }).format(new Date(`${monthKey}-01T12:00:00.000Z`));

function roleLabel(role: "owner" | "editor" | "viewer") {
  return role === "owner" ? "পরিচালক" : role === "editor" ? "সম্পাদক" : "দর্শক";
}

export default function FamilyHousehold() {
  const utils = trpc.useUtils();
  const { data: households = [], isLoading: householdsLoading } = trpc.finance.households.useQuery();
  const { data: invitations = [] } = trpc.finance.householdInvitations.useQuery();
  const [householdId, setHouseholdId] = useState<number | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [invite, setInvite] = useState({ email: "", displayName: "", role: "editor" as "editor" | "viewer" });
  const [budget, setBudget] = useState({ label: "", amount: "" });
  const [expense, setExpense] = useState({ budgetId: "", amount: "", note: "" });

  useEffect(() => {
    if (householdId === null && households.length) setHouseholdId(households[0].id);
  }, [households, householdId]);

  const overviewQuery = trpc.finance.householdOverview.useQuery(
    { householdId: householdId ?? 0 },
    { enabled: householdId !== null }
  );
  const overview = overviewQuery.data;
  const canManage = overview?.currentRole === "owner";
  const canContribute = overview?.currentRole === "owner" || overview?.currentRole === "editor";
  const currentMonth = useMemo(thisMonth, []);
  const contributorSpend = overview?.contributorSpend ?? [];
  const contributorTotal = contributorSpend.reduce((total, item) => total + item.amount, 0);
  const monthlyContributorSpend = overview?.monthlyContributorSpend;
  const monthlyContributors = monthlyContributorSpend?.contributors ?? [];
  const monthlyChartData = useMemo(() => monthlyContributorSpend?.months.map(month => ({
    monthKey: month.monthKey,
    ...Object.fromEntries(month.contributors.map(item => [`member-${item.contributorUserId}`, item.amount])),
  })) ?? [], [monthlyContributorSpend]);
  const monthlyComparisonTotal = monthlyContributorSpend?.months.reduce((total, month) => total + month.totalAmount, 0) ?? 0;
  const refresh = async () => {
    await Promise.all([
      utils.finance.households.invalidate(),
      utils.finance.householdInvitations.invalidate(),
      householdId !== null ? utils.finance.householdOverview.invalidate({ householdId }) : Promise.resolve(),
    ]);
  };

  const createHousehold = trpc.finance.createHousehold.useMutation({
    onSuccess: async (created) => {
      setHouseholdName("");
      setHouseholdId(created.household.id);
      await refresh();
      toast.success("পারিবারিক প্রোফাইল তৈরি হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const acceptInvitation = trpc.finance.acceptHouseholdInvitation.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("পারিবারিক আমন্ত্রণ গ্রহণ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const inviteMember = trpc.finance.inviteHouseholdMember.useMutation({
    onSuccess: async () => {
      setInvite({ email: "", displayName: "", role: "editor" });
      await refresh();
      toast.success("সদস্যের আমন্ত্রণ প্রস্তুত হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const changeMember = trpc.finance.updateHouseholdMember.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const saveBudget = trpc.finance.saveSharedHouseholdBudget.useMutation({
    onSuccess: async () => {
      setBudget({ label: "", amount: "" });
      await refresh();
      toast.success("শেয়ার করা বাজেট সংরক্ষিত হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const addExpense = trpc.finance.addSharedHouseholdExpense.useMutation({
    onSuccess: async () => {
      setExpense({ budgetId: "", amount: "", note: "" });
      await refresh();
      toast.success("পরিবারের খরচ যোগ হয়েছে");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-6">
        <header className="rounded-[1.75rem] bg-[#143f35] p-5 text-white shadow-[0_18px_45px_rgba(20,63,53,.16)] sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold tracking-[.14em] text-[#bfe7c9]"><House className="h-4 w-4" /> পরিবারের হিসাব</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">একসঙ্গে বাজেট, আলাদা দায়িত্ব</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d4e9da]">ব্যক্তিগত প্রজেক্ট অপরিবর্তিত রেখে পরিবারের সদস্য, ভূমিকা এবং মাসিক শেয়ার করা বাজেট পরিচালনা করুন।</p>
            </div>
            {households.length > 0 && <Select value={String(householdId ?? households[0].id)} onValueChange={value => setHouseholdId(Number(value))}>
              <SelectTrigger className="h-11 w-full border-white/25 bg-white/10 text-white sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>{households.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
            </Select>}
          </div>
        </header>

        {invitations.length > 0 && <Alert className="border-[#81b99a] bg-[#edf9ef] text-[#174b30]">
          <UsersRound aria-hidden="true" />
          <AlertTitle>পারিবারিক আমন্ত্রণ অপেক্ষায় আছে</AlertTitle>
          <AlertDescription className="mt-2 space-y-2 text-[#285d42]">
            {invitations.map(item => <div key={item.membershipId} className="flex flex-col gap-2 rounded-xl bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span><strong>{item.householdName}</strong> — {roleLabel(item.role)} হিসেবে আমন্ত্রণ</span>
              <Button size="sm" className="h-10 bg-[#1d6b42] hover:bg-[#155434]" onClick={() => acceptInvitation.mutate({ membershipId: item.membershipId })}>গ্রহণ করুন</Button>
            </div>)}
          </AlertDescription>
        </Alert>}

        <Card className="border-[#dce9df] shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[#173f36]"><Plus className="h-5 w-5 text-[#2b7a4b]" /> নতুন পারিবারিক প্রোফাইল</CardTitle><CardDescription>আপনি পরিচালক হিসেবে যুক্ত হবেন; ব্যক্তিগত প্রজেক্টের তথ্য এতে যুক্ত হবে না।</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Input value={householdName} onChange={event => setHouseholdName(event.target.value)} className="h-11" placeholder="যেমন: আহমেদ পরিবার" maxLength={120} />
            <Button className="h-11 min-w-40 bg-[#173f36] hover:bg-[#0d3028]" disabled={!householdName.trim() || createHousehold.isPending} onClick={() => createHousehold.mutate({ name: householdName.trim() })}>প্রোফাইল তৈরি করুন</Button>
          </CardContent>
        </Card>

        {householdsLoading ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">পারিবারিক প্রোফাইল লোড হচ্ছে…</CardContent></Card> : overview ? <>
          <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <Card className="border-[#dce9df]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><UsersRound className="h-5 w-5 text-[#2b7a4b]" /> সদস্য প্রোফাইল</CardTitle><CardDescription>আপনার ভূমিকা: <strong>{roleLabel(overview.currentRole)}</strong></CardDescription></CardHeader><CardContent className="space-y-3">
              {overview.owner && <MemberRow name={overview.owner.name || overview.owner.email || "পরিচালক"} email={overview.owner.email} role="owner" status="active" />}
              {overview.members.map(member => <div key={member.id} className="rounded-xl border border-[#e2ece4] p-3"><MemberRow name={member.userName || member.displayName || member.inviteeEmail} email={member.userEmail || member.inviteeEmail} role={member.role} status={member.status} />
                {canManage && member.status !== "revoked" && <div className="mt-3 flex flex-wrap gap-2 border-t border-[#edf2ee] pt-3">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => changeMember.mutate({ householdId: overview.household.id, membershipId: member.id, role: member.role === "editor" ? "viewer" : "editor" })}>{member.role === "editor" ? "দর্শক করুন" : "সম্পাদক করুন"}</Button>
                  <Button variant="outline" size="sm" className="h-9 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => changeMember.mutate({ householdId: overview.household.id, membershipId: member.id, status: "revoked" })}>অপসারণ করুন</Button>
                </div>}</div>)}
            </CardContent></Card>

            <Card className="border-[#dce9df]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><UserPlus className="h-5 w-5 text-[#2b7a4b]" /> সদস্য আমন্ত্রণ</CardTitle><CardDescription>শুধু পরিচালক সদস্যের ইমেইলে আমন্ত্রণ পাঠাতে পারেন।</CardDescription></CardHeader><CardContent>
              {canManage ? <div className="space-y-3"><Input className="h-11" type="email" value={invite.email} onChange={event => setInvite(current => ({ ...current, email: event.target.value }))} placeholder="সদস্যের ইমেইল" /><Input className="h-11" value={invite.displayName} onChange={event => setInvite(current => ({ ...current, displayName: event.target.value }))} placeholder="নাম (ঐচ্ছিক)" /><Select value={invite.role} onValueChange={(value: "editor" | "viewer") => setInvite(current => ({ ...current, role: value }))}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="editor">সম্পাদক — খরচ যোগ করতে পারবেন</SelectItem><SelectItem value="viewer">দর্শক — শুধু দেখতে পারবেন</SelectItem></SelectContent></Select><Button className="h-11 w-full bg-[#173f36] hover:bg-[#0d3028]" disabled={!invite.email.trim() || inviteMember.isPending} onClick={() => inviteMember.mutate({ householdId: overview.household.id, ...invite, email: invite.email.trim(), displayName: invite.displayName.trim() || undefined })}>আমন্ত্রণ তৈরি করুন</Button></div> : <p className="rounded-xl bg-[#f6faf7] p-4 text-sm leading-6 text-[#567267]">সদস্য যুক্ত বা ভূমিকা পরিবর্তনের অধিকার শুধু পরিচালকের আছে।</p>}
            </CardContent></Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <Card className="border-[#dce9df]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><WalletCards className="h-5 w-5 text-[#2b7a4b]" /> শেয়ার করা বাজেট</CardTitle><CardDescription>{currentMonth} মাসের পরিবারভিত্তিক বরাদ্দ ও খরচ।</CardDescription></CardHeader><CardContent className="space-y-4">
              {overview.sharedBudgets.length ? overview.sharedBudgets.map(item => <div key={item.id} className="rounded-xl border border-[#e3ece5] p-3.5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"><div className="min-w-0"><p className="break-words font-semibold text-[#193d34]">{item.label}</p><p className="mt-1 text-xs text-[#668075]">খরচ {taka(item.spent)} / {taka(Number(item.amount))}</p></div><BudgetStatus status={item.status} percent={item.percent} /></div><Progress value={Math.min(100, item.percent)} className="mt-3 h-2.5" /><p className="mt-2 text-xs text-[#668075]">{item.remaining >= 0 ? `বাকি ${taka(item.remaining)}` : `সীমার চেয়ে ${taka(Math.abs(item.remaining))} বেশি`}</p></div>) : <p className="rounded-xl bg-[#f6faf7] p-4 text-sm text-[#5d766b]">এই মাসে এখনো কোনো শেয়ার করা বাজেট নেই।</p>}
              {canManage && <div className="grid gap-2 border-t border-[#e7eee8] pt-4 sm:grid-cols-[1fr_150px_auto]"><Input className="h-11" value={budget.label} onChange={event => setBudget(current => ({ ...current, label: event.target.value }))} placeholder="বাজেটের নাম" /><Input className="h-11" inputMode="decimal" value={budget.amount} onChange={event => setBudget(current => ({ ...current, amount: event.target.value }))} placeholder="টাকা" /><Button className="h-11 bg-[#173f36] hover:bg-[#0d3028]" disabled={!budget.label.trim() || !Number(budget.amount)} onClick={() => saveBudget.mutate({ householdId: overview.household.id, label: budget.label.trim(), monthKey: currentMonth, amount: Number(budget.amount) })}>সংরক্ষণ</Button></div>}
            </CardContent></Card>

            <Card className="border-[#dce9df]"><CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><Plus className="h-5 w-5 text-[#2b7a4b]" /> পরিবারের খরচ যোগ করুন</CardTitle><CardDescription>এই খরচ শুধু নির্বাচিত পারিবারিক প্রোফাইলের শেয়ার করা বাজেটে যুক্ত হবে।</CardDescription></CardHeader><CardContent>
              {canContribute ? <div className="space-y-3"><Select value={expense.budgetId} onValueChange={value => setExpense(current => ({ ...current, budgetId: value }))}><SelectTrigger className="h-11"><SelectValue placeholder="বাজেট নির্বাচন করুন" /></SelectTrigger><SelectContent>{overview.sharedBudgets.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.label}</SelectItem>)}</SelectContent></Select><Input className="h-11" inputMode="decimal" value={expense.amount} onChange={event => setExpense(current => ({ ...current, amount: event.target.value }))} placeholder="খরচের টাকা" /><Input className="h-11" value={expense.note} onChange={event => setExpense(current => ({ ...current, note: event.target.value }))} placeholder="বিবরণ (ঐচ্ছিক)" /><Button className="h-11 w-full bg-[#1d6b42] hover:bg-[#155434]" disabled={!expense.budgetId || !Number(expense.amount) || addExpense.isPending} onClick={() => addExpense.mutate({ householdId: overview.household.id, budgetId: Number(expense.budgetId), amount: Number(expense.amount), note: expense.note.trim() || undefined, occurredAt: new Date() })}>খরচ যোগ করুন</Button></div> : <p className="rounded-xl bg-[#f6faf7] p-4 text-sm leading-6 text-[#5d766b]">এই প্রোফাইলে খরচ যোগ করার অনুমতি আপনার নেই। পরিচালক বা সম্পাদক তা করতে পারবেন।</p>}
              {overview.recentExpenses.length > 0 && <div className="mt-5 border-t border-[#e7eee8] pt-4"><p className="mb-2 text-xs font-bold tracking-wide text-[#557468]">সাম্প্রতিক খরচ</p>{overview.recentExpenses.slice(0, 4).map(item => <div key={item.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="break-words text-[#3d5b4e]">{item.note || "পরিবারের খরচ"}</span><strong className="shrink-0 text-[#173f36]">{taka(Number(item.amount))}</strong></div>)}</div>}
            </CardContent></Card>
          </section>

          <section>
            <Card className="border-[#dce9df] shadow-sm">
              <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-[#173f36]"><ChartColumnIncreasing className="h-5 w-5 text-[#2b7a4b]" /> সদস্যভিত্তিক ব্যয় বিশ্লেষণ</CardTitle>
                  <CardDescription>{currentMonth} মাসে শেয়ার করা বাজেট থেকে কে কত খরচ যোগ করেছেন তার সারাংশ।</CardDescription>
                </div>
                {contributorSpend.length > 0 && <Badge variant="secondary" className="w-fit bg-[#e8f5eb] text-[#215b37]">মোট {taka(contributorTotal)}</Badge>}
              </CardHeader>
              <CardContent>
                {contributorSpend.length > 0 ? <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] xl:items-start">
                  <div className="min-h-60" style={{ height: `${Math.max(240, contributorSpend.length * 52)}px` }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={contributorSpend} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid horizontal={false} stroke="#e5eee7" />
                        <XAxis type="number" tick={{ fill: "#668075", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={value => `৳${new Intl.NumberFormat("bn-BD", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))}`} />
                        <YAxis type="category" dataKey="contributorName" width={92} tick={{ fill: "#315a49", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "#f2f8f3" }} formatter={value => [taka(Number(value)), "খরচ"]} labelFormatter={label => `${label} এর খরচ`} contentStyle={{ borderRadius: 12, borderColor: "#cfe2d3", color: "#173f36" }} />
                        <Bar dataKey="amount" name="খরচ" fill="#2d8554" radius={[0, 7, 7, 0]} maxBarSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="divide-y divide-[#e7eee8] rounded-xl border border-[#e0ebe2]">
                    {contributorSpend.map(item => <div key={item.contributorUserId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><p className="break-words font-semibold text-[#193d34]">{item.contributorName}</p><p className="mt-0.5 text-xs text-[#668075]">{new Intl.NumberFormat("bn-BD").format(item.entryCount)}টি খরচ · মোটের {new Intl.NumberFormat("bn-BD").format(item.percent)}%</p></div>
                      <strong className="shrink-0 text-[#173f36]">{taka(item.amount)}</strong>
                    </div>)}
                  </div>
                </div> : <div className="rounded-xl border border-dashed border-[#cbded0] bg-[#f7fbf8] p-6 text-center"><ChartColumnIncreasing className="mx-auto h-8 w-8 text-[#5f9873]" /><p className="mt-3 font-semibold text-[#244f3e]">এ মাসে সদস্যভিত্তিক খরচের তথ্য নেই</p><p className="mt-1 text-sm leading-6 text-[#668075]">পরিচালক বা সম্পাদক শেয়ার করা বাজেটে খরচ যোগ করলে এখানে সদস্য অনুযায়ী বিশ্লেষণ দেখা যাবে।</p></div>}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-[#dce9df] shadow-sm">
              <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-[#173f36]"><ChartColumnIncreasing className="h-5 w-5 text-[#2b7a4b]" /> সদস্যদের মাসিক খরচের তুলনা</CardTitle>
                  <CardDescription>গত ৬ মাসে শেয়ার করা বাজেটে প্রত্যেক সদস্য কত খরচ যোগ করেছেন তার মাসভিত্তিক তুলনা।</CardDescription>
                </div>
                {monthlyContributors.length > 0 && <Badge variant="secondary" className="w-fit bg-[#e8f5eb] text-[#215b37]">৬ মাসে {taka(monthlyComparisonTotal)}</Badge>}
              </CardHeader>
              <CardContent>
                {monthlyContributors.length > 0 ? <div className="space-y-5">
                  <div className="h-72 min-w-0 sm:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
                        <CartesianGrid vertical={false} stroke="#e5eee7" />
                        <XAxis dataKey="monthKey" tickFormatter={monthText} tick={{ fill: "#668075", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={value => `৳${new Intl.NumberFormat("bn-BD", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))}`} tick={{ fill: "#668075", fontSize: 12 }} axisLine={false} tickLine={false} width={54} />
                        <Tooltip cursor={{ fill: "#f2f8f3" }} formatter={(value, name) => [taka(Number(value)), name]} labelFormatter={label => `${monthText(String(label))} মাস`} contentStyle={{ borderRadius: 12, borderColor: "#cfe2d3", color: "#173f36" }} />
                        <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
                        {monthlyContributors.map((member, index) => <Bar key={member.contributorUserId} dataKey={`member-${member.contributorUserId}`} name={member.contributorName} fill={comparisonColors[index % comparisonColors.length]} radius={[6, 6, 0, 0]} maxBarSize={34} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {monthlyContributors.map((member, index) => <div key={member.contributorUserId} className="rounded-xl border border-[#e0ebe2] bg-[#fbfdfb] p-3">
                      <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: comparisonColors[index % comparisonColors.length] }} /><p className="break-words font-semibold text-[#193d34]">{member.contributorName}</p></div>
                      <p className="mt-2 text-lg font-bold text-[#173f36]">{taka(member.amount)}</p>
                      <p className="mt-0.5 text-xs text-[#668075]">৬ মাসে {new Intl.NumberFormat("bn-BD").format(member.entryCount)}টি খরচ</p>
                    </div>)}
                  </div>
                </div> : <div className="rounded-xl border border-dashed border-[#cbded0] bg-[#f7fbf8] p-6 text-center"><ChartColumnIncreasing className="mx-auto h-8 w-8 text-[#5f9873]" /><p className="mt-3 font-semibold text-[#244f3e]">গত ৬ মাসে তুলনা করার মতো তথ্য নেই</p><p className="mt-1 text-sm leading-6 text-[#668075]">শেয়ার করা বাজেটে খরচ যোগ হলে এখানে সদস্যদের মাসভিত্তিক তুলনা দেখা যাবে।</p></div>}
              </CardContent>
            </Card>
          </section>
        </> : <Card className="border-dashed border-[#c8d9cc]"><CardContent className="p-10 text-center"><UsersRound className="mx-auto h-9 w-9 text-[#4d8967]" /><h2 className="mt-3 text-lg font-semibold text-[#173f36]">একটি পারিবারিক প্রোফাইল তৈরি করুন</h2><p className="mt-2 text-sm text-[#688176]">তারপর সদস্যদের আমন্ত্রণ দিন ও একসঙ্গে মাসিক বাজেট পরিচালনা করুন।</p></CardContent></Card>}
      </main>
    </DashboardLayout>
  );
}

function MemberRow({ name, email, role, status }: { name: string; email?: string | null; role: "owner" | "editor" | "viewer"; status: "active" | "pending" | "declined" | "revoked" }) {
  const statusLabel = status === "active" ? "সক্রিয়" : status === "pending" ? "অপেক্ষমাণ" : status === "declined" ? "প্রত্যাখ্যাত" : "অপসারিত";
  return <div className="flex flex-col gap-2 rounded-xl bg-[#f8fbf8] p-2.5 sm:flex-row sm:items-center sm:bg-transparent sm:p-0"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f4eb] text-sm font-bold text-[#276b44]">{name.charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="break-words font-medium text-[#173f36]">{name}</p>{email && <p className="break-all text-xs text-[#6d8579]">{email}</p>}</div></div><div className="flex flex-row items-center gap-2 sm:ml-auto sm:flex-col sm:items-end sm:gap-1"><Badge variant="secondary" className="bg-[#edf5ef] text-[#326e4a]">{roleLabel(role)}</Badge><span className="text-[11px] text-[#698176]">{statusLabel}</span></div></div>;
}

function BudgetStatus({ status, percent }: { status: string; percent: number }) {
  const isExceeded = status === "exceeded";
  const text = isExceeded ? "সীমা অতিক্রম" : status === "warning90" ? "৯০% সতর্কতা" : status === "warning80" ? "৮০% সতর্কতা" : `${percent}% ব্যবহৃত`;
  return <Badge className={isExceeded ? "bg-rose-100 text-rose-700 hover:bg-rose-100" : status === "normal" ? "bg-[#eaf5ec] text-[#286442] hover:bg-[#eaf5ec]" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>{text}</Badge>;
}
