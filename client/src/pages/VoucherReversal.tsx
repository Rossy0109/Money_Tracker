import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Plus, RotateCcw, Loader2, Eye, Calendar, AlertCircle, CheckCircle, ArrowLeftRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useMemo } from "react";
import { format } from "date-fns";

interface Voucher {
  id: number;
  voucherNo: string;
  date: Date;
  narration?: string | null;
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "submitted" | "approved" | "posted" | "reversed";
  createdAt: Date;
  reversal?: { reversalVoucherId: number; reversalVoucherNo: string } | null;
}

interface Reversal {
  id: number;
  originalVoucherId: number;
  reversalVoucherId: number;
  reason: string;
  reversedAt: Date;
  reversedBy: number;
  originalVoucherNo: string;
  reversalVoucherNo: string;
}

interface ReverseVoucherResult {
  originalVoucherId: number;
  reversalVoucherId: number;
  reversalVoucherNo: string;
}

export default function VoucherReversal() {
  const { isAuthenticated, user } = useAuth();
  const { activeProjectId, projects, isLoading: projectsLoading, selectProject } = useActiveProject();

  const utils = trpc.useUtils();

  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const voucherListQuery = trpc.finance.voucherList.useQuery(
    { projectId: activeProjectId ?? 0, status: "posted", limit: 200 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const reversalsQuery = trpc.finance.getVoucherReversals.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const reverseVoucherMutation = trpc.finance.reverseVoucher.useMutation({
    onSuccess: (data: ReverseVoucherResult) => {
      toast.success(`ভাউচার রিভার্সাল সফল: ${data.originalVoucherId} → ${data.reversalVoucherNo}`);
      utils.finance.voucherList.invalidate({ projectId: activeProjectId!, status: "posted" });
      utils.finance.getVoucherReversals.invalidate({ projectId: activeProjectId! });
    },
    onError: (err) => toast.error(err.message || "রিভার্সাল করা যায়নি"),
  });

  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDate, setReversalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [previewOpen, setPreviewOpen] = useState(false);

  const projectSelector = projects.length ? (
    <label className="flex items-center gap-2 text-sm font-medium text-[#456257]">
      <span>প্রকল্প</span>
      <select
        aria-label="প্রকল্প নির্বাচন"
        value={activeProjectId ?? ""}
        onChange={event => selectProject(Number(event.target.value))}
        className="h-10 max-w-[240px] rounded-xl border border-[#d7e5da] bg-white px-3 text-[#173f36] outline-none focus:ring-2 focus:ring-[#8bd5a0]"
      >
        {projects.map((project: { id: number; name: string }) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
    </label>
  ) : null;

  if (overview.isLoading || projectsLoading || voucherListQuery.isLoading || reversalsQuery.isLoading) {
    return (
      <DashboardLayout>
        <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <div className="finance-card p-8 text-center text-sm text-[#668076]">ভাউচার রিভার্সাল লোড হচ্ছে…</div>
        </main>
      </DashboardLayout>
    );
  }

  const vouchers = voucherListQuery.data ?? [];
  const reversals = reversalsQuery.data ?? [];

  const reversibleVouchers = useMemo(() => 
    vouchers.filter(v => !v.reversal && v.status === "posted")
  , [vouchers]);

  const handleReverse = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setReversalReason("");
    setReversalDate(format(new Date(), "yyyy-MM-dd"));
  };

  const confirmReverse = () => {
    if (!selectedVoucher || !reversalReason.trim()) return;
    reverseVoucherMutation.mutate({
      projectId: activeProjectId!,
      originalVoucherId: selectedVoucher.id,
      reason: reversalReason.trim(),
      date: new Date(reversalDate),
    });
    setSelectedVoucher(null);
    setPreviewOpen(false);
  };

  const getReversalInfo = (voucherId: number) => {
    return reversals.find(r => r.originalVoucherId === voucherId);
  };

  if (overview.isLoading || projectsLoading || voucherListQuery.isLoading || reversalsQuery.isLoading) {
    return (
      <DashboardLayout>
        <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <div className="finance-card p-8 text-center text-sm text-[#668076]">ভাউচার রিভার্সাল লোড হচ্ছে…</div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
        <header className="rounded-[1.75rem] bg-[#eaf3ed] p-6 sm:p-8">
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-[#28603c]">
            <a href="/" className="inline-flex items-center gap-2 rounded-lg hover:text-[#173f36] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#54b86a]">
              <RotateCcw className="h-4 w-4" />
              ড্যাশবোর্ডে ফিরুন
            </a>
          </div>
          <p className="section-kicker">অ্যাকাউন্টিং</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#173f36]">ভাউচার রিভার্সাল</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f786d]">
            পোস্ট করা ভাউচারটি রিভার্স (উল্টো) করুন। এটি ডেবিট/ক্রেডিট বিনিময় করে একটি নতুন ভাউচার তৈরি করবে এবং মূল ভাউচার ক্যান্সেল হবে।
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {projectSelector}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>রিভার্সবেল ভাউচারসমূহ</CardTitle>
            <CardDescription>শুধু পোস্ট করা এবং এখনো রিভার্স করা নেই এমন ভাউচারগুলো দেখানো হয়েছে</CardDescription>
          </CardHeader>
          <CardContent>
            {reversibleVouchers.length === 0 ? (
              <div className="text-center py-8 text-[#668076]">
                রিভার্স করার জন্য উপযুক্ত কোনো ভাউচার নেই
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f6faf7]">
                      <TableHead className="w-40">ভাউচার নম্বর</TableHead>
                      <TableHead className="w-32">তারিখ</TableHead>
                      <TableHead>বিবরণ</TableHead>
                      <TableHead className="w-40 text-right">মোট ডেবিট</TableHead>
                      <TableHead className="w-40 text-right">মোট ক্রেডিট</TableHead>
                      <TableHead className="w-24">স্ট্যাটাস</TableHead>
                      <TableHead className="w-32">অ্যাকশন</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reversibleVouchers.map(voucher => (
                      <TableRow key={voucher.id} className="hover:bg-[#f6faf7]">
                        <TableCell className="font-mono font-medium">{voucher.voucherNo}</TableCell>
                        <TableCell>{format(new Date(voucher.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="max-w-xs truncate">{voucher.narration || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{voucher.totalDebit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right font-mono">{voucher.totalCredit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <Badge variant={voucher.status === "posted" ? "default" : "secondary"}>
                            {voucher.status === "posted" ? "পোস্ট করা" : voucher.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleReverse(voucher)}
                            disabled={reverseVoucherMutation.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> রিভার্স
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>রিভার্সাল হিস্ট্রি</CardTitle>
            <CardDescription>স 사내 সফলভাবে সম্পন্ন রিভার্সালগুলো</CardDescription>
          </CardHeader>
          <CardContent>
            {reversals.length === 0 ? (
              <div className="text-center py-8 text-[#668076]">কোনো রিভার্সাল হিস্ট্রি নেই</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#f6faf7]">
                      <TableHead className="w-40">মূল ভাউচার</TableHead>
                      <TableHead className="w-40">রিভার্সাল ভাউচার</TableHead>
                      <TableHead className="w-32">রিভার্সাল তারিখ</TableHead>
                      <TableHead>কারণ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reversals.map(rev => (
                      <TableRow key={rev.id}>
                        <TableCell className="font-mono font-medium">{rev.originalVoucherNo}</TableCell>
                        <TableCell className="font-mono font-medium">{rev.reversalVoucherNo}</TableCell>
                        <TableCell>{format(new Date(rev.reversedAt), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell className="max-w-xs truncate">{rev.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedVoucher && (
          <Dialog open onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>রিভার্সাল প্রিভিউ: {selectedVoucher.voucherNo}</DialogTitle>
                <DialogDescription>নিচের এন্ট্রিগুলো বিনিময় হবে (ডেবিট ↔ ক্রেডিট)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                  <div className="font-semibold text-blue-800">মূল ভাউচার: {selectedVoucher.voucherNo}</div>
                  <div className="text-sm text-blue-700 mt-1">
                    ডেবিট: <span className="font-mono">{selectedVoucher.totalDebit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</span> | 
                    ক্রেডিট: <span className="font-mono">{selectedVoucher.totalCredit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center my-2">
                  <ArrowLeftRight className="h-6 w-6 text-[#8da69c]" />
                </div>
                <div className="p-3 rounded-lg border border-red-200 bg-red-50">
                  <div className="font-semibold text-red-800">রিভার্সাল ভাউচার (নতুন)</div>
                  <div className="text-sm text-red-700 mt-1">
                    ডেবিট: <span className="font-mono">{selectedVoucher.totalCredit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</span> | 
                    ক্রেডিট: <span className="font-mono">{selectedVoucher.totalDebit.toLocaleString("bn-BD", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="reversalReason">রিভার্সালের কারণ *</Label>
                    <Input
                      id="reversalReason"
                      placeholder="রিভার্সালের কারণ লিখুন..."
                      value={reversalReason}
                      onChange={e => setReversalReason(e.target.value)}
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reversalDate">রিভার্সাল তারিখ</Label>
                    <Input
                      id="reversalDate"
                      type="date"
                      value={reversalDate}
                      onChange={e => setReversalDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSelectedVoucher(null); setPreviewOpen(false); }} disabled={reverseVoucherMutation.isPending}>
                  বাতিল
                </Button>
                <Button variant="destructive" onClick={confirmReverse} disabled={reverseVoucherMutation.isPending || !reversalReason.trim()}>
                  {reverseVoucherMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />} রিভার্সাল নিশ্চিত করুন
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </DashboardLayout>
  );
}