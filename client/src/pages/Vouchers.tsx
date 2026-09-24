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
import { Input } from "@/components/ui/input";
import { useActiveProject } from "@/lib/activeProject";
import { hasPermission } from "@/lib/rbac";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

const bdt = (value: number | string) =>
  `৳ ${new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const dateLabel = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

type VoucherStatus = "draft" | "submitted" | "approved" | "posted" | "reversed";
const STATUSES: Array<{ key: VoucherStatus | "all"; label: string }> = [
  { key: "all", label: "সব" },
  { key: "draft", label: "খসড়া" },
  { key: "submitted", label: "জমা" },
  { key: "approved", label: "অনুমোদিত" },
  { key: "posted", label: "পোস্ট" },
  { key: "reversed", label: "বিপরীত" },
];

type EntryDraft = { accountId: string; amount: string; narration: string };
const blankEntry = (): EntryDraft => ({
  accountId: "",
  amount: "",
  narration: "",
});

const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function Vouchers() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } =
    trpc.projects.list.useQuery();
  const { activeProjectId, selectProject } = useActiveProject();
  const projectId = activeProjectId ?? 0;
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "all">(
    "all"
  );

  const overview = trpc.finance.overview.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const vouchers = trpc.finance.voucherList.useQuery(
    {
      projectId,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 200,
    },
    { enabled: projectId > 0 }
  );

  const canSubmit = hasPermission(user, "voucher.submit");
  const canApprove = hasPermission(user, "voucher.approve");
  const canPost = hasPermission(user, "voucher.post");
  const canCreate = hasPermission(user, "voucher.create");
  const canReverse = hasPermission(user, "voucher.reverse");

  const refresh = async () => {
    await utils.finance.voucherList.invalidate({ projectId });
    await utils.finance.overview.invalidate({ projectId });
  };

  const createVoucher = trpc.finance.createVoucher.useMutation({
    onSuccess: async () => {
      toast.success("ভাউচার খসড়া তৈরি হয়েছে");
      setShowCreate(false);
      resetForm();
      await refresh();
    },
    onError: error => toast.error(error.message || "ভাউচার তৈরি করা যায়নি"),
  });
  const submitVoucher = trpc.finance.submitVoucher.useMutation({
    onSuccess: async () => {
      toast.success("ভাউচার অনুমোদনের জন্য জমা হয়েছে");
      await refresh();
    },
    onError: error => toast.error(error.message || "জমা দেওয়া যায়নি"),
  });
  const approveVoucher = trpc.finance.approveVoucher.useMutation({
    onSuccess: async () => {
      toast.success("ভাউচার অনুমোদিত হয়েছে");
      await refresh();
    },
    onError: error => toast.error(error.message || "অনুমোদন করা যায়নি"),
  });
  const returnVoucher = trpc.finance.approveVoucher.useMutation({
    onSuccess: async () => {
      toast.success("ভাউচার খসড়ায় ফেরত গেছে");
      await refresh();
    },
    onError: error => toast.error(error.message || "ফেরত পাঠানো যায়নি"),
  });
  const postVoucher = trpc.finance.postVoucher.useMutation({
    onSuccess: async () => {
      toast.success("ভাউচার পোস্ট হয়েছে");
      await refresh();
    },
    onError: error => toast.error(error.message || "পোস্ট করা যায়নি"),
  });
  const reverseVoucher = trpc.finance.reverseVoucher.useMutation({
    onSuccess: async () => {
      toast.success("বিপরীত ভাউচার তৈরি হয়েছে");
      setReverseTarget(null);
      await refresh();
    },
    onError: error => toast.error(error.message || "বিপরীত করা যায়নি"),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [formDate, setFormDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formNarration, setFormNarration] = useState("");
  const [debits, setDebits] = useState<EntryDraft[]>([blankEntry()]);
  const [credits, setCredits] = useState<EntryDraft[]>([blankEntry()]);
  const [reverseTarget, setReverseTarget] = useState<{
    id: number;
    voucherNo: string;
  } | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseDate, setReverseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const resetForm = () => {
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormNarration("");
    setDebits([blankEntry()]);
    setCredits([blankEntry()]);
  };

  const sumOf = (entries: EntryDraft[]) =>
    entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const totalDebit = sumOf(debits);
  const totalCredit = sumOf(credits);
  const balanced =
    totalDebit > 0 &&
    Math.round(totalDebit * 100) === Math.round(totalCredit * 100);
  const entriesValid = (entries: EntryDraft[]) =>
    entries.every(entry => entry.accountId && Number(entry.amount) > 0);

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (
      !projectId ||
      !balanced ||
      !entriesValid(debits) ||
      !entriesValid(credits)
    )
      return;
    createVoucher.mutate({
      projectId,
      idempotencyKey: newIdempotencyKey(),
      date: new Date(`${formDate}T12:00:00`),
      narration: formNarration.trim() || undefined,
      debits: debits.map(d => ({
        accountId: Number(d.accountId),
        amount: Number(d.amount),
        narration: d.narration.trim() || undefined,
      })),
      credits: credits.map(c => ({
        accountId: Number(c.accountId),
        amount: Number(c.amount),
        narration: c.narration.trim() || undefined,
      })),
    });
  };

  const setEntry = (
    list: EntryDraft[],
    setList: (next: EntryDraft[]) => void,
    index: number,
    patch: Partial<EntryDraft>
  ) =>
    setList(
      list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    );

  const accounts = overview.data?.accounts ?? [];
  const rows = vouchers.data ?? [];
  const busy =
    createVoucher.isPending ||
    submitVoucher.isPending ||
    approveVoucher.isPending ||
    returnVoucher.isPending ||
    postVoucher.isPending ||
    reverseVoucher.isPending;

  if (projectsLoading)
    return (
      <DashboardLayout>
        <div className="grid min-h-[50vh] place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#2c6c57]" />
        </div>
      </DashboardLayout>
    );
  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-7">
        <header className="flex flex-col gap-4 rounded-[1.75rem] bg-[#173f36] p-5 text-white shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#bcecc6]">
              দ্বি-পক্ষ হিসাব
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">ভাউচার</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">
              খসড়া → জমা → অনুমোদন → পোস্ট। অনুমোদন ও পোস্টের জন্য ভিন্ন
              ব্যবহারকারী প্রয়োজন (চার-চোখ নীতি)।
            </p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-[#e3f3e7]">
            হিসাবখাতা
            <select
              aria-label="হিসাবখাতা নির্বাচন"
              value={activeProjectId ?? ""}
              onChange={event => selectProject(Number(event.target.value))}
              className="h-11 min-w-0 rounded-xl border border-white/25 bg-white px-3 text-sm font-semibold text-[#123c32] focus:outline-none focus:ring-2 focus:ring-[#bcecc6] sm:min-w-60"
            >
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </header>
        {!projects.length ? (
          <Card>
            <CardContent className="p-7 text-center text-sm text-muted-foreground">
              হিসাবখাতা প্রস্তুত হচ্ছে।
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {STATUSES.map(s => (
                <Button
                  key={s.key}
                  type="button"
                  size="sm"
                  variant={statusFilter === s.key ? "default" : "outline"}
                  onClick={() => setStatusFilter(s.key)}
                  className="h-9 rounded-xl"
                >
                  {s.label}
                </Button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-xs text-[#5b7468]">
                <ShieldCheck className="h-4 w-4 text-[#1d7a50]" />
                <span>নিজের তৈরি ভাউচার নিজে অনুমোদন/পোস্ট করা যায় না</span>
              </div>
            </div>

            {canCreate && !showCreate && (
              <Button
                onClick={() => setShowCreate(true)}
                className="h-11 rounded-xl bg-[#1b704d] hover:bg-[#125b3d]"
              >
                <Plus className="h-4 w-4" />
                নতুন ভাউচার
              </Button>
            )}

            {showCreate && (
              <Card className="border-[#dbe7dd]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#173f36]">
                    <ReceiptText className="h-5 w-5 text-[#1d7a50]" />
                    নতুন ভাউচার (খসড়া)
                  </CardTitle>
                  <CardDescription>
                    ডেবিট ও ক্রেডিটের মোট সমান হতে হবে।
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitCreate} className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">
                        তারিখ
                        <Input
                          required
                          type="date"
                          value={formDate}
                          onChange={event => setFormDate(event.target.value)}
                          className="h-11"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-[#4b6c60]">
                        বিবরণ (ঐচ্ছিক)
                        <Input
                          value={formNarration}
                          onChange={event =>
                            setFormNarration(event.target.value)
                          }
                          placeholder="লেনদেনের বিবরণ"
                          className="h-11"
                        />
                      </label>
                    </div>
                    {(
                      [
                        { title: "ডেবিট", list: debits, setList: setDebits },
                        {
                          title: "ক্রেডিট",
                          list: credits,
                          setList: setCredits,
                        },
                      ] as const
                    ).map(group => (
                      <div
                        key={group.title}
                        className="rounded-2xl border border-[#e2ece5] p-3"
                      >
                        <p className="mb-2 text-xs font-bold text-[#2b4c40]">
                          {group.title} — মোট{" "}
                          {bdt(sumOf(group.list as EntryDraft[]))}
                        </p>
                        <div className="grid gap-2">
                          {(group.list as EntryDraft[]).map((entry, i) => (
                            <div
                              key={i}
                              className="grid gap-2 sm:grid-cols-[1fr_130px_1fr_auto]"
                            >
                              <select
                                aria-label={`${group.title} অ্যাকাউন্ট`}
                                value={entry.accountId}
                                onChange={event =>
                                  setEntry(
                                    group.list as EntryDraft[],
                                    group.setList,
                                    i,
                                    { accountId: event.target.value }
                                  )
                                }
                                className="h-11 rounded-xl border border-input bg-white px-3 text-sm"
                              >
                                <option value="">অ্যাকাউন্ট</option>
                                {accounts.map(account => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                              </select>
                              <Input
                                aria-label={`${group.title} পরিমাণ`}
                                required
                                inputMode="decimal"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={entry.amount}
                                onChange={event =>
                                  setEntry(
                                    group.list as EntryDraft[],
                                    group.setList,
                                    i,
                                    { amount: event.target.value }
                                  )
                                }
                                className="h-11"
                              />
                              <Input
                                aria-label={`${group.title} বিবরণ`}
                                value={entry.narration}
                                onChange={event =>
                                  setEntry(
                                    group.list as EntryDraft[],
                                    group.setList,
                                    i,
                                    { narration: event.target.value }
                                  )
                                }
                                placeholder="বিবরণ"
                                className="h-11"
                              />
                              {(group.list as EntryDraft[]).length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    group.setList(
                                      (group.list as EntryDraft[]).filter(
                                        (_, j) => j !== i
                                      )
                                    )
                                  }
                                  aria-label="লাইন মুছুন"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              group.setList([
                                ...(group.list as EntryDraft[]),
                                blankEntry(),
                              ])
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                            লাইন যোগ
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={balanced ? "default" : "outline"}>
                        ডেবিট {bdt(totalDebit)} · ক্রেডিট {bdt(totalCredit)}
                      </Badge>
                      {!balanced && (
                        <span className="text-xs text-amber-700">
                          দুই মোট সমান করুন
                        </span>
                      )}
                      <div className="ml-auto flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowCreate(false);
                            resetForm();
                          }}
                        >
                          বাতিল
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            createVoucher.isPending ||
                            !balanced ||
                            !entriesValid(debits) ||
                            !entriesValid(credits)
                          }
                          className="h-11 rounded-xl bg-[#1b704d]"
                        >
                          {createVoucher.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "খসড়া সংরক্ষণ"
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <Card className="border-[#dbe7dd]">
              <CardContent className="p-0">
                {vouchers.isLoading ? (
                  <div className="grid min-h-36 place-items-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#2c6c57]" />
                  </div>
                ) : rows.length ? (
                  <ul className="divide-y divide-[#edf2ee]">
                    {rows.map(v => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center gap-3 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#1e3b32]">
                            {v.voucherNo}{" "}
                            <span className="ml-2 text-xs font-normal text-[#7c998e]">
                              {dateLabel(v.date)}
                            </span>
                          </p>
                          <p className="truncate text-sm text-[#5b7468]">
                            {v.narration || "বিবরণ নেই"} · {bdt(v.totalDebit)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            v.status === "posted" ? "default" : "outline"
                          }
                        >
                          {v.status}
                        </Badge>
                        <div className="flex flex-wrap gap-1.5">
                          {v.status === "draft" && canSubmit && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                submitVoucher.mutate({
                                  projectId,
                                  voucherId: v.id,
                                  idempotencyKey: newIdempotencyKey(),
                                })
                              }
                              className="h-9 rounded-xl"
                            >
                              <Send className="h-3.5 w-3.5" />
                              জমা
                            </Button>
                          )}
                          {v.status === "submitted" && canApprove && (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  approveVoucher.mutate({
                                    projectId,
                                    voucherId: v.id,
                                    action: "approve",
                                    idempotencyKey: newIdempotencyKey(),
                                  })
                                }
                                className="h-9 rounded-xl bg-[#1b704d]"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                অনুমোদন
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  returnVoucher.mutate({
                                    projectId,
                                    voucherId: v.id,
                                    action: "return",
                                    idempotencyKey: newIdempotencyKey(),
                                  })
                                }
                                className="h-9 rounded-xl"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                ফেরত
                              </Button>
                            </>
                          )}
                          {v.status === "approved" && canPost && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                postVoucher.mutate({
                                  projectId,
                                  voucherId: v.id,
                                  idempotencyKey: newIdempotencyKey(),
                                })
                              }
                              className="h-9 rounded-xl bg-[#173f36]"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              পোস্ট
                            </Button>
                          )}
                          {v.status === "posted" && canReverse && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setReverseTarget({
                                  id: v.id,
                                  voucherNo: v.voucherNo,
                                });
                                setReverseReason("");
                                setReverseDate(
                                  new Date().toISOString().slice(0, 10)
                                );
                              }}
                              className="h-9 rounded-xl"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              বিপরীত
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-6 text-center text-sm text-[#5d786c]">
                    এই অবস্থায় কোনো ভাউচার নেই।
                  </p>
                )}
              </CardContent>
            </Card>

            {reverseTarget && (
              <Card className="border-[#edc975] bg-[#fffaf0]">
                <CardHeader>
                  <CardTitle className="text-[#754c00]">
                    ভাউচার বিপরীত করুন ({reverseTarget.voucherNo})
                  </CardTitle>
                  <CardDescription className="text-[#805f21]">
                    মূল ভাউচার অপরিবর্তিত থাকবে; সমান-বিপরীত এন্ট্রির নতুন
                    ভাউচার তৈরি হবে।
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
                  <Input
                    value={reverseReason}
                    onChange={event => setReverseReason(event.target.value)}
                    placeholder="কারণ (আবশ্যক)"
                    className="h-11 bg-white"
                  />
                  <Input
                    type="date"
                    value={reverseDate}
                    onChange={event => setReverseDate(event.target.value)}
                    className="h-11 bg-white"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        reverseVoucher.mutate({
                          projectId,
                          originalVoucherId: reverseTarget.id,
                          reason: reverseReason.trim(),
                          date: new Date(`${reverseDate}T12:00:00`),
                          idempotencyKey: newIdempotencyKey(),
                        })
                      }
                      disabled={
                        !reverseReason.trim() || reverseVoucher.isPending
                      }
                      className="h-11 rounded-xl bg-[#9a5b06]"
                    >
                      <CalendarClock className="h-4 w-4" />
                      নিশ্চিত
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setReverseTarget(null)}
                      className="h-11 rounded-xl"
                    >
                      বাতিল
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
