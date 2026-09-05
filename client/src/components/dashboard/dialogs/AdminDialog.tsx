import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Field, Empty } from "@/components/dashboard/DashboardMetrics";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  LockKeyhole,
  Upload,
  UserCheck,
  UserX,
} from "lucide-react";
import { dateText, auditActionText } from "../types";
import type { DateRange } from "react-day-picker";

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminVerified: boolean;
  adminPassword: string;
  setAdminPassword: (password: string) => void;
  onVerify: (event: FormEvent) => void;
  isVerifying: boolean;
  // Audit Filters
  auditSearch: string;
  setAuditSearch: (search: string) => void;
  auditDateRange: DateRange | undefined;
  setAuditDateRange: (range: DateRange | undefined) => void;
  auditActorRole: "all" | "admin" | "user";
  setAuditActorRole: (role: "all" | "admin" | "user") => void;
  auditActorUserId: string;
  setAuditActorUserId: (id: string) => void;
  onClearFilters: () => void;
  // Audit data
  adminLogs: {
    isLoading: boolean;
    isError: boolean;
    data?: {
      logs: Array<{
        id: number;
        summary: string;
        createdAt: Date | string;
        actorName?: string | null;
        actorUserId: number;
        projectName?: string | null;
        action: string;
      }>;
      total: number;
      page: number;
      totalPages: number;
    };
  };
  auditActivity: {
    isLoading: boolean;
    data?: Array<{ action: string; count: number | string }>;
  };
  adminUsers: {
    isLoading: boolean;
    data?: Array<{
      id: number;
      name?: string | null;
      email?: string | null;
      role: string;
      status?: string | null;
    }>;
  };
  adminProjects: {
    isLoading: boolean;
    data?: Array<{
      id: number;
      name: string;
      ownerName?: string | null;
      ownerEmail?: string | null;
      userId: number;
    }>;
  };
  auditPage: number;
  setAuditPage: React.Dispatch<React.SetStateAction<number>>;
  onDownloadAuditLogs: (format: "csv" | "pdf") => void;
  isAuditExporting: boolean;
  onUpdateUserStatus: (targetUserId: number, status: "active" | "suspended") => void;
  isUpdatingUserStatus: boolean;
  // Logo
  logoUrl: string | null;
  onUploadLogo: (file: File) => Promise<void>;
  onResetLogo: () => void;
  isCustomLogo: boolean;
}

export function AdminDialog({
  open,
  onOpenChange,
  adminVerified,
  adminPassword,
  setAdminPassword,
  onVerify,
  isVerifying,
  auditSearch,
  setAuditSearch,
  auditDateRange,
  setAuditDateRange,
  auditActorRole,
  setAuditActorRole,
  auditActorUserId,
  setAuditActorUserId,
  onClearFilters,
  adminLogs,
  auditActivity,
  adminUsers,
  adminProjects,
  auditPage,
  setAuditPage,
  onDownloadAuditLogs,
  isAuditExporting,
  onUpdateUserStatus,
  isUpdatingUserStatus,
  logoUrl,
  onUploadLogo,
  onResetLogo,
  isCustomLogo,
}: AdminDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[#76601d]" />
            অ্যাডমিন নিয়ন্ত্রণ
          </DialogTitle>
        </DialogHeader>
        {!adminVerified ? (
          <form onSubmit={onVerify} className="grid gap-4">
            <p className="text-sm text-[#667f75]">
              Google/OAuth identity ও server-only password—দুই ধাপে Admin
              নিয়ন্ত্রণ সুরক্ষিত।
            </p>
            <Field label="অ্যাডমিন পাসওয়ার্ড">
              <Input
                required
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={event => setAdminPassword(event.target.value)}
              />
            </Field>
            <Button
              disabled={isVerifying}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              যাচাই করুন
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">
              <Check className="mr-1 inline h-4 w-4" />
              Admin access সক্রিয়। Audit log কেবল এই সেশনের browser memory-তে
              থাকা password দিয়ে দেখা যাচ্ছে।
            </div>
            <section>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="font-semibold text-[#173f36]">
                  সাম্প্রতিক Audit log
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                  className="w-fit rounded-lg"
                >
                  ফিল্টার পরিষ্কার করুন
                </Button>
              </div>
              <div className="mt-3 grid gap-3 rounded-xl bg-[#f6faf7] p-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="কাজ বা কিওয়ার্ড খুঁজুন">
                  <Input
                    value={auditSearch}
                    onChange={event => setAuditSearch(event.target.value)}
                    placeholder="যেমন: transaction, delete"
                    aria-label="Audit log search"
                  />
                </Field>
                <Field label="তারিখের পরিসর">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start bg-white text-left font-normal"
                      >
                        {auditDateRange?.from
                          ? auditDateRange.to
                            ? dateText(auditDateRange.from) +
                              " – " +
                              dateText(auditDateRange.to)
                            : dateText(auditDateRange.from)
                          : "তারিখের পরিসর বাছুন"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={auditDateRange}
                        onSelect={setAuditDateRange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
                <Field label="ব্যবহারকারী বা ভূমিকা">
                  <select
                    className="finance-input"
                    value={auditActorRole}
                    onChange={event =>
                      setAuditActorRole(
                        event.target.value as "all" | "admin" | "user"
                      )
                    }
                  >
                    <option value="all">সব ভূমিকা</option>
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>
                </Field>
                {adminUsers.data?.length ? (
                  <Field label="নির্দিষ্ট ব্যবহারকারী">
                    <select
                      className="finance-input"
                      value={auditActorUserId}
                      onChange={event =>
                        setAuditActorUserId(event.target.value)
                      }
                    >
                      <option value="all">সব ব্যবহারকারী</option>
                      {adminUsers.data.map(adminUser => (
                        <option key={adminUser.id} value={adminUser.id}>
                          {adminUser.name ?? "User #" + adminUser.id} ·{" "}
                          {adminUser.role}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <div className="hidden lg:block" />
                )}
              </div>
              <div className="mt-3 rounded-xl border border-[#e1ebe3] bg-[#fbfdfb] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-[#597567]">
                      নির্বাচিত সময়ের কার্যক্রম
                    </p>
                    <h4 className="text-sm font-semibold text-[#173f36]">
                      কোন কাজ বেশি হয়েছে
                    </h4>
                  </div>
                  <span className="rounded-full bg-[#edf6ed] px-2 py-1 text-xs text-[#477263]">
                    {auditActivity.data?.reduce(
                      (sum, item) => sum + Number(item.count),
                      0
                    ) ?? 0}
                    টি কাজ
                  </span>
                </div>
                <div className="mt-2 h-40">
                  {auditActivity.isLoading ? (
                    <p className="pt-12 text-center text-sm text-[#70867c]">
                      সারাংশ লোড হচ্ছে…
                    </p>
                  ) : auditActivity.data?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={auditActivity.data}>
                        <CartesianGrid vertical={false} stroke="#e3ebe5" />
                        <XAxis
                          dataKey="action"
                          tickFormatter={auditActionText}
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          width={28}
                        />
                        <Tooltip
                          labelFormatter={label =>
                            auditActionText(
                              typeof label === "string" ? label : ""
                            )
                          }
                          formatter={value => [
                            String(
                              Array.isArray(value)
                                ? (value[0] ?? 0)
                                : (value ?? 0)
                            ) + "টি কাজ",
                            "সংখ্যা",
                          ]}
                        />
                        <Bar
                          dataKey="count"
                          name="কাজ"
                          fill="#1c7c54"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="pt-12 text-center text-sm text-[#70867c]">
                      এই ফিল্টারে কোনো কার্যক্রম নেই
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 max-h-64 divide-y divide-[#e5eee7] overflow-auto rounded-xl border border-[#e1ebe3]">
                {adminLogs.isLoading ? (
                  <p className="p-4 text-sm">লোড হচ্ছে…</p>
                ) : adminLogs.isError ? (
                  <p className="p-4 text-sm text-[#a24d4d]">
                    Audit log লোড করা যায়নি। আবার চেষ্টা করুন।
                  </p>
                ) : adminLogs.data?.logs.length ? (
                  adminLogs.data.logs.map(log => (
                    <div key={log.id} className="p-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold text-[#25483e]">
                          {log.summary}
                        </span>
                        <span className="text-[#778a80]">
                          {dateText(log.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#73857c]">
                        {log.actorName ?? `User #${log.actorUserId}`} ·{" "}
                        {log.projectName ?? "সিস্টেম"} · {log.action}
                      </p>
                    </div>
                  ))
                ) : (
                  <Empty text="এই ফিল্টারে কোনো audit record নেই" />
                )}
              </div>
              <div className="mt-3 flex flex-col gap-3 rounded-xl bg-[#f6faf7] p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[#60796e]">
                  {adminLogs.data
                    ? `মোট ${adminLogs.data.total}টি record · পৃষ্ঠা ${adminLogs.data.page}/${adminLogs.data.totalPages}`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isAuditExporting}
                    onClick={() => onDownloadAuditLogs("csv")}
                  >
                    CSV ডাউনলোড
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isAuditExporting}
                    onClick={() => onDownloadAuditLogs("pdf")}
                  >
                    PDF ডাউনলোড
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!adminLogs.data || adminLogs.data.page <= 1}
                    onClick={() =>
                      setAuditPage(page => Math.max(1, page - 1))
                    }
                  >
                    আগের পৃষ্ঠা
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !adminLogs.data ||
                      adminLogs.data.page >= adminLogs.data.totalPages
                    }
                    onClick={() => setAuditPage(page => page + 1)}
                  >
                    পরের পৃষ্ঠা
                  </Button>
                </div>
              </div>
            </section>
            <section>
              <h3 className="font-semibold text-[#173f36]">সব প্রজেক্ট</h3>
              <div className="mt-3 max-h-40 divide-y divide-[#e5eee7] overflow-auto rounded-xl border border-[#e1ebe3]">
                {adminProjects.isLoading ? (
                  <p className="p-4 text-sm">লোড হচ্ছে…</p>
                ) : adminProjects.data?.length ? (
                  adminProjects.data.map(project => (
                    <div
                      key={project.id}
                      className="flex justify-between gap-3 p-3 text-sm"
                    >
                      <span className="font-medium text-[#25483e]">
                        {project.name}
                      </span>
                      <span className="text-xs text-[#73857c]">
                        {project.ownerName ??
                          project.ownerEmail ??
                          `User #${project.userId}`}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty text="কোনো প্রজেক্ট নেই" />
                )}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#173f36]">
                  ব্যবহারকারী অনুমোদন ও পরিচালনা
                </h3>
                <span className="text-xs text-[#527768]">
                  মোট: {adminUsers.data?.length ?? 0} জন
                </span>
              </div>
              <div className="mt-3 max-h-56 divide-y divide-[#e5eee7] overflow-auto rounded-xl border border-[#e1ebe3]">
                {adminUsers.data?.length ? (
                  adminUsers.data.map(member => (
                    <div
                      key={member.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 text-sm hover:bg-[#fafdfb]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#25483e] truncate">
                            {member.name || `User #${member.id}`}
                          </span>
                          <span className="rounded-full bg-[#eff5ef] px-2 py-0.5 text-[11px] text-[#477263]">
                            {member.role}
                          </span>
                          {member.status === "pending" && (
                            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
                              অপেক্ষমাণ (Pending)
                            </span>
                          )}
                          {member.status === "active" && (
                            <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold">
                              সক্রিয় (Active)
                            </span>
                          )}
                          {member.status === "suspended" && (
                            <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[11px] font-semibold">
                              স্থগিত (Suspended)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#73857c] truncate mt-0.5">
                          {member.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 pt-1 sm:pt-0">
                        {member.status !== "active" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={isUpdatingUserStatus}
                            onClick={() => onUpdateUserStatus(member.id, "active")}
                            className="h-8 rounded-lg bg-[#173f36] hover:bg-[#12312a] text-white text-xs px-2.5 flex items-center gap-1"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>অনুমোদন দিন</span>
                          </Button>
                        )}
                        {member.status === "active" && member.role !== "admin" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUpdatingUserStatus}
                            onClick={() => onUpdateUserStatus(member.id, "suspended")}
                            className="h-8 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 text-xs px-2.5 flex items-center gap-1"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            <span>স্থগিত করুন</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty text="কোনো নিবন্ধিত ব্যবহারকারী নেই" />
                )}
              </div>
            </section>

            {/* Logo Management Section */}
            <section className="pt-2 border-t border-[#e1ebe3]">
              <h3 className="font-semibold text-[#173f36] mb-2">
                লোগো আপলোড ও পরিবর্তন
              </h3>
              <div className="flex items-center gap-4 p-3 rounded-xl border border-[#e1ebe3] bg-[#fbfdfb]">
                <div className="h-14 w-14 rounded-xl border border-[#c9dcd0] bg-white p-1 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                  <img
                    src={logoUrl || "/logo.png"}
                    alt="App Logo"
                    className="h-full w-full object-contain"
                    onError={e => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-xs text-[#527768]">
                    আপনার পছন্দের নতুন লোগো (PNG, SVG, JPG, সর্বোচ্চ 2MB) আপলোড করতে পারেন।
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[#173f36] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#12312a] transition">
                      <Upload className="h-3.5 w-3.5" />
                      <span>নতুন লোগো আপলোড</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await onUploadLogo(file);
                          }
                        }}
                      />
                    </label>
                    {isCustomLogo && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onResetLogo}
                        className="h-8 rounded-lg text-xs"
                      >
                        ডিফল্ট লোগো ফিরিয়ে আনুন
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
