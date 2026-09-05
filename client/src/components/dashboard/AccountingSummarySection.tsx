import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { AccountingMetric } from "@/components/dashboard/DashboardMetrics";
import { bdt, monthText } from "./types";

interface AccountingSummaryData {
  monthKey: string;
  profitAndLoss: {
    income: number;
    expense: number;
    profitOrLoss: number;
  };
  financialPosition: {
    accountBalance: number;
    receivables: number;
    debts: number;
    assets: number;
    netFinancialPosition: number;
  };
}

interface AccountingSummarySectionProps {
  summary: AccountingSummaryData;
  profitAndLoss?: AccountingSummaryData["profitAndLoss"];
  financialPosition?: AccountingSummaryData["financialPosition"];
  onOpenReport: () => void;
}

export function AccountingSummarySection({
  summary,
  profitAndLoss = summary.profitAndLoss,
  financialPosition = summary.financialPosition,
  onOpenReport,
}: AccountingSummarySectionProps) {
  return (
    <section className="finance-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">ফিনান্সিয়াল অ্যাকাউন্টিং</p>
          <h2 className="section-title">
            {monthText(summary.monthKey)} মাসের লাভ-ক্ষতি ও আর্থিক অবস্থান
          </h2>
          <p className="mt-1 text-sm text-[#668076]">
            লাভ-ক্ষতি শুধু নির্বাচিত মাসের আয় ও ব্যয়ের হিসাব। আর্থিক অবস্থানে
            অ্যাকাউন্ট ব্যালেন্স, পাওনা ও দেনা অন্তর্ভুক্ত আছে।
          </p>
        </div>
        <Button
          onClick={onOpenReport}
          variant="outline"
          className="w-full rounded-xl border-[#b9d1be] bg-white text-[#173f36] sm:w-auto"
        >
          <Download className="mr-1.5 h-4 w-4" />
          আলাদা রিপোর্ট
        </Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AccountingMetric
          label="মোট আয়"
          value={bdt(profitAndLoss.income)}
          tone="green"
        />
        <AccountingMetric
          label="মোট ব্যয়"
          value={bdt(profitAndLoss.expense)}
          tone="rose"
        />
        <AccountingMetric
          label={
            profitAndLoss.profitOrLoss >= 0
              ? "নিট লাভ"
              : "নিট ক্ষতি"
          }
          value={bdt(Math.abs(profitAndLoss.profitOrLoss))}
          tone={
            profitAndLoss.profitOrLoss >= 0
              ? "mint"
              : "rose"
          }
        />
        <AccountingMetric
          label="অ্যাকাউন্ট ব্যালেন্স"
          value={bdt(financialPosition.accountBalance)}
          tone="sand"
        />
        <AccountingMetric
          label="মোট পাওনা"
          value={bdt(financialPosition.receivables)}
          tone="mint"
        />
        <AccountingMetric
          label="নিট আর্থিক অবস্থান"
          value={bdt(financialPosition.netFinancialPosition)}
          tone={
            financialPosition.netFinancialPosition >= 0
              ? "green"
              : "rose"
          }
        />
      </div>
      <p className="mt-4 text-sm text-[#668076]">
        মোট সম্পদ: {bdt(financialPosition.assets)}
        <span aria-hidden="true"> · </span>
        মোট দেনা: {bdt(financialPosition.debts)}
      </p>
    </section>
  );
}
