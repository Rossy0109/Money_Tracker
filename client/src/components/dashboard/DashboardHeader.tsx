import { Button } from "@/components/ui/button";
import {
  Download,
  Plus,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

interface DashboardHeaderProps {
  userName?: string | null;
  projects?: Array<{ id: number; name: string }>;
  activeProjectId: number | null;
  selectProject: (projectId: number) => void;
  openNewTransaction: () => void;
  openVoucherSettings: () => void;
  onOpenProjectDialog: () => void;
  downloadExport: () => void;
  isExportFetching: boolean;
  onOpenMonthlyReport: () => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
}

export function DashboardHeader({
  userName,
  projects,
  activeProjectId,
  selectProject,
  openNewTransaction,
  openVoucherSettings,
  onOpenProjectDialog,
  downloadExport,
  isExportFetching,
  onOpenMonthlyReport,
  isAdmin,
  onOpenAdmin,
}: DashboardHeaderProps) {
  return (
    <section className="flex flex-col justify-between gap-5 rounded-3xl bg-[#edf5ee] p-4 sm:p-7 lg:flex-row lg:items-end">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-[#4f7b67]">
          Ahmed's Financial Accounting
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#163c32] sm:text-4xl">
          প্রোফাইল
        </h1>
        <p className="mt-2 max-w-xl text-sm text-[#5d776b]">
          {userName ?? "আপনার"} প্রোফাইল থেকে প্রকল্প ও ব্যক্তিগত হিসাব
          পরিচালনা করুন।
        </p>
      </div>
      <div className="grid w-full gap-2 rounded-2xl border border-[#d9e7da] bg-white/80 p-3 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-end">
        <label className="grid w-full gap-1 text-xs font-semibold text-[#4f6f61] sm:col-span-2 lg:w-auto">
          <span>প্রোফাইলের প্রজেক্ট</span>
          <select
            aria-label="প্রোফাইলের প্রজেক্ট নির্বাচন"
            className="finance-input h-11 w-full min-w-0 bg-white lg:min-w-44"
            value={activeProjectId ?? ""}
            onChange={event => selectProject(Number(event.target.value))}
          >
            {projects?.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={openNewTransaction}
          className="h-11 w-full rounded-xl bg-[#173f36] font-semibold hover:bg-[#0f3028] lg:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          লেনদেন যোগ করুন
        </Button>
        <Button
          onClick={openVoucherSettings}
          variant="outline"
          className="h-11 w-full rounded-xl border-[#b9d1be] bg-white text-[#173f36] lg:w-auto"
        >
          <ReceiptText className="mr-1.5 h-4 w-4" />
          ভাউচার সেটিংস
        </Button>
        <Button
          onClick={onOpenProjectDialog}
          variant="outline"
          className="h-11 w-full rounded-xl border-[#b9d1be] bg-white text-[#173f36] lg:w-auto"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          প্রজেক্ট যোগ করুন
        </Button>
        <Button
          onClick={downloadExport}
          disabled={isExportFetching}
          variant="outline"
          className="h-11 w-full rounded-xl border-[#b9d1be] bg-white text-[#173f36] lg:w-auto"
        >
          <Download className="mr-1.5 h-4 w-4" />
          নিজের ডেটা
        </Button>
        <Button
          onClick={onOpenMonthlyReport}
          variant="outline"
          className="h-11 w-full rounded-xl border-[#b9d1be] bg-white text-[#173f36] lg:w-auto"
        >
          <Download className="mr-1.5 h-4 w-4" />
          মাসিক রিপোর্ট PDF
        </Button>
        {isAdmin && (
          <Button
            onClick={onOpenAdmin}
            variant="outline"
            className="h-11 w-full rounded-xl border-[#d7c48d] bg-[#fffdf3] text-[#765a14] lg:w-auto"
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Admin
          </Button>
        )}
      </div>
    </section>
  );
}
