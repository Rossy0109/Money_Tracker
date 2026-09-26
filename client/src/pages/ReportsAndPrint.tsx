import { useMemo, useState } from "react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrintPreviewFrame } from "@/components/PrintPreviewFrame";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { buildStatementHtml } from "@/lib/print/statementHtml";
import { downloadStatementPdf } from "@/lib/print/statementPdf";
import { openPrintWindow } from "@/lib/print/printWindow";
import { STATEMENT_KINDS, type StatementKind } from "@/lib/print/types";
import { Save, Printer } from "lucide-react";

const PRESETS = [
  { value: "all", label: "সব সময়কাল" },
  { value: "today", label: "আজ" },
  { value: "yesterday", label: "গতকাল" },
  { value: "week", label: "এই সপ্তাহ" },
  { value: "month", label: "এই মাস" },
  { value: "year", label: "এই বছর" },
  { value: "custom", label: "কাস্টম রেঞ্জ" },
] as const;

type PresetValue = (typeof PRESETS)[number]["value"];

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const endOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

function resolveRange(
  preset: PresetValue,
  customFrom?: string,
  customTo?: string
) {
  if (preset === "all") return { from: undefined, to: undefined };
  if (preset === "custom") {
    const from = customFrom?.trim()
      ? startOfDay(new Date(`${customFrom}T00:00:00`))
      : undefined;
    const to = customTo?.trim()
      ? endOfDay(new Date(`${customTo}T00:00:00`))
      : undefined;
    return { from, to };
  }
  const now = new Date();
  let from: Date;
  let to = endOfDay(now);
  switch (preset) {
    case "today":
      from = startOfDay(now);
      break;
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      from = startOfDay(yesterday);
      to = endOfDay(yesterday);
      break;
    }
    case "week": {
      from = startOfDay(new Date(now));
      from.setDate(now.getDate() - 6);
      break;
    }
    case "month":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      break;
    case "year":
      from = startOfDay(new Date(now.getFullYear(), 0, 1));
      break;
    default:
      from = startOfDay(now);
  }
  return { from, to };
}

const dateTextBn = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("bn-BD");

export default function ReportsAndPrint() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const [projectId, setProjectId] = useState<number | null>(null);
  const effectiveProjectId = projectId ?? projects.data?.[0]?.id ?? null;

  const [kind, setKind] = useState<StatementKind>("daily");
  const [preset, setPreset] = useState<PresetValue>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"both" | "income" | "expense">(
    "both"
  );
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [isPdfBusy, setIsPdfBusy] = useState(false);

  const overview = trpc.finance.overview.useQuery(
    { projectId: effectiveProjectId ?? 0 },
    { enabled: isAuthenticated && effectiveProjectId != null }
  );
  const firmProfile = trpc.finance.firmProfile.useQuery(
    { projectId: effectiveProjectId ?? 0 },
    { enabled: isAuthenticated && effectiveProjectId != null }
  );

  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const effectiveType = useMemo(() => {
    if (kind === "income") return "income" as const;
    if (kind === "expense") return "expense" as const;
    if (typeFilter === "both") return undefined;
    return typeFilter;
  }, [kind, typeFilter]);

  const statementData = trpc.finance.statementData.useQuery(
    {
      projectId: effectiveProjectId ?? 0,
      type: effectiveType,
      categoryId: categoryId ?? undefined,
      accountId: accountId ?? undefined,
      from,
      to,
    },
    { enabled: isAuthenticated && effectiveProjectId != null }
  );

  const periodLabel = useMemo(() => {
    if (from && to)
      return `${from.toLocaleDateString("bn-BD")} → ${to.toLocaleDateString("bn-BD")}`;
    if (from) return `${from.toLocaleDateString("bn-BD")} থেকে`;
    if (to) return `আগে ${to.toLocaleDateString("bn-BD")}`;
    return "সব সময়কাল";
  }, [from, to]);

  const filteredBy = useMemo(() => {
    const parts: string[] = [];
    if (effectiveType)
      parts.push(
        effectiveType === "income" ? "শুধু আয়/আমানত" : "শুধু ব্যয়/খরচ"
      );
    const category = overview.data?.categories.find(
      item => item.id === categoryId
    );
    if (category) parts.push(`ক্যাটাগরি: ${category.name}`);
    const account = overview.data?.accounts.find(item => item.id === accountId);
    if (account) parts.push(`অ্যাকাউন্ট: ${account.name}`);
    return parts.length ? parts.join(" · ") : undefined;
  }, [effectiveType, categoryId, accountId, overview.data]);

  const kindLabel =
    STATEMENT_KINDS.find(item => item.value === kind)?.label ?? "";
  const statementTitle = useMemo(() => {
    if (kind === "daily") return "দৈনিক আয়-ব্যয় বিবরণী";
    if (kind === "range") return "তারিখ রেঞ্জ বিবরণী";
    if (kind === "project") return "প্রজেক্টভিত্তিক বিবরণী";
    if (kind === "firm") return "ফার্মভিত্তিক বিবরণী";
    return kindLabel;
  }, [kind, kindLabel]);

  const [firmDraft, setFirmDraft] = useState({
    name: "",
    tagline: "",
    phone: "",
    email: "",
    address: "",
  });
  const firmSourceKey = firmProfile.data
    ? `${firmProfile.data.name}|${firmProfile.data.tagline}|${firmProfile.data.phone}|${firmProfile.data.email}|${firmProfile.data.address}`
    : "";
  const [syncedFirmKey, setSyncedFirmKey] = useState("");
  if (firmProfile.data && firmSourceKey !== syncedFirmKey) {
    setSyncedFirmKey(firmSourceKey);
    setFirmDraft({
      name: firmProfile.data.name,
      tagline: firmProfile.data.tagline,
      phone: firmProfile.data.phone,
      email: firmProfile.data.email,
      address: firmProfile.data.address,
    });
  }

  const saveFirm = trpc.finance.saveFirmProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.statementData.invalidate(),
        utils.finance.firmProfile.invalidate(),
        utils.finance.voucherPrint.invalidate(),
      ]);
      toast.success("ফার্ম/প্রতিষ্ঠানের তথ্য সংরক্ষিত হয়েছে");
    },
    onError: error => toast.error(error.message || "সংরক্ষণ ব্যর্থ হয়েছে"),
  });

  const reportOptions = useMemo(
    () => ({
      kind,
      periodLabel,
      title: statementTitle,
      filteredBy,
      showRunningBalance: kind !== "category" && kind !== "yearly",
    }),
    [kind, periodLabel, statementTitle, filteredBy]
  );

  const previewHtml = useMemo(
    () =>
      statementData.data
        ? buildStatementHtml(statementData.data, reportOptions)
        : "",
    [statementData.data, reportOptions]
  );

  const handlePrint = () => {
    if (!statementData.data) return;
    const result = openPrintWindow({
      title: `${statementTitle} — ${statementData.data.project.name}`,
      bodyHtml: buildStatementHtml(statementData.data, reportOptions),
    });
    if (result.status === "blocked")
      toast.error("ব্রাউজার পপ-আপ ব্লক করেছে; অনুগ্রহ করে পপ-আপ অনুমতি দিন");
  };

  const handlePdf = async () => {
    if (!statementData.data) return;
    setIsPdfBusy(true);
    try {
      const doc = await downloadStatementPdf(statementData.data, kind, {
        title: statementTitle,
        periodLabel,
      });
      const slug = statementData.data.project.name
        .replace(/\s+/g, "-")
        .toLowerCase();
      doc.save(`statement-${kind}-${slug}.pdf`);
      toast.success("PDF ডাউনলোড প্রস্তুত");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF তৈরি ব্যর্থ হয়েছে"
      );
    } finally {
      setIsPdfBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">রিপোর্ট ও প্রিন্ট</p>
            <h1 className="section-title">প্রফেশনাল প্রিন্ট ও PDF সিস্টেম</h1>
            <p className="mt-1 text-sm text-[#5c7a6e]">
              লেনদেন ভাউচার ও অ্যাকাউন্টিং বিবরণী — ব্রাউজার প্রিন্ট / PDF
              আউটপুটে।
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            <section className="finance-card p-5 sm:p-6">
              <h2 className="section-title">বিবরণী ও ফিল্টার</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    প্রজেক্ট
                  </span>
                  {projects.data?.length ? (
                    <select
                      className="finance-input mt-1 h-10 w-full rounded-xl"
                      value={effectiveProjectId ?? ""}
                      onChange={event => {
                        const value = event.target.value
                          ? Number(event.target.value)
                          : null;
                        setProjectId(value);
                      }}
                    >
                      {projects.data.map(project => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-sm text-[#819188]">
                      আগে একটি প্রজেক্ট তৈরি করুন (ড্যাশবোর্ড)।
                    </p>
                  )}
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    বিবরণীর ধরন
                  </span>
                  <select
                    className="finance-input mt-1 h-10 w-full rounded-xl"
                    value={kind}
                    onChange={event =>
                      setKind(event.target.value as StatementKind)
                    }
                  >
                    {STATEMENT_KINDS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    সময়কাল
                  </span>
                  <select
                    className="finance-input mt-1 h-10 w-full rounded-xl"
                    value={preset}
                    onChange={event =>
                      setPreset(event.target.value as PresetValue)
                    }
                  >
                    {PRESETS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {preset === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-[#5c7a6e]">
                        শুরু
                      </span>
                      <Input
                        type="date"
                        className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                        value={customFrom}
                        onChange={event => setCustomFrom(event.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-[#5c7a6e]">
                        শেষ
                      </span>
                      <Input
                        type="date"
                        className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                        value={customTo}
                        onChange={event => setCustomTo(event.target.value)}
                      />
                    </label>
                    <p className="col-span-2 text-xs text-[#819188]">
                      {customFrom && customTo && customFrom > customTo
                        ? "শুরুর তারিখ শেষের তারিখের পরে হতে পারে না"
                        : customFrom
                          ? `তৈরি তারিখ: ${dateTextBn(customFrom)}`
                          : "দুটি তারিখ নির্বাচন করুন"}
                    </p>
                  </div>
                )}

                {kind !== "income" && kind !== "expense" && (
                  <label className="block">
                    <span className="text-xs font-semibold text-[#5c7a6e]">
                      লেনদেনের ধরন
                    </span>
                    <select
                      className="finance-input mt-1 h-10 w-full rounded-xl"
                      value={typeFilter}
                      onChange={event =>
                        setTypeFilter(event.target.value as typeof typeFilter)
                      }
                    >
                      <option value="both">আয় ও ব্যয়</option>
                      <option value="income">শুধু আয়/আমানত</option>
                      <option value="expense">শুধু ব্যয়/খরচ</option>
                    </select>
                  </label>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ক্যাটাগরি / খাত
                  </span>
                  <select
                    className="finance-input mt-1 h-10 w-full rounded-xl"
                    value={categoryId ?? ""}
                    onChange={event =>
                      setCategoryId(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">সব খাত</option>
                    {(overview.data?.categories ?? []).map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name} (
                        {category.type === "income" ? "আয়" : "ব্যয়"})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    অ্যাকাউন্ট
                  </span>
                  <select
                    className="finance-input mt-1 h-10 w-full rounded-xl"
                    value={accountId ?? ""}
                    onChange={event =>
                      setAccountId(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">সব অ্যাকাউন্ট</option>
                    {(overview.data?.accounts ?? []).map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.type})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl bg-[#eef5f0] p-3 text-xs text-[#33584a]">
                  <p className="font-semibold">{statementTitle}</p>
                  <p className="mt-1 text-[#5c7a6e]">সময়কাল: {periodLabel}</p>
                  {filteredBy && (
                    <p className="text-[#5c7a6e]">ফিল্টার: {filteredBy}</p>
                  )}
                  {statementData.isFetching && (
                    <p className="mt-1">লোড হচ্ছে...</p>
                  )}
                  {statementData.data && (
                    <p>
                      {statementData.data.totals.count}টি লেনদেন · আয়{" "}
                      {statementData.data.totals.income.toLocaleString("bn-BD")}{" "}
                      · ব্যয়{" "}
                      {statementData.data.totals.expense.toLocaleString(
                        "bn-BD"
                      )}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="finance-card p-5 sm:p-6">
              <h2 className="section-title">ফার্ম/প্রতিষ্ঠানের হেডার</h2>
              <p className="mt-1 text-xs text-[#5c7a6e]">
                এই তথ্য ভাউচার ও সব বিবরণীর উপরে মুদ্রিত হয়।
              </p>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ফার্মের নাম
                  </span>
                  <Input
                    className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                    value={firmDraft.name}
                    onChange={event =>
                      setFirmDraft({ ...firmDraft, name: event.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ট্যাগলাইন
                  </span>
                  <Input
                    className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                    value={firmDraft.tagline}
                    onChange={event =>
                      setFirmDraft({
                        ...firmDraft,
                        tagline: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ফোন
                  </span>
                  <Input
                    className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                    value={firmDraft.phone}
                    onChange={event =>
                      setFirmDraft({ ...firmDraft, phone: event.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ইমেইল
                  </span>
                  <Input
                    className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                    value={firmDraft.email}
                    onChange={event =>
                      setFirmDraft({ ...firmDraft, email: event.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#5c7a6e]">
                    ঠিকানা
                  </span>
                  <Input
                    className="mt-1 h-10 rounded-xl border-[#dce7e0]"
                    value={firmDraft.address}
                    onChange={event =>
                      setFirmDraft({
                        ...firmDraft,
                        address: event.target.value,
                      })
                    }
                  />
                </label>
                <Button
                  onClick={() =>
                    effectiveProjectId &&
                    saveFirm.mutate({
                      projectId: effectiveProjectId,
                      ...firmDraft,
                    })
                  }
                  disabled={!effectiveProjectId || saveFirm.isPending}
                  className="h-10 w-full rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  হেডার সংরক্ষণ করুন
                </Button>
              </div>
            </section>
          </div>

          <div className="min-w-0">
            <section className="finance-card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="section-kicker">প্রিভিউ</p>
                  <h2 className="section-title">
                    {kind === "daily"
                      ? "দৈনিক আয় এবং ব্যয় বিবরণী"
                      : statementTitle}
                  </h2>
                </div>
                <Button
                  onClick={handlePrint}
                  disabled={!previewHtml}
                  variant="outline"
                  className="h-10 rounded-xl border-[#dce7e0] text-[#173f36]"
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  প্রিন্ট উইন্ডো
                </Button>
              </div>

              {previewHtml ? (
                <PrintPreviewFrame
                  html={previewHtml}
                  title={statementTitle}
                  busy={isPdfBusy}
                  onPrint={handlePrint}
                  onPdf={handlePdf}
                />
              ) : (
                <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#dce7e0] bg-[#fbfcf9] text-center">
                  <div className="p-6">
                    <Printer className="mx-auto h-8 w-8 text-[#b6c7bd]" />
                    <p className="mt-3 text-sm text-[#5c7a6e]">
                      {effectiveProjectId == null
                        ? "প্রথমে একটি প্রজেক্ট নির্বাচন করুন।"
                        : statementData.isFetching
                          ? "বিবরণী তৈরি হচ্ছে..."
                          : "ফিল্টার প্রয়োগ করে বিবরণীর প্রিভিউ এখানে দেখুন।"}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
