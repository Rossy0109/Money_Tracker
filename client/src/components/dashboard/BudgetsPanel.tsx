import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { BellRing, CircleAlert, Plus } from "lucide-react";
import { Empty } from "@/components/dashboard/DashboardMetrics";
import { bdt } from "./types";

interface BudgetAlert {
  categoryId: number;
  categoryName: string;
  spent: number;
  exceededAmount: number;
}

interface BudgetEarlyWarning {
  categoryId: number;
  categoryName: string;
  spent: number;
  remainingAmount: number;
  threshold: number;
}

interface BudgetItem {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number | string;
  spent: number | string;
}

interface BudgetsPanelProps {
  budgets: BudgetItem[];
  budgetAlerts: BudgetAlert[];
  budgetEarlyWarnings: BudgetEarlyWarning[];
  onOpenAddBudget: () => void;
}

export function BudgetsPanel({
  budgets,
  budgetAlerts,
  budgetEarlyWarnings,
  onOpenAddBudget,
}: BudgetsPanelProps) {
  return (
    <article id="budgets" className="scroll-mt-20 finance-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">মাসিক বাজেট</p>
          <h2 className="section-title">খরচের সীমা</h2>
        </div>
        <Button
          size="icon"
          onClick={onOpenAddBudget}
          variant="outline"
          aria-label="বাজেট যোগ বা সংশোধন করুন"
          className="h-11 w-11 rounded-xl"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {budgetAlerts.length > 0 && (
        <Alert
          aria-label="বাজেট সীমা অতিক্রমের সতর্কতা"
          className="mt-4 rounded-2xl border border-[#f2c768] bg-[#fff6dc] p-3 text-[#7a4b00]"
        >
          <BellRing aria-hidden="true" />
          <AlertTitle>বাজেট সীমা অতিক্রম হয়েছে</AlertTitle>
          <AlertDescription className="text-[#7a4b00]">
            <ul className="mt-1 space-y-1 text-sm leading-5">
              {budgetAlerts.map(alert => (
                <li key={alert.categoryId}>
                  <span className="font-medium">{alert.categoryName}</span>: {bdt(alert.spent)} খরচ হয়েছে; সীমার চেয়ে {bdt(alert.exceededAmount)} বেশি।
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {budgetEarlyWarnings.length > 0 && (
        <Alert
          aria-label="বাজেটের ৮০ ও ৯০ শতাংশ খরচের আগাম সতর্কতা"
          className="mt-4 rounded-2xl border border-[#e9bb69] bg-[#fff8e7] p-3 text-[#80530d]"
        >
          <CircleAlert aria-hidden="true" />
          <AlertTitle>বাজেটের কাছাকাছি পৌঁছেছে</AlertTitle>
          <AlertDescription className="text-[#80530d]">
            <ul className="mt-1 space-y-1 text-sm leading-5">
              {budgetEarlyWarnings.map(warning => (
                <li key={warning.categoryId}>
                  <span className="font-medium">{warning.categoryName}</span>: বাজেটের {warning.threshold}% খরচ হয়েছে; বাকি আছে {bdt(warning.remainingAmount)}।
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-4 space-y-4">
        {budgets.length ? (
          budgets.map(budget => {
            const exceededAlert = budgetAlerts.find(
              alert => alert.categoryId === budget.categoryId
            );
            const earlyWarning = budgetEarlyWarnings.find(
              warning => warning.categoryId === budget.categoryId
            );
            const progress = Math.min(
              100,
              Number(budget.amount)
                ? (Number(budget.spent) / Number(budget.amount)) * 100
                : 0
            );
            return (
              <div key={budget.id}>
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className="font-medium text-[#294c42]">
                    {budget.categoryName}
                  </span>
                  <span className="text-[#71867c]">
                    {bdt(budget.spent)} / {bdt(budget.amount)}
                  </span>
                </div>
                {exceededAlert ? (
                  <p className="mt-1 text-xs font-medium text-[#b46d00]">
                    সতর্কতা: সীমার চেয়ে {bdt(exceededAlert.exceededAmount)} বেশি খরচ হয়েছে
                  </p>
                ) : earlyWarning ? (
                  <p className="mt-1 text-xs font-medium text-[#a36400]">
                    আগাম সতর্কতা: বাজেটের {earlyWarning.threshold}% খরচ হয়েছে
                  </p>
                ) : null}
                <Progress
                  value={progress}
                  className={`mt-2 h-2 ${
                    exceededAlert
                      ? "[&>div]:bg-[#d86f65]"
                      : earlyWarning?.threshold === 90
                        ? "[&>div]:bg-[#d89529]"
                        : earlyWarning?.threshold === 80
                          ? "[&>div]:bg-[#4a9fc5]"
                          : ""
                  }`}
                />
              </div>
            );
          })
        ) : (
          <Empty text="এই মাসে কোনো বাজেট নেই" />
        )}
      </div>
    </article>
  );
}
