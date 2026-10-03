import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasPermission } from "@/lib/rbac";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import type { HealthReport, ProbeStatus } from "../../../server/healthChecks";

/**
 * The server always returns `overallStatus` on the report — `"ok"` when every
 * guarded summary key passes, `"degraded"` when one fails — while the shared
 * interface only declares the summary's never-populated copy. The panel reads
 * it through this widened view instead of re-deriving a verdict from the
 * summary keys, so the server stays the single source of truth for "degraded".
 */
type SystemHealthReport = Omit<HealthReport, "overallStatus"> & {
  overallStatus?: ProbeStatus | "degraded";
};

type StatusTone = {
  label: string;
  className: string;
  Icon: LucideIcon;
};

const STATUS_TONES: Record<string, StatusTone> = {
  ok: {
    label: "ঠিক আছে",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  degraded: {
    label: "সমস্যা আছে",
    className: "border-red-300 bg-red-50 text-red-700",
    Icon: AlertTriangle,
  },
  fail: {
    label: "ব্যর্থ",
    className: "border-red-300 bg-red-50 text-red-700",
    Icon: AlertTriangle,
  },
  stale: {
    label: "পুরোনো",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    Icon: CircleDashed,
  },
  none: {
    label: "নেই",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    Icon: CircleDashed,
  },
  unknown: {
    label: "অজানা",
    className: "border-gray-300 bg-gray-50 text-gray-600",
    Icon: CircleDashed,
  },
  not_configured: {
    label: "কনফিগার করা নেই",
    className: "border-gray-300 bg-gray-50 text-gray-600",
    Icon: CircleDashed,
  },
};

const FALLBACK_TONE: StatusTone = {
  label: "—",
  className: "border-gray-300 bg-gray-50 text-gray-600",
  Icon: CircleDashed,
};

/**
 * Bengali names for the summary keys the server reports. Keys the server does
 * not know yet (or drops) fall back to the raw key, so the panel renders any
 * check the health report grows without a client change.
 */
const SUMMARY_LABELS: Record<string, string> = {
  database: "ডেটাবেস",
  auth: "লগইন",
  storage: "স্টোরেজ",
  vercel: "ডিপ্লয়মেন্ট",
  googleDrive: "গুগল ড্রাইভ",
  lastBackup: "সর্বশেষ ব্যাকআপ",
  lastSync: "সিঙ্ক",
  integrity: "ডেটা ইন্টিগ্রিটি",
  accountingInvariants: "হিসাবের ভারসাম্য",
  restoreDrill: "রিস্টোর ড্রিল",
};

const toneFor = (value: string): StatusTone =>
  STATUS_TONES[value] ?? { ...FALLBACK_TONE, label: value };

const formatTimestamp = (value: string) => {
  try {
    return new Intl.DateTimeFormat("bn-BD", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

function StatusBadge({ value }: { value: string }) {
  const tone = toneFor(value);
  const { Icon } = tone;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-2.5 py-1 text-xs ${tone.className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {tone.label}
    </Badge>
  );
}

export default function SystemHealth() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // The panel mirrors the server contract: reading the report needs
  // settings.view — exactly what the sidebar entry is filtered on.
  const canViewHealth = hasPermission(user, "settings.view");
  const report = trpc.system.healthReport.useQuery(undefined, {
    enabled: canViewHealth,
    retry: false,
  });

  if (user && !canViewHealth) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl px-4 py-12 text-center">
          <div className="space-y-4 rounded-3xl border border-amber-200 bg-card p-8 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-inner">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              সিস্টেম হেলথ দেখার অনুমতি নেই
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              সিস্টেম স্ট্যাটাস পাতাটি দেখতে আপনার অ্যাকাউন্টে settings অনুমতি
              থাকতে হবে। প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।
            </p>
            <Button
              onClick={() => setLocation("/")}
              className="rounded-xl bg-primary px-6 text-primary-foreground hover:bg-primary/90"
            >
              ড্যাশবোর্ডে ফিরে যান
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const data: SystemHealthReport | undefined = report.data;
  const overall = data?.overallStatus ?? "unknown";
  const summaryEntries = data
    ? Object.entries(data.summary).filter(([key]) => key !== "overallStatus")
    : [];

  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-7">
        <header className="flex flex-col gap-4 rounded-[1.75rem] bg-sidebar p-5 text-white shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-positive">
              সিস্টেম স্ট্যাটাস
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              সিস্টেম হেলথ
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">
              ডেটাবেস, লগইন, স্টোরেজ, ব্যাকআপ, ডেটা ইন্টিগ্রিটি ও হিসাবের
              ভারসাম্য — সব এক জায়গায় যাচাই।
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button
              type="button"
              onClick={() => report.refetch()}
              disabled={report.isFetching}
              aria-label="হেলথ রিপোর্ট রিফ্রেশ করুন"
              className="gap-2 rounded-xl bg-border font-semibold text-foreground hover:bg-border disabled:opacity-70"
            >
              {report.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              আবার যাচাই করুন
            </Button>
            {data && (
              <p className="text-[11px] text-positive">
                যাচাই: {formatTimestamp(data.checkedAt)} · ভার্সন{" "}
                {data.appVersion} · স্কিমা {data.schemaVersion}
              </p>
            )}
          </div>
        </header>

        {report.isLoading && (
          <Card className="border-border bg-background shadow-sm">
            <CardContent className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="text-sm font-semibold">
                হেলথ রিপোর্ট তৈরি হচ্ছে...
              </p>
            </CardContent>
          </Card>
        )}

        {!report.isLoading && report.error && (
          <Card className="border-red-200 bg-red-50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                রিপোর্ট আনা যায়নি
              </CardTitle>
              <CardDescription className="text-red-700">
                {report.error.message ||
                  "সার্ভার থেকে স্ট্যাটাস পাওয়া যায়নি।"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                onClick={() => report.refetch()}
                className="rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              >
                আবার চেষ্টা করুন
              </Button>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <Card
              className={`border shadow-sm ${
                overall === "ok"
                  ? "border-border bg-background"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      overall === "ok"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {overall === "ok" ? (
                      <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p
                      className={`text-base font-bold ${
                        overall === "ok" ? "text-positive" : "text-red-900"
                      }`}
                    >
                      {overall === "ok"
                        ? "সব ঠিক আছে"
                        : overall === "degraded"
                          ? "কিছু সমস্যা পাওয়া গেছে"
                          : "স্ট্যাটাস অজানা"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {overall === "ok"
                        ? "সকল প্রধান পরীক্ষা সফল হয়েছে।"
                        : "নিচের ব্যর্থ পরীক্ষাগুলো দেখুন এবং প্রয়োজনে রিট্রাই করুন।"}
                    </p>
                  </div>
                </div>
                <StatusBadge value={overall} />
              </CardContent>
            </Card>

            <section aria-labelledby="health-summary" className="space-y-3">
              <div>
                <p className="section-kicker">সারসংক্ষেপ</p>
                <h2 id="health-summary" className="section-title">
                  মূল অবস্থা
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-border bg-card p-4 shadow-xs"
                  >
                    <p className="text-xs font-semibold text-muted-foreground">
                      {SUMMARY_LABELS[key] ?? key}
                    </p>
                    <div className="mt-2">
                      <StatusBadge value={String(value)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="health-checks" className="space-y-3">
              <div>
                <p className="section-kicker">পরীক্ষাসমূহ</p>
                <h2 id="health-checks" className="section-title">
                  বিস্তারিত চেক
                </h2>
              </div>
              <ul className="space-y-3">
                {data.checks.map(check => (
                  <li
                    key={check.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold text-foreground">
                        {check.label}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {check.id}
                      </p>
                      {check.error && (
                        <p className="text-sm font-medium text-red-700">
                          {check.error}
                        </p>
                      )}
                      {check.details && !check.error && (
                        <p className="text-sm text-muted-foreground">
                          {check.details}
                        </p>
                      )}
                      {check.retryAction && (
                        <p className="flex items-start gap-1.5 text-xs text-positive">
                          <Wrench
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          {check.retryAction}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {check.latencyMs != null && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {Math.round(check.latencyMs)} ms
                        </span>
                      )}
                      <StatusBadge value={check.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="health-integrity" className="space-y-3">
              <div>
                <p className="section-kicker">প্রজেক্ট ইন্টিগ্রিটি</p>
                <h2 id="health-integrity" className="section-title">
                  ব্যাকআপের সাথে মিল
                </h2>
              </div>
              {data.integrity.length > 0 ? (
                <div className="responsive-table-container">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-background text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">হিসাবখাতা</th>
                        <th className="px-4 py-3">অবস্থা</th>
                        <th className="px-4 py-3">অমিল</th>
                        <th className="px-4 py-3">যাচাইয়ের সময়</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.integrity.map(row => (
                        <tr
                          key={row.projectId}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {row.projectName}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              value={row.status === "VERIFIED" ? "ok" : "fail"}
                            />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.diffs}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTimestamp(row.checkedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  <Database className="h-4 w-4" aria-hidden="true" />
                  এই অ্যাকাউন্টের কোনো প্রজেক্টের ইন্টিগ্রিটি ফলাফল নেই।
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
