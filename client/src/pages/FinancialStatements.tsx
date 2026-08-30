import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Scale,
  DollarSign,
  Building,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

export default function FinancialStatements() {
  const { activeProjectId } = useActiveProject();
  const [activeTab, setActiveTab] = useState("pnl");

  const statementsQuery = trpc.finance.financialStatements.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );

  const data = statementsQuery.data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl border border-[#dce7df] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#166534]">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Standard Double-Entry Bookkeeping</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14382f] mt-1">
              আর্থিক বিবরণী ও লেজার
            </h1>
            <p className="text-xs sm:text-sm text-[#5a7a6c] mt-1">
              লাভ-ক্ষতি বিবরণী (P&L), ব্যালেন্স শিট এবং রেওয়ামিল (Trial Balance) এর স্বয়ংক্রিয় হিসাব।
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

        {statementsQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-[#5a7d6d] bg-white rounded-3xl border border-[#dce7df]">
            আর্থিক বিবরণী প্রস্তুত হচ্ছে...
          </div>
        ) : !data ? (
          <div className="p-12 text-center text-sm text-[#5a7d6d] bg-white rounded-3xl border border-[#dce7df]">
            বিবরণী লোড করা সম্ভব হয়নি।
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-white p-1.5 rounded-2xl border border-[#dce7df] grid grid-cols-3 max-w-md h-auto shadow-sm">
              <TabsTrigger
                value="pnl"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                লাভ-ক্ষতি বিবরণী
              </TabsTrigger>
              <TabsTrigger
                value="balance_sheet"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                ব্যালেন্স শিট
              </TabsTrigger>
              <TabsTrigger
                value="trial_balance"
                className="py-2 text-xs sm:text-sm font-semibold rounded-xl data-[state=active]:bg-[#166534] data-[state=active]:text-white transition"
              >
                রেওয়ামিল
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Profit & Loss Statement */}
            <TabsContent value="pnl" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-6">
                <div className="border-b border-[#e5eee8] pb-4 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-[#14382f]">লাভ-ক্ষতি বিবরণী (Income Statement)</h2>
                    <p className="text-xs text-[#698a7c]">চলতি সময়কালের মোট আয়, পরিচালন ব্যয় ও নিট মুনাফা</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-[#698a7c]">নিট লাভ / (ক্ষতি)</span>
                    <div
                      className={`text-2xl font-bold ${
                        data.profitAndLoss.netProfit >= 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      ৳ {data.profitAndLoss.netProfit.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Revenue Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#166534] flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" /> পরিচালন আয় (Operating Revenue)
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {data.profitAndLoss.revenueCategories.length === 0 ? (
                      <div className="text-xs text-gray-500 py-1">কোনো আয়ের রেকর্ড নেই</div>
                    ) : (
                      data.profitAndLoss.revenueCategories.map((cat, idx) => (
                        <div key={idx} className="flex justify-between py-1.5 px-3 rounded-lg bg-[#f9fcfa]">
                          <span className="text-[#20493b]">{cat.name}</span>
                          <span className="font-semibold text-[#14382f]">৳ {cat.amount.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between py-2 px-3 rounded-xl bg-[#eef7f1] font-bold text-[#166534] mt-2">
                      <span>মোট পরিচালন আয় (Gross Revenue):</span>
                      <span>৳ {data.profitAndLoss.operatingRevenue.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Operating Expenses Section */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" /> পরিচালন ও সাধারণ ব্যয় (Operating Expenses)
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    {data.profitAndLoss.expenseCategories.length === 0 ? (
                      <div className="text-xs text-gray-500 py-1">কোনো ব্যয়ের রেকর্ড নেই</div>
                    ) : (
                      data.profitAndLoss.expenseCategories.map((cat, idx) => (
                        <div key={idx} className="flex justify-between py-1.5 px-3 rounded-lg bg-[#fdfaf8]">
                          <span className="text-[#492720]">{cat.name}</span>
                          <span className="font-semibold text-[#381a14]">৳ {cat.amount.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                    <div className="flex justify-between py-2 px-3 rounded-xl bg-[#fdf2ef] font-bold text-red-700 mt-2">
                      <span>মোট ব্যয় (Total Operating Expenses):</span>
                      <span>৳ {data.profitAndLoss.operatingExpenses.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Net Profit Bar */}
                <div className="p-4 rounded-2xl bg-[#113a30] text-white flex justify-between items-center shadow-md">
                  <div>
                    <span className="text-xs text-[#a9dcbd] block font-medium">সর্বশেষ হিসাবকৃত নিট ফলাফল:</span>
                    <span className="text-lg font-bold">নিট পরিচালন মুনাফা (Net Operating Profit)</span>
                  </div>
                  <span className="text-2xl font-bold font-mono">
                    ৳ {data.profitAndLoss.netProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: Balance Sheet */}
            <TabsContent value="balance_sheet" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-6">
                <div className="border-b border-[#e5eee8] pb-4 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-[#14382f]">উদ্বৃত্তপত্র / ব্যালেন্স শিট (Balance Sheet)</h2>
                    <p className="text-xs text-[#698a7c]">সম্পদ = দায় + মালিকানা স্বত্ব (Assets = Liabilities + Equity)</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#eef7f1] text-[#166534]">
                    <CheckCircle2 className="h-4 w-4 text-[#166534]" /> ব্যালেন্স সামঞ্জস্যপূর্ণ (Balanced)
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Assets */}
                  <div className="space-y-4 p-5 rounded-2xl bg-[#f9fcfa] border border-[#e0ede4]">
                    <h3 className="text-sm font-bold text-[#166534] uppercase tracking-wider flex items-center gap-1.5">
                      <Building className="h-4 w-4" /> ১. চলতি ও স্থায়ী সম্পদ (Assets)
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span>নগদ ও ব্যাংক উদ্বৃত্ত (Cash & Bank):</span>
                        <span className="font-semibold text-gray-900">
                          ৳ {data.balanceSheet.currentAssets.cashAndBank.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span>হিসাব প্রাপ্য / দেনাদার (Accounts Receivable):</span>
                        <span className="font-semibold text-gray-900">
                          ৳ {data.balanceSheet.currentAssets.accountsReceivable.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 pt-3 font-bold text-sm text-[#166534]">
                        <span>মোট সম্পদ (Total Assets):</span>
                        <span>৳ {data.balanceSheet.totalAssets.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Liabilities & Equity */}
                  <div className="space-y-4 p-5 rounded-2xl bg-[#fafafa] border border-[#e5e5e5]">
                    <h3 className="text-sm font-bold text-[#14382f] uppercase tracking-wider flex items-center gap-1.5">
                      <Scale className="h-4 w-4 text-[#166534]" /> ২. দায় ও ইকুইটি (Liabilities & Equity)
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span>হিসাব প্রদেয় / পাওনাদার (Accounts Payable):</span>
                        <span className="font-semibold text-gray-900">
                          ৳ {data.balanceSheet.currentLiabilities.accountsPayable.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span>চলতি মেয়াদের নিট লাভ:</span>
                        <span className="font-semibold text-green-700">
                          ৳ {data.balanceSheet.equity.currentPeriodProfit.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100">
                        <span>পুঞ্জীভূত মূলধন (Retained Capital):</span>
                        <span className="font-semibold text-gray-900">
                          ৳ {data.balanceSheet.equity.retainedEarnings.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between py-2 pt-3 font-bold text-sm text-[#14382f]">
                        <span>মোট দায় ও মালিকানা স্বত্ব:</span>
                        <span>৳ {(data.balanceSheet.totalLiabilities + data.balanceSheet.equity.totalEquity).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: Trial Balance */}
            <TabsContent value="trial_balance" className="space-y-5">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#dce7df] shadow-sm space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-[#14382f]">রেওয়ামিল (Trial Balance)</h2>
                  <p className="text-xs text-[#698a7c]">সকল ডেবিট ও ক্রেডিট খতিয়ানের সমাপনী ব্যালেন্স যাচাই</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-[#f2f7f4] text-[#14382f] border-b border-[#cfe0d5]">
                        <th className="py-3 px-4 rounded-l-xl font-bold">হিসাবের নাম (Account Title)</th>
                        <th className="py-3 px-4 font-bold">হিসাবের ধরন</th>
                        <th className="py-3 px-4 text-right font-bold">ডেবিট (৳)</th>
                        <th className="py-3 px-4 text-right rounded-r-xl font-bold">ক্রেডিট (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.trialBalance.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/80">
                          <td className="py-2.5 px-4 font-medium text-gray-800">{item.accountName}</td>
                          <td className="py-2.5 px-4 text-xs uppercase text-gray-500">{item.type}</td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {item.debit > 0 ? `৳ ${item.debit.toLocaleString()}` : "-"}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {item.credit > 0 ? `৳ ${item.credit.toLocaleString()}` : "-"}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[#eef7f1] font-bold text-[#166534]">
                        <td colSpan={2} className="py-3 px-4 rounded-l-xl">সর্বমোট ব্যালেন্স (Total):</td>
                        <td className="py-3 px-4 text-right font-mono">৳ {data.trialBalance.totalDebit.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right rounded-r-xl font-mono">৳ {data.trialBalance.totalCredit.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
