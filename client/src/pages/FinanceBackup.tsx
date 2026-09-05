import DashboardLayout from "@/components/DashboardLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { readActiveProjectId, resolveActiveProjectId, saveActiveProjectId } from "@/lib/activeProject";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Download,
  FileUp,
  HardDriveDownload,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function downloadJson(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function FinanceBackup() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: projects = [] } = trpc.projects.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [backup, setBackup] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [restoreName, setRestoreName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [cloudBackupResult, setCloudBackupResult] = useState<any>(null);

  const projectId = activeProjectId ?? 0;
  const exportBackup = trpc.finance.exportProjectBackup.useQuery({ projectId }, { enabled: false, retry: false });
  const previewBackup = trpc.finance.previewProjectBackup.useMutation();
  const restoreBackup = trpc.finance.restoreProjectBackup.useMutation({
    onSuccess: async result => {
      await utils.projects.list.invalidate();
      saveActiveProjectId(result.projectId);
      toast.success("নতুন হিসাবখাতায় ব্যাকআপ পুনরুদ্ধার হয়েছে");
      setLocation("/");
    },
    onError: error => toast.error(error.message || "পুনরুদ্ধার করা যায়নি"),
  });

  const cloudStorageStatus = trpc.finance.cloudBackupStatus.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const triggerCloudBackup = trpc.finance.triggerCloudBackup.useMutation({
    onSuccess: result => {
      setCloudBackupResult(result);
      toast.success(result.message || "ক্লাউড ব্যাকআপ সম্পন্ন হয়েছে");
    },
    onError: error => toast.error(error.message || "ক্লাউড ব্যাকআপ ব্যর্থ হয়েছে"),
  });

  useEffect(() => {
    if (projects.length) setActiveProjectId(current => resolveActiveProjectId(projects.map(project => project.id), current, readActiveProjectId()));
  }, [projects]);

  if (user && user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto py-12 px-4 text-center">
          <div className="bg-white rounded-3xl p-8 border border-amber-200 shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-[#173f36]">অ্যাডমিন অনুমতি প্রয়োজন</h2>
            <p className="text-sm text-[#5c7a6e] leading-relaxed">
              সিস্টেম ব্যাকআপ ও ডেটা রিস্টোর করার ক্ষমতা শুধুমাত্র অনুমোদিত প্রধান অ্যাডমিনিস্ট্রেটরের জন্য সংরক্ষিত। সাধারণ ব্যবহারকারী বা এডিটরদের এই সেকশনে অনুমতি নেই।
            </p>
            <Button onClick={() => setLocation("/")} className="rounded-xl bg-[#173f36] text-white hover:bg-[#102d26] px-6">
              ড্যাশবোর্ডে ফিরে যান
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const chooseProject = (value: string) => {
    const id = Number(value);
    setActiveProjectId(id);
    saveActiveProjectId(id);
  };

  const downloadBackup = async () => {
    if (!projectId) return;
    const result = await exportBackup.refetch();
    if (!result.data) {
      toast.error("ব্যাকআপ তৈরি করা যায়নি");
      return;
    }
    const safeName = result.data.project.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "finance-project";
    downloadJson(result.data, `${safeName}-backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast.success("প্রজেক্ট ব্যাকআপ ডাউনলোড হয়েছে");
  };

  const handleTriggerCloudBackup = () => {
    if (!projectId) {
      toast.error("প্রথমে একটি প্রজেক্ট নির্বাচন করুন");
      return;
    }
    triggerCloudBackup.mutate({ projectId });
  };

  const readBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("ব্যাকআপ ফাইল ২০ এমবির বেশি হতে পারবে না");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const result = await previewBackup.mutateAsync({ backup: parsed });
      setBackup(parsed);
      setPreview(result);
      setRestoreName(`${result.sourceProjectName} — পুনরুদ্ধার`);
      setConfirmation("");
      toast.success("ব্যাকআপ যাচাই সম্পন্ন হয়েছে");
    } catch (error) {
      setBackup(null);
      setPreview(null);
      toast.error(error instanceof Error ? error.message : "ফাইলটি বৈধ ব্যাকআপ নয়");
    }
  };

  const restore = () => {
    if (!backup || !restoreName.trim()) return;
    restoreBackup.mutate({ projectName: restoreName.trim(), confirmation: "RESTORE_NEW_PROJECT", backup });
  };

  const storageConfig = cloudStorageStatus.data;

  return (
    <DashboardLayout>
      <main className="space-y-5 sm:space-y-7">
        <header className="flex flex-col gap-4 rounded-[1.75rem] bg-[#123c32] p-5 text-white shadow-[0_20px_50px_rgba(18,60,50,.16)] sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-bold tracking-[.18em] text-[#bcecc6]">নিরাপদ ব্যাকআপ ও ক্লাউড সিঙ্ক</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">হিসাব সংরক্ষণ, ক্লাউড ব্যাকআপ ও পুনরুদ্ধার</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6e9dc]">স্বয়ংক্রিয় ক্লাউড ব্যাকআপ (S3 / Google Drive / Supabase) এবং এনক্রিপ্টেড অফলাইন স্ন্যাপশট। পুনরুদ্ধার সবসময় নতুন হিসাবখাতায় হবে; বিদ্যমান কোনো তথ্য মুছবে না।</p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-[#e3f3e7]">হিসাবখাতা
            <select aria-label="ব্যাকআপের হিসাবখাতা নির্বাচন" value={activeProjectId ?? ""} onChange={event => chooseProject(event.target.value)} className="h-11 min-w-0 rounded-xl border border-white/25 bg-white px-3 text-sm font-semibold text-[#123c32] focus:outline-none focus:ring-2 focus:ring-[#bcecc6] sm:min-w-60">
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </header>

        {/* Automated Cloud Storage Card */}
        <Card className="border-[#c9e2d3] bg-[#f8fdf9] shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-[#154637]">
                  <Cloud className="h-5 w-5 text-[#1b704d]" />
                  স্বয়ংক্রিয় ক্লাউড ব্যাকআপ (Automated Cloud Storage)
                </CardTitle>
                <CardDescription className="text-[#4e7465]">
                  AWS S3 / R2, Google Drive এবং Supabase Storage-এ AES-256-GCM এনক্রিপ্টেড দৈনিক শিডিউলড ব্যাকআপ।
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`gap-1.5 px-3 py-1 text-xs ${storageConfig?.supabase?.enabled ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-gray-50 text-gray-600"}`}>
                  <Server className="h-3 w-3" />
                  Supabase: {storageConfig?.supabase?.enabled ? "সক্রিয়" : "প্রস্তুত"}
                </Badge>
                <Badge variant="outline" className={`gap-1.5 px-3 py-1 text-xs ${storageConfig?.s3?.enabled ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-gray-50 text-gray-600"}`}>
                  <Cloud className="h-3 w-3" />
                  S3 / R2: {storageConfig?.s3?.enabled ? "সক্রিয়" : "প্রস্তুত"}
                </Badge>
                <Badge variant="outline" className={`gap-1.5 px-3 py-1 text-xs ${storageConfig?.googleDrive?.enabled ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-gray-50 text-gray-600"}`}>
                  <Lock className="h-3 w-3" />
                  Drive: {storageConfig?.googleDrive?.enabled ? "সক্রিয়" : "প্রস্তুত"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#d6ebd9] bg-white p-3.5">
                <p className="text-xs font-semibold text-[#5a7f6f]">এনক্রিপশন নিরাপত্তা</p>
                <p className="mt-1 font-bold text-sm text-[#143e30]">AES-256-GCM</p>
                <p className="mt-0.5 text-[11px] text-[#719283]">SHA-256 ইন্টিগ্রিটি চেকসাম সহ</p>
              </div>
              <div className="rounded-2xl border border-[#d6ebd9] bg-white p-3.5">
                <p className="text-xs font-semibold text-[#5a7f6f]">অটোমেটেড শিডিউল</p>
                <p className="mt-1 font-bold text-sm text-[#143e30]">প্রতিদিন রাত ১২:০০</p>
                <p className="mt-0.5 text-[11px] text-[#719283]">ক্রন জব দ্বারা স্বয়ংক্রিয় ব্যাকআপ</p>
              </div>
              <div className="rounded-2xl border border-[#d6ebd9] bg-white p-3.5">
                <p className="text-xs font-semibold text-[#5a7f6f]">ক্লাউড প্রোভাইডার</p>
                <p className="mt-1 font-bold text-sm text-[#143e30]">
                  {storageConfig?.supabase?.enabled ? "Supabase Storage" : storageConfig?.s3?.enabled ? "AWS S3 / R2" : storageConfig?.googleDrive?.enabled ? "Google Drive" : "এনক্রিপ্টেড স্ন্যাপশট"}
                </p>
                <p className="mt-0.5 text-[11px] text-[#719283]">অফ-সাইট ব্যাকআপ সিঙ্ক</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <p className="text-xs text-[#527768]">
                এখনই নির্বাচিত হিসাবখাতার একটি এনক্রিপ্টেড ব্যাকআপ ক্লাউড স্টোরেজে পাঠাতে পারেন।
              </p>
              <Button
                onClick={handleTriggerCloudBackup}
                disabled={!projectId || triggerCloudBackup.isPending}
                className="h-11 rounded-xl bg-[#173f36] hover:bg-[#0f2e27] text-white font-semibold flex items-center gap-2 px-5 shrink-0"
              >
                {triggerCloudBackup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {triggerCloudBackup.isPending ? "ক্লাউডে আপলোড হচ্ছে..." : "এখনই ক্লাউড ব্যাকআপ নিন"}
              </Button>
            </div>

            {cloudBackupResult && (
              <Alert className="border-[#cce5d4] bg-white text-[#184637]">
                <CheckCircle2 className="h-4 w-4 text-[#1a7a4c]" />
                <AlertTitle>ক্লাউড ব্যাকআপ সফল</AlertTitle>
                <AlertDescription className="text-xs space-y-1 mt-1 text-[#436758]">
                  <p><strong>ফাইল:</strong> {cloudBackupResult.fileName}</p>
                  <p><strong>প্রোভাইডার:</strong> {cloudBackupResult.provider} · <strong>আকার:</strong> {Math.round(cloudBackupResult.byteSize / 1024)} KB · <strong>চেকসাম:</strong> {cloudBackupResult.checksum.slice(0, 16)}...</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="border-[#dbe7dd] shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><HardDriveDownload className="h-5 w-5 text-[#2c6c57]" />প্রজেক্ট ব্যাকআপ ডাউনলোড</CardTitle><CardDescription>অ্যাকাউন্ট, ক্যাটাগরি, লেনদেন, বাজেট, বিল, দেনা-পাওনা, সমন্বয়, পুনরাবৃত্ত এন্ট্রি ও ভাউচার সেটিংস অন্তর্ভুক্ত থাকবে।</CardDescription></CardHeader>
            <CardContent className="space-y-4"><Alert className="border-[#d6e7da] bg-[#f2faf3] text-[#244a3a]"><ShieldCheck className="h-4 w-4" /><AlertTitle>ডিভাইসে নিজে সংরক্ষণ করুন</AlertTitle><AlertDescription>ফাইলটি সংবেদনশীল আর্থিক তথ্য বহন করে। বিশ্বস্ত ও পাসওয়ার্ড-সুরক্ষিত স্থানে রাখুন।</AlertDescription></Alert><Button className="h-12 w-full rounded-xl bg-[#1b704d] hover:bg-[#125b3d]" disabled={!projectId || exportBackup.isFetching} onClick={downloadBackup}>{exportBackup.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}ব্যাকআপ ডাউনলোড করুন</Button></CardContent>
          </Card>

          <Card className="border-[#dbe7dd] shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-[#173f36]"><FileUp className="h-5 w-5 text-[#2c6c57]" />ব্যাকআপ যাচাই ও পুনরুদ্ধার</CardTitle><CardDescription>আগে JSON ফাইল যাচাই হবে। এরপর আপনি আলাদা নতুন হিসাবখাতার নাম ও স্পষ্ট অনুমোদন দিলে তবেই পুনরুদ্ধার শুরু হবে।</CardDescription></CardHeader>
            <CardContent className="space-y-4"><Label className="grid gap-2 text-sm font-semibold text-[#365d4d]">ব্যাকআপ JSON ফাইল
              <Input aria-label="ব্যাকআপ JSON ফাইল নির্বাচন" type="file" accept="application/json,.json" onChange={readBackupFile} className="h-11 cursor-pointer bg-white" />
            </Label>
            {previewBackup.isPending && <div className="flex items-center gap-2 text-sm text-[#567164]"><Loader2 className="h-4 w-4 animate-spin" />ফাইল যাচাই হচ্ছে…</div>}
            {preview && <div className="rounded-2xl border border-[#d9e8dc] bg-[#f7fbf8] p-4"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#218252]" /><div><p className="font-semibold text-[#1a4335]">ব্যাকআপটি পুনরুদ্ধারের জন্য প্রস্তুত</p><p className="mt-1 text-sm text-[#597367]">উৎস: {preview.sourceProjectName} · রপ্তানি: {formatDate(preview.exportedAt)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{Object.entries(preview.counts).map(([label, count]) => <div key={label} className="rounded-xl bg-white p-2 text-center"><p className="text-xs text-[#617b70]">{label === "accounts" ? "অ্যাকাউন্ট" : label === "categories" ? "ক্যাটাগরি" : label === "transactions" ? "লেনদেন" : label === "budgets" ? "বাজেট" : label === "bills" ? "বিল" : label === "dues" ? "দেনা-পাওনা" : label === "settlements" ? "সমন্বয়" : "পুনরাবৃত্ত"}</p><p className="mt-1 font-bold text-[#234b3b]">{new Intl.NumberFormat("bn-BD").format(Number(count))}</p></div>)}</div>{preview.transactionDateRange && <p className="mt-3 text-xs text-[#567164]">লেনদেনের সময়কাল: {formatDate(preview.transactionDateRange.from)} থেকে {formatDate(preview.transactionDateRange.to)}</p>}</div>}
            </CardContent>
          </Card>
        </section>

        {preview && <Card className="border-[#edc975] bg-[#fffaf0] shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-[#754c00]"><AlertTriangle className="h-5 w-5" />নতুন হিসাবখাতায় নিরাপদ পুনরুদ্ধার</CardTitle><CardDescription className="text-[#805f21]">বিদ্যমান হিসাব বদলাবে না। পুনরুদ্ধারকৃত পুনরাবৃত্ত এন্ট্রি ও বিল-রিমাইন্ডারের স্বয়ংক্রিয় সময়সূচি বন্ধ থাকবে; প্রয়োজনে নতুন হিসাবখাতা থেকে আপনি নিজে চালু করবেন।</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Label className="grid gap-2 text-sm font-semibold text-[#6e531f]">নতুন হিসাবখাতার নাম<Input value={restoreName} onChange={event => setRestoreName(event.target.value)} className="h-11 bg-white" /></Label><Label className="grid gap-2 text-sm font-semibold text-[#6e531f]">অনুমোদনের জন্য লিখুন: <code className="rounded bg-white px-1.5 py-0.5">RESTORE_NEW_PROJECT</code><Input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="h-11 bg-white" placeholder="RESTORE_NEW_PROJECT" /></Label><div className="sm:col-span-2"><Button className="h-12 w-full rounded-xl bg-[#9a5b06] hover:bg-[#7d4900]" disabled={confirmation !== "RESTORE_NEW_PROJECT" || !restoreName.trim() || restoreBackup.isPending} onClick={restore}>{restoreBackup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}নতুন হিসাবখাতায় পুনরুদ্ধার করুন</Button></div></CardContent></Card>}
      </main>
    </DashboardLayout>
  );
}
