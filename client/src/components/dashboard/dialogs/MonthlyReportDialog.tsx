import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/dashboard/DashboardMetrics";
import { Download, Loader2, Share2 } from "lucide-react";
import {
  accountingReportOptions,
  type AccountingReportType,
} from "@/lib/accountingReportDefinitions";

interface MonthlyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportMonthKey: string;
  setReportMonthKey: (key: string) => void;
  reportType: AccountingReportType;
  setReportType: (type: AccountingReportType) => void;
  onDownload: () => void;
  onShare: () => void;
  isDownloading: boolean;
  isSharing: boolean;
  activeProjectId: number | null;
}

export function MonthlyReportDialog({
  open,
  onOpenChange,
  reportMonthKey,
  setReportMonthKey,
  reportType,
  setReportType,
  onDownload,
  onShare,
  isDownloading,
  isSharing,
  activeProjectId,
}: MonthlyReportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>মাসিক আর্থিক রিপোর্ট</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-[#5d776b]">
            আলাদা লাভ-ক্ষতি, আয়, ব্যয়, দেনা, পাওনা ও আর্থিক অবস্থানের
            রিপোর্ট PDF হিসেবে ডাউনলোড বা ডিভাইসের শেয়ার স্ক্রিন থেকে
            ইমেইল বা WhatsApp-এ পাঠানো যাবে।
          </p>
          <Field label="রিপোর্টের মাস">
            <Input
              type="month"
              value={reportMonthKey}
              onChange={event => setReportMonthKey(event.target.value)}
              className="finance-input"
            />
          </Field>
          <Field label="রিপোর্টের ধরন">
            <select
              value={reportType}
              onChange={event =>
                setReportType(event.target.value as AccountingReportType)
              }
              className="finance-input h-10 w-full"
            >
              {accountingReportOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={onDownload}
              disabled={isDownloading || isSharing || !activeProjectId}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              {isDownloading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              {isDownloading ? "PDF তৈরি হচ্ছে..." : "PDF ডাউনলোড"}
            </Button>
            <Button
              onClick={onShare}
              disabled={isDownloading || isSharing || !activeProjectId}
              variant="outline"
              className="rounded-xl border-[#b9d1be] bg-white text-[#173f36]"
            >
              {isSharing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-1.5 h-4 w-4" />
              )}
              {isSharing ? "শেয়ার প্রস্তুত হচ্ছে..." : "ইমেইল / WhatsApp-এ শেয়ার"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
