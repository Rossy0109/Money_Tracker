import React, { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Scale,
  DollarSign,
  Building,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Loader2,
} from "lucide-react";
import { openPrintWindow } from "@/lib/print/printWindow";

type PeriodPreset =
  "all" | "this_month" | "last_month" | "this_year" | "custom";

const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "all", label: "সর্বমোট (শুরু থেকে আজ পর্যন্ত)" },
  { value: "this_month", label: "এই মাস" },
  { value: "last_month", label: "গত মাস" },
  { value: "this_year", label: "এই বছর" },
  { value: "custom", label: "নির্দিষ্ট সময়কাল" },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseDateInput(value: string, endOfDay: boolean) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);
}

function formatPeriodLabel(period?: { from: Date | null; to: Date | null }) {
  if (!period?.from && !period?.to) return "শুরু থেকে আজ পর্যন্ত";
  const fmt = (date: Date) => date.toLocaleDateString("bn-BD");
  if (period.from && period.to)
    return `${fmt(period.from)} — ${fmt(period.to)}`;
  if (period.from) return `${fmt(period.from)} — আজ পর্যন্ত`;
  return `শুরু — ${fmt(period.to!)}`;
}

const taka = (value: number) => `৳ ${value.toLocaleString("bn-BD")}`;

const ACCOUNT_TYPE_BN: Record<string, string> = {
  ASSET: "সম্পদ",
  LIABILITY: "দায়",
  EQUITY: "ইকুইটি",
  REVENUE: "আয়",
  EXPENSE: "ব্যয়",
};

function accountLabel(name: string, nameBn: string | null) {
  return nameBn ? `${name} (${nameBn})` : name;
}

export default function FinancialStatements() {
  const { activeProjectId } = useActiveProject();
  const [activeTab, setActiveTab] = useState("trial_balance");
  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const period = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": {
        const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { from: startOfMonth(previous), to: endOfMonth(previous) };
      }
      case "this_year":
        return { from: new Date(now.getFullYear(), 0, 1), to: endOfMonth(now) };
      case "custom": {
        const from = parseDateInput(customFrom, false);
        const to = parseDateInput(customTo, true);
        if (!from && !to) return undefined;
        return { from, to };
      }
      default:
        return undefined;
    }
  }, [preset, customFrom, customTo]);

  const statementsQuery = trpc.finance.financialStatements.useQuery(
    { projectId: activeProjectId!, from: period?.from, to: period?.to },
    { enabled: !!activeProjectId }
  );

  const reconciliationQuery = trpc.finance.accountingReconciliation.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );

  const utils = trpc.useUtils();
  const backfill = trpc.finance.backfillOpeningBalances.useMutation({
    onSuccess: () => {
      void utils.finance.financialStatements.invalidate();
      void utils.finance.accountingReconciliation.invalidate();
    },
  });

  const data = statementsQuery.data;
  const pendingWallets =
    reconciliationQuery.data?.walletsMissingOpeningVoucher ?? [];

  const handlePrint = () => {
    if (!data) return;
    const html = document.querySelector(
      '[data-print-target="financial-statements"]'
    )?.outerHTML;
    if (html) {
      openPrintWindow({
        title: "আর্থিক বিবরণী ও লেজার",
        bodyHtml: html,
      });
    }
  };

  const trialBalanceLines = data?.trialBalance.lines ?? [];
  const revenueLines = data?.incomeStatement.revenue ?? [];
  const expenseLines = data?.incomeStatement.expenses ?? [];
  const assetLines = data?.balanceSheet.assets ?? [];
  const liabilityLines = data?.balanceSheet.liabilities ?? [];
  const equityLines = data?.balanceSheet.equity ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#dce7df] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#166534]">
              <FileSpreadsheet className="h-4 w-4" />
              <span>General Ledger · Chart of Accounts</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14382f] mt-1">
              আর্থিক বিবরণী ও লেজার
            </h1>
            <p className="text-xs sm:text-sm text-[#5a7a6c] mt-1">
              হিসাবখাতা ও খতিয়ান থেকে স্বয়ংক্রিয়ভাবে তৈরি রেওয়ামিল,
              লাভ-ক্ষতি বিবরণী ও ব্যালেন্স শিট।
            </p>
          </div>

          <Button
            onClick={handlePrint}
            variant="outline"
            className="h-11 rounded-2xl border-[#cfe0d5] text-[#166534] hover:bg-[#f0f7f2] font-semibold flex items-center gap-2 shadow-sm"
          >
            <Printer className="h-4 w-4" />
            প্রিন্ট / সেভ করুন
          </Button>
        </div>

        {/* Period filter */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#dce7df] shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-[#166534]">
              সময়কাল
            </span>
            <Select
              value={preset}
              onValueChange={value => setPreset(value as PeriodPreset)}
            >
              <SelectTrigger className="w-full rounded-2xl border-[#cfe0d5] h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === "custom" && (
            <>
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#166534]">
                  শুরু
                </span>
                <Input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={event => setCustomFrom(event.target.value)}
                  className="rounded-2xl border-[#cfe0d5] h-11"
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#166534]">
                  শেষ
                </span>
                <Input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={event => setCustomTo(event.target.value)}
                  className="rounded-2xl border-[#cfe0d5] h-11"
                />
              </div>
            </>
          )}

          {data && (
            <p className="text-xs text-[#698a7c] sm:pb-3">
              দেখানো হচ্ছে: {formatPeriodLabel(data.period)}
            </p>
          )}
        </div>

        {/* Legacy opening balances not yet in the ledger */}
        {pendingWallets.length > 0 && (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">
                  {pendingWallets.length}টি কয়েন্টারের শুরুর ব্যালেন্স এখনও
                  জেনারেল লেজারে যোগ হয়নি।
                </p>
                <p className="text-xs mt-1 text-amber-800">
                  এগুলো লেজারে পোস্ট করলে রেওয়ামিল ও ব্যালেন্স শিটে সম্পদ দেখা
                  যাবে।
                </p>
              </div>
            </div>
            <Button
              onClick={() =>
                backfill.mutate(
                  { projectId: activeProjectId! },
                  {
                    onError: () => undefined,
                  }
                )
              }
              disabled={backfill.isPending}
              className="rounded-2xl bg-amber-700 hover:bg-amber-800 text-white font-semibold flex items-center gap-2 shrink-0"
            >
              {backfill.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              লেজারে যোগ করুন
            </Button>
          </div>
        )}

        {statementsQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-[#5a7d6d] bg-white rounded-3xl border border-[#dce7df]">
            আর্থিক বিবরণী প্রস্তুত হচ্ছে...
          </div>
        ) : statementsQuery.isError ? (
          <div className="p-12 text-center text-sm text-red-700 bg-white rounded-3xl border border-red-200">
            বিবরণী লোড করা সম্ভব হয়নি।
          </div>
        ) : !data ? (
          <div className="p-12 text-center text-sm text-[#5a7d6d] bg-white rounded-3xl border border-[#dce7df]">
            বিবরণী লোড করা সম্ভব হয়নি।
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
            data-print-target="financial-statements"
          >
            <TabsList className="bg-white p-1.5 rounded-2xl border border-[#dce7df] grid grid-cols-3 max-w-md h-auto shadow-sm">
              <TabsTrigger
                value="trial_balance"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                রেওয়ামিল
              </TabsTrigger>
              <TabsTrigger
                value="pnl"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                লাভ-ক্ষতি
              </TabsTrigger>
              <TabsTrigger
                value="balance_sheet"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                ব্যালেন্স শিট
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Trial Balance */}
            <TabsContent value="trial_balance" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-4">
                <div className="border-b border-[#e5eee8] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#14382f]">
                      রেওয়ামিল (Trial Balance)
                    </h2>
                    <p className="text-xs text-[#698a7c]">
                      সব হিসাবখাতার ডেবিট ও ক্রেডিট খতিয়ানের সমাপনী ব্যালেন্স ·{" "}
                      {formatPeriodLabel(data.period)}
                    </p>
                  </div>
                  {data.trialBalance.isBalanced ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#eef7f1] text-[#166534] self-start sm:self-auto">
                      <CheckCircle2 className="h-4 w-4" /> ব্যালেন্স
                      সামঞ্জস্যপূর্ণ
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-red-50 text-red-700 self-start sm:self-auto">
                      <AlertTriangle className="h-4 w-4" /> ডেবিট ও ক্রেডিট সমান
                      নয়
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#f2f7f4] text-[#14382f] border-b border-[#cfe0d5]">
                        <th className="py-3 px-4 rounded-l-xl font-bold">
                          কোড
                        </th>
                        <th className="py-3 px-4 font-bold">
                          হিসাবের নাম (Account Title)
                        </th>
                        <th className="py-3 px-4 font-bold">ধরন</th>
                        <th className="py-3 px-4 text-right font-bold">
                          ডেবিট (৳)
                        </th>
                        <th className="py-3 px-4 text-right rounded-r-xl font-bold">
                          ক্রেডিট (৳)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {trialBalanceLines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 px-4 text-center text-xs text-gray-500"
                          >
                            কোনো হিসাবখাতার খতিয়ান এখনও নেই
                          </td>
                        </tr>
                      ) : (
                        trialBalanceLines.map(line => (
                          <tr
                            key={line.accountId}
                            className="hover:bg-gray-50/80"
                          >
                            <td className="py-2.5 px-4 font-mono text-xs text-gray-500">
                              {line.accountCode}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-gray-800">
                              {accountLabel(
                                line.accountName,
                                line.accountNameBn
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs uppercase text-gray-500">
                              {ACCOUNT_TYPE_BN[line.accountType] ??
                                line.accountType}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {line.debit > 0 ? taka(line.debit) : "-"}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono">
                              {line.credit > 0 ? taka(line.credit) : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-[#eef7f1] font-bold text-[#166534]">
                        <td colSpan={3} className="py-3 px-4 rounded-l-xl">
                          সর্বমোট ব্যালেন্স (Total):
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {taka(data.trialBalance.totalDebit)}
                        </td>
                        <td className="py-3 px-4 text-right rounded-r-xl font-mono">
                          {taka(data.trialBalance.totalCredit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: Profit & Loss Statement */}
            <TabsContent value="pnl" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-6">
                <div className="border-b border-[#e5eee8] pb-4 flex justify-between items-center gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#14382f]">
                      লাভ-ক্ষতি বিবরণী (Income Statement)
                    </h2>
                    <p className="text-xs text-[#698a7c]">
                      নির্বাচিত সময়কালের আয়, ব্যয় ও নিট ফলাফল ·{" "}
                      {formatPeriodLabel(data.period)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-[#698a7c]">
                      নিট লাভ / (ক্ষতি)
                    </span>
                    <div
                      className={`text-2xl font-bold ${
                        data.incomeStatement.netIncome >= 0
                          ? "text-green-700"
                          : "text-red-600"
                      }`}
                    >
                      {taka(data.incomeStatement.netIncome)}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" /> আয় (Revenue)
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {revenueLines.length === 0 ? (
                      <div className="text-xs text-gray-500 py-1">
                        এই সময়কালে কোনো আয় নেই
                      </div>
                    ) : (
                      revenueLines.map(line => (
                        <div
                          key={line.accountId}
                          className="flex justify-between py-1.5 px-3 rounded-lg bg-[#f9fcfa]"
                        >
                          <span className="text-[#20493b]">
                            <span className="font-mono text-xs text-gray-400 mr-2">
                              {line.accountCode}
                            </span>
                            {accountLabel(line.accountName, line.accountNameBn)}
                          </span>
                          <span className="font-semibold text-[#14382f]">
                            {taka(line.amount)}
                          </span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between py-2 px-3 rounded-xl bg-[#eef7f1] font-bold text-[#166534] mt-2">
                      <span>মোট আয় (Total Revenue):</span>
                      <span>{taka(data.incomeStatement.totalRevenue)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" /> ব্যয় (Expenses)
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {expenseLines.length === 0 ? (
                      <div className="text-xs text-gray-500 py-1">
                        এই সময়কালে কোনো ব্যয় নেই
                      </div>
                    ) : (
                      expenseLines.map(line => (
                        <div
                          key={line.accountId}
                          className="flex justify-between py-1.5 px-3 rounded-lg bg-[#fdfaf8]"
                        >
                          <span className="text-[#492720]">
                            <span className="font-mono text-xs text-gray-400 mr-2">
                              {line.accountCode}
                            </span>
                            {accountLabel(line.accountName, line.accountNameBn)}
                          </span>
                          <span className="font-semibold text-[#381a14]">
                            {taka(line.amount)}
                          </span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between py-2 px-3 rounded-xl bg-[#fdf2ef] font-bold text-red-700 mt-2">
                      <span>মোট ব্যয় (Total Expenses):</span>
                      <span>{taka(data.incomeStatement.totalExpenses)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#113a30] text-white flex justify-between items-center gap-3 shadow-md">
                  <div>
                    <span className="text-xs text-[#a9dcbd] block font-medium">
                      নিট ফলাফল:
                    </span>
                    <span className="text-lg font-bold">নিট লাভ / (ক্ষতি)</span>
                  </div>
                  <span className="text-2xl font-bold font-mono">
                    {taka(data.incomeStatement.netIncome)}
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: Balance Sheet */}
            <TabsContent value="balance_sheet" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-6">
                <div className="border-b border-[#e5eee8] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#14382f]">
                      উদ্বৃত্তপত্র / ব্যালেন্স শিট (Balance Sheet)
                    </h2>
                    <p className="text-xs text-[#698a7c]">
                      সম্পদ = দায় + মালিকানা স্বত্ব (Assets = Liabilities +
                      Equity) · {formatPeriodLabel(data.period)}
                    </p>
                  </div>
                  {data.balanceSheet.isBalanced ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#eef7f1] text-[#166534] self-start sm:self-auto">
                      <CheckCircle2 className="h-4 w-4" /> ব্যালেন্স
                      সামঞ্জস্যপূর্ণ
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-red-50 text-red-700 self-start sm:self-auto">
                      <AlertTriangle className="h-4 w-4" /> সম্পদ ও দায়ের মধ্যে
                      পার্থক্য আছে
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Assets */}
                  <div className="space-y-4 p-5 rounded-2xl bg-[#f9fcfa] border border-[#e0ede4]">
                    <h3 className="text-sm font-bold text-[#166534] uppercase tracking-wider flex items-center gap-1.5">
                      <Building className="h-4 w-4" /> সম্পদ (Assets)
                    </h3>
                    <div className="space-y-2 text-xs">
                      {assetLines.length === 0 ? (
                        <div className="text-gray-500 py-1">কোনো সম্পদ নেই</div>
                      ) : (
                        assetLines.map(line => (
                          <div
                            key={line.accountId ?? line.accountCode}
                            className="flex justify-between py-1 border-b border-gray-100"
                          >
                            <span>
                              <span className="font-mono text-gray-400 mr-2">
                                {line.accountCode}
                              </span>
                              {accountLabel(
                                line.accountName,
                                line.accountNameBn
                              )}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {taka(line.amount)}
                            </span>
                          </div>
                        ))
                      )}
                      <div className="flex justify-between py-2 pt-3 font-bold text-sm text-[#166534]">
                        <span>মোট সম্পদ (Total Assets):</span>
                        <span>{taka(data.balanceSheet.totalAssets)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Liabilities & Equity */}
                  <div className="space-y-4 p-5 rounded-2xl bg-[#fafafa] border border-[#e5e5e5]">
                    <h3 className="text-sm font-bold text-[#14382f] uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-[#166534]" /> দায় ও ইকুইটি
                      (Liabilities &amp; Equity)
                    </h3>
                    <div className="space-y-2 text-xs">
                      {liabilityLines.length === 0 ? (
                        <div className="text-gray-500 py-1">কোনো দায় নেই</div>
                      ) : (
                        liabilityLines.map(line => (
                          <div
                            key={line.accountId ?? line.accountCode}
                            className="flex justify-between py-1 border-b border-gray-100"
                          >
                            <span>
                              <span className="font-mono text-gray-400 mr-2">
                                {line.accountCode}
                              </span>
                              {accountLabel(
                                line.accountName,
                                line.accountNameBn
                              )}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {taka(line.amount)}
                            </span>
                          </div>
                        ))
                      )}
                      <div className="flex justify-between py-2 pt-2 font-bold text-sm text-[#14382f]">
                        <span>মোট দায় (Total Liabilities):</span>
                        <span>{taka(data.balanceSheet.totalLiabilities)}</span>
                      </div>

                      <div className="pt-2 border-t border-gray-200">
                        {equityLines.length === 0 ? (
                          <div className="text-gray-500 py-1">
                            কোনো ইকুইটি নেই
                          </div>
                        ) : (
                          equityLines.map(line => (
                            <div
                              key={line.accountId ?? line.accountCode}
                              className="flex justify-between py-1 border-b border-gray-100"
                            >
                              <span>
                                <span className="font-mono text-gray-400 mr-2">
                                  {line.accountCode}
                                </span>
                                {accountLabel(
                                  line.accountName,
                                  line.accountNameBn
                                )}
                              </span>
                              <span className="font-semibold text-gray-900">
                                {taka(line.amount)}
                              </span>
                            </div>
                          ))
                        )}
                        <div className="flex justify-between py-2 pt-2 font-bold text-sm text-[#14382f]">
                          <span>মোট ইকুইটি (Total Equity):</span>
                          <span>{taka(data.balanceSheet.totalEquity)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between py-2 pt-3 border-t border-[#e5e5e5] font-bold text-sm text-[#14382f]">
                        <span>মোট দায় ও মালিকানা স্বত্ব:</span>
                        <span>
                          {taka(
                            data.balanceSheet.totalLiabilities +
                              data.balanceSheet.totalEquity
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
