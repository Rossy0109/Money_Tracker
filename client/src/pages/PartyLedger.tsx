import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Receipt,
  FileText,
  Download,
  Share2,
  Calendar,
  Wallet,
  Phone,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Building2,
  ArrowRight,
  HandCoins,
} from "lucide-react";

const bdt = (val: number | string | null | undefined) =>
  `৳ ${Number(val || 0).toLocaleString("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const BENGALI_FONT_URL = "/fonts/NotoSansBengali-Regular.ttf";

async function addBengaliFont(doc: any) {
  try {
    const response = await window.fetch(BENGALI_FONT_URL);
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    doc.addFileToVFS("NotoSansBengali-Regular.ttf", btoa(binary));
    doc.addFont("NotoSansBengali-Regular.ttf", "NotoSansBengali", "normal");
    doc.setFont("NotoSansBengali", "normal");
  } catch (err) {
    console.warn("Could not embed Bengali font in PDF:", err);
  }
}

export default function PartyLedger() {
  const { activeProjectId: projectId } = useActiveProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "receivable" | "debt" | "due_only">("all");
  const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);

  // Settlement Dialog State
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [settlementDueId, setSettlementDueId] = useState<number | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState<string>("");
  const [settlementNote, setSettlementNote] = useState("");

  const utils = trpc.useUtils();
  const overviewQuery = trpc.finance.overview.useQuery({ projectId: projectId! }, { enabled: !!projectId });
  const invoicesQuery = trpc.finance.invoices.useQuery({ projectId: projectId! }, { enabled: !!projectId });

  const settleMutation = trpc.finance.settleDue.useMutation({
    onSuccess: async () => {
      toast.success("পেমেন্ট / সমন্বয় সফলভাবে সম্পন্ন হয়েছে");
      setSettlementDialogOpen(false);
      setSettlementAmount("");
      setSettlementNote("");
      await utils.finance.overview.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "সমন্বয় করা যায়নি");
    },
  });

  const dues = overviewQuery.data?.dues || [];
  const accounts = overviewQuery.data?.accounts || [];
  const invoices = invoicesQuery.data || [];

  // Group and synthesize parties from dues, settlements, and invoices
  const parties = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        phone?: string | null;
        totalReceivable: number;
        totalDebt: number;
        outstandingReceivable: number;
        outstandingDebt: number;
        dues: typeof dues;
        invoices: typeof invoices;
        settlementsCount: number;
        lastActivityDate: Date;
      }
    >();

    // Process Dues & Counterparties
    for (const due of dues) {
      const name = due.counterparty.trim();
      if (!name) continue;

      const existing = map.get(name) || {
        name,
        phone: null,
        totalReceivable: 0,
        totalDebt: 0,
        outstandingReceivable: 0,
        outstandingDebt: 0,
        dues: [],
        invoices: [],
        settlementsCount: 0,
        lastActivityDate: new Date(due.openedAt),
      };

      const orig = Number(due.originalAmount || 0);
      const outst = Number(due.outstandingAmount || 0);

      if (due.type === "receivable") {
        existing.totalReceivable += orig;
        existing.outstandingReceivable += outst;
      } else {
        existing.totalDebt += orig;
        existing.outstandingDebt += outst;
      }

      existing.dues.push(due);
      existing.settlementsCount += due.settlements?.length || 0;

      const opened = new Date(due.openedAt);
      if (opened > existing.lastActivityDate) {
        existing.lastActivityDate = opened;
      }

      map.set(name, existing);
    }

    // Process Invoices & Client Names
    for (const inv of invoices) {
      const name = inv.clientName?.trim();
      if (!name) continue;

      const existing = map.get(name) || {
        name,
        phone: inv.clientPhone || null,
        totalReceivable: 0,
        totalDebt: 0,
        outstandingReceivable: 0,
        outstandingDebt: 0,
        dues: [],
        invoices: [],
        settlementsCount: 0,
        lastActivityDate: new Date(inv.issueDate),
      };

      if (inv.clientPhone && !existing.phone) {
        existing.phone = inv.clientPhone;
      }

      existing.invoices.push(inv);

      const issued = new Date(inv.issueDate);
      if (issued > existing.lastActivityDate) {
        existing.lastActivityDate = issued;
      }

      map.set(name, existing);
    }

    return Array.from(map.values()).sort((a, b) => {
      const aBalance = Math.abs(a.outstandingReceivable - a.outstandingDebt);
      const bBalance = Math.abs(b.outstandingReceivable - b.outstandingDebt);
      return bBalance - aBalance;
    });
  }, [dues, invoices]);

  // Summary Totals
  const totalReceivable = parties.reduce((sum, p) => sum + p.outstandingReceivable, 0);
  const totalDebt = parties.reduce((sum, p) => sum + p.outstandingDebt, 0);
  const netBalance = totalReceivable - totalDebt;

  // Filtered Parties
  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.phone && p.phone.includes(searchQuery));

      if (!matchesSearch) return false;

      if (typeFilter === "receivable") return p.outstandingReceivable > 0;
      if (typeFilter === "debt") return p.outstandingDebt > 0;
      if (typeFilter === "due_only") return p.outstandingReceivable > 0 || p.outstandingDebt > 0;

      return true;
    });
  }, [parties, searchQuery, typeFilter]);

  // Currently Selected Party for Detailed Ledger
  const activeParty = useMemo(() => {
    if (!selectedPartyName && filteredParties.length > 0) {
      return filteredParties[0];
    }
    return parties.find((p) => p.name === selectedPartyName) || filteredParties[0] || null;
  }, [parties, filteredParties, selectedPartyName]);

  // Build Chronological Ledger Entries for Active Party
  const ledgerEntries = useMemo(() => {
    if (!activeParty) return [];

    type LedgerEntry = {
      id: string;
      date: Date;
      type: "receivable_opened" | "debt_opened" | "settlement" | "invoice";
      title: string;
      voucherNo?: string | null;
      note?: string | null;
      debit: number; // টাকা আমরা পাবো বা দিয়েছি (পাওনা বৃদ্ধি / দেনা হ্রাস)
      credit: number; // টাকা পেয়েছি বা দেনা বৃদ্ধি
      runningBalance: number;
      dueId?: number;
    };

    const entries: Omit<LedgerEntry, "runningBalance">[] = [];

    // Dues records
    for (const d of activeParty.dues) {
      const orig = Number(d.originalAmount || 0);
      entries.push({
        id: `due-${d.id}`,
        date: new Date(d.openedAt),
        type: d.type === "receivable" ? "receivable_opened" : "debt_opened",
        title: d.type === "receivable" ? "পাওনা সৃষ্টি (হিসাব বাকি)" : "দেনা সৃষ্টি (বকেয়া ঋণ)",
        voucherNo: d.voucherNo,
        note: d.note,
        debit: d.type === "receivable" ? orig : 0,
        credit: d.type === "debt" ? orig : 0,
        dueId: d.id,
      });

      // Settlements
      if (d.settlements && d.settlements.length > 0) {
        for (const s of d.settlements) {
          const sAmt = Number(s.amount || 0);
          entries.push({
            id: `settle-${s.id}`,
            date: new Date(s.occurredAt),
            type: "settlement",
            title: d.type === "receivable" ? "পাওনা আদায় (নগদ/ব্যাংক)" : "দেনা পরিশোধ (পরিশোধিত)",
            voucherNo: s.voucherNo,
            note: s.note,
            debit: d.type === "debt" ? sAmt : 0, // দেনা কমলো
            credit: d.type === "receivable" ? sAmt : 0, // পাওনা কমলো
            dueId: d.id,
          });
        }
      }
    }

    // Invoices records
    for (const inv of activeParty.invoices) {
      const gTot = Number(inv.grandTotal || 0);
      entries.push({
        id: `inv-${inv.id}`,
        date: new Date(inv.issueDate),
        type: "invoice",
        title: `ইনভয়েস #${inv.invoiceNumber} (${inv.status === "paid" ? "পরিশোধিত" : "বকেয়া"})`,
        voucherNo: inv.invoiceNumber,
        note: inv.notesTerms,
        debit: gTot,
        credit: 0,
      });
    }

    // Sort chronologically ascending
    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate Running Balance
    let currentBalance = 0;
    return entries.map((e) => {
      currentBalance += e.debit - e.credit;
      return {
        ...e,
        runningBalance: currentBalance,
      };
    });
  }, [activeParty]);

  // Export PDF Statement for Active Party
  const handleDownloadPdf = async () => {
    if (!activeParty) return;

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      await addBengaliFont(doc);

      const pageWidth = 595;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // Header Bar
      doc.setFillColor(17, 58, 48); // #113a30
      doc.rect(0, 0, pageWidth, 60, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text("Ahmed's Financial Accounting", margin, 26);

      doc.setFontSize(10);
      doc.setTextColor(190, 215, 200);
      doc.text("পার্টি খতিয়ান ও হিসাব বিবরণী (Party Statement of Account)", margin, 42);

      // Party Info Card in PDF
      let y = 80;
      doc.setFillColor(245, 248, 245);
      doc.roundedRect(margin, y, contentWidth, 54, 4, 4, "F");

      doc.setTextColor(22, 60, 50);
      doc.setFontSize(12);
      doc.text(`পার্টির নাম: ${activeParty.name}`, margin + 14, y + 20);

      doc.setFontSize(9.5);
      doc.setTextColor(80, 105, 95);
      if (activeParty.phone) {
        doc.text(`মোবাইল: ${activeParty.phone}`, margin + 14, y + 36);
      }
      doc.text(
        `বিবরণী তৈরির তারিখ: ${new Intl.DateTimeFormat("bn-BD", { dateStyle: "medium" }).format(new Date())}`,
        pageWidth - margin - 14,
        y + 20,
        { align: "right" }
      );

      const netDue = activeParty.outstandingReceivable - activeParty.outstandingDebt;
      doc.setTextColor(netDue >= 0 ? 34 : 157, netDue >= 0 ? 110 : 51, netDue >= 0 ? 73 : 51);
      doc.text(
        `বর্তমান নিট বকেয়া: ${bdt(Math.abs(netDue))} (${netDue >= 0 ? "পাওনা" : "দেনা"})`,
        pageWidth - margin - 14,
        y + 36,
        { align: "right" }
      );

      y = 150;

      // Table Header
      doc.setFillColor(230, 240, 233);
      doc.rect(margin, y, contentWidth, 22, "F");
      doc.setTextColor(20, 50, 40);
      doc.setFontSize(8.5);

      doc.text("তারিখ", margin + 8, y + 14);
      doc.text("বিবরণ ও রেফারেন্স", margin + 80, y + 14);
      doc.text("ডেবিট (৳)", margin + 260, y + 14, { align: "right" });
      doc.text("ক্রেডিট (৳)", margin + 340, y + 14, { align: "right" });
      doc.text("চলমান ব্যালেন্স (৳)", pageWidth - margin - 8, y + 14, { align: "right" });

      y += 24;

      // Table Rows
      for (const entry of ledgerEntries) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }

        doc.setFontSize(8);
        doc.setTextColor(60, 75, 68);
        doc.text(
          new Intl.DateTimeFormat("bn-BD", { day: "2-digit", month: "short", year: "numeric" }).format(entry.date),
          margin + 8,
          y + 10
        );

        const titleText = `${entry.title} ${entry.voucherNo ? `[${entry.voucherNo}]` : ""}`;
        doc.text(titleText, margin + 80, y + 10);

        doc.setTextColor(34, 110, 73);
        doc.text(entry.debit > 0 ? bdt(entry.debit) : "-", margin + 260, y + 10, { align: "right" });

        doc.setTextColor(157, 51, 51);
        doc.text(entry.credit > 0 ? bdt(entry.credit) : "-", margin + 340, y + 10, { align: "right" });

        doc.setTextColor(20, 45, 35);
        doc.text(bdt(entry.runningBalance), pageWidth - margin - 8, y + 10, { align: "right" });

        doc.setDrawColor(230, 235, 230);
        doc.line(margin, y + 16, pageWidth - margin, y + 16);
        y += 20;
      }

      // Official 3-Column Signature Block
      if (y > 670) {
        doc.addPage();
        y = 50;
      }

      y += 50;
      const colWidth = (contentWidth - 40) / 3;

      // Column 1
      doc.setDrawColor(180, 195, 185);
      doc.line(margin, y, margin + colWidth, y);
      doc.setFontSize(8);
      doc.setTextColor(60, 80, 70);
      doc.text("প্রস্তুতকারক (Prepared By)", margin + colWidth / 2, y + 12, { align: "center" });

      // Column 2
      const col2X = margin + colWidth + 20;
      doc.line(col2X, y, col2X + colWidth, y);
      doc.text("যাচাইকারী (Checked By)", col2X + colWidth / 2, y + 12, { align: "center" });

      // Column 3
      const col3X = margin + (colWidth + 20) * 2;
      doc.line(col3X, y, col3X + colWidth, y);
      doc.text("পার্টির স্বাক্ষর ও সিল", col3X + colWidth / 2, y + 12, { align: "center" });

      doc.save(`Party_Ledger_${activeParty.name.replace(/\s+/g, "_")}.pdf`);
      toast.success("খতিয়ান PDF সফলভাবে তৈরি ও ডাউনলোড হয়েছে!");
    } catch (e) {
      console.error(e);
      toast.error("PDF ডাউনলোড করা যায়নি");
    }
  };

  // WhatsApp Share Handler
  const handleSendWhatsApp = () => {
    if (!activeParty) return;

    const netDue = activeParty.outstandingReceivable - activeParty.outstandingDebt;
    const isReceivable = netDue >= 0;

    let text = `আসসালামু আলাইকুম ${activeParty.name},\n`;
    text += `আহমেদ ফাইন্যান্সিয়াল একাউন্টিং থেকে আপনার খতিয়ানের বর্তমান হিসাব বিবরণী:\n\n`;
    text += `📊 মোট পাওনা: ${bdt(activeParty.outstandingReceivable)}\n`;
    text += `💵 মোট দেনা: ${bdt(activeParty.outstandingDebt)}\n`;
    text += `--------------------------\n`;
    text += `💰 বর্তমান নিট বকেয়া: ${bdt(Math.abs(netDue))} (${isReceivable ? "আপনার নিকট পাওনা" : "আমরা আপনাকে পরিশোধ করবো"})\n\n`;
    text += `অনুগ্রহ করে হিসাবটি যাচাই করে প্রয়োজনীয় ব্যবস্থা গ্রহণ করবেন। ধন্যবাদ।`;

    const cleanPhone = (activeParty.phone || "").replace(/[^0-9]/g, "");
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone.startsWith("88") ? cleanPhone : `88${cleanPhone}`}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, "_blank");
  };

  const openSettlement = (dueId: number, maxAmount: number) => {
    setSettlementDueId(dueId);
    setSettlementAmount(String(maxAmount));
    if (accounts.length > 0) {
      setSettlementAccountId(String(accounts[0].id));
    }
    setSettlementDialogOpen(true);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementDueId || !projectId) return;

    const amt = Number(settlementAmount);
    if (!amt || amt <= 0) {
      toast.error("সঠিক টাকার পরিমাণ দিন");
      return;
    }

    settleMutation.mutate({
      projectId,
      dueId: settlementDueId,
      amount: amt,
      accountId: settlementAccountId ? Number(settlementAccountId) : undefined,
      note: settlementNote.trim() || undefined,
      occurredAt: new Date(),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#113a30] sm:text-3xl flex items-center gap-2.5">
              <Users className="h-7 w-7 text-[#1b7340]" />
              পার্টি ও খতিয়ান খাতা (Party Ledger)
            </h1>
            <p className="mt-1 text-sm text-[#5a786d]">
              সকল দেনাদার, পাওনাদার ও সরবরাহকারীর সম্পূর্ণ লেনদেনের ইতিহাস ও রানিং ব্যালেন্স
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                utils.finance.overview.invalidate();
                utils.finance.invoices.invalidate();
                toast.success("তথ্য রিফ্রেশ হয়েছে");
              }}
              className="border-[#c9ddd0] text-[#113a30] hover:bg-[#ebf4ee]"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              রিফ্রেশ
            </Button>
          </div>
        </div>

        {/* Overview Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-[#dde7df] bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#668076]">
                মোট পার্টি সংখ্যা
              </CardTitle>
              <Users className="h-4 w-4 text-[#1b7340]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#113a30]">{parties.length} জন</div>
              <p className="text-xs text-[#5a786d] mt-1">দেনাদার ও সরবরাহকারী</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde7df] bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#1b7340]">
                মোট পাওনা (Receivables)
              </CardTitle>
              <ArrowDownLeft className="h-4 w-4 text-[#1b7340]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1b7340]">{bdt(totalReceivable)}</div>
              <p className="text-xs text-[#5a786d] mt-1">আমরা গ্রাহকের নিকট পাবো</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde7df] bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#b91c1c]">
                মোট দেনা (Payables)
              </CardTitle>
              <ArrowUpRight className="h-4 w-4 text-[#b91c1c]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#b91c1c]">{bdt(totalDebt)}</div>
              <p className="text-xs text-[#5a786d] mt-1">আমরা সরবরাহকারীকে দেবো</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde7df] bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#113a30]">
                নিট দেনা/পাওনা ব্যালেন্স
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-[#113a30]" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${netBalance >= 0 ? "text-[#1b7340]" : "text-[#b91c1c]"}`}>
                {bdt(Math.abs(netBalance))}
              </div>
              <p className="text-xs text-[#5a786d] mt-1">
                {netBalance >= 0 ? "সর্বমোট নিট পাওনা" : "সর্বমোট নিট দেনা"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main 2-Column Ledger Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Party List & Search */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-[#dde7df] bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-[#113a30]">পার্টি তালিকা</CardTitle>
                <CardDescription className="text-xs text-[#5a786d]">
                  খতিয়ান দেখতে যেকোনো পার্টি নির্বাচন করুন
                </CardDescription>

                {/* Search Bar */}
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8ca89d]" />
                  <Input
                    placeholder="পার্টি খুঁজুন বা মোবাইল নম্বর..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs border-[#c9ddd0] focus-visible:ring-[#1b7340]"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="flex flex-wrap gap-1 mt-2">
                  <Button
                    variant={typeFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter("all")}
                    className={`h-7 text-xs px-2.5 rounded-lg ${
                      typeFilter === "all" ? "bg-[#113a30] text-white" : "border-[#c9ddd0] text-[#113a30]"
                    }`}
                  >
                    সকল ({parties.length})
                  </Button>
                  <Button
                    variant={typeFilter === "receivable" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter("receivable")}
                    className={`h-7 text-xs px-2.5 rounded-lg ${
                      typeFilter === "receivable" ? "bg-[#1b7340] text-white" : "border-[#c9ddd0] text-[#1b7340]"
                    }`}
                  >
                    পাওনাদার
                  </Button>
                  <Button
                    variant={typeFilter === "debt" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter("debt")}
                    className={`h-7 text-xs px-2.5 rounded-lg ${
                      typeFilter === "debt" ? "bg-[#b91c1c] text-white" : "border-[#c9ddd0] text-[#b91c1c]"
                    }`}
                  >
                    দেনাদার
                  </Button>
                  <Button
                    variant={typeFilter === "due_only" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter("due_only")}
                    className={`h-7 text-xs px-2.5 rounded-lg ${
                      typeFilter === "due_only" ? "bg-[#d97706] text-white" : "border-[#c9ddd0] text-[#d97706]"
                    }`}
                  >
                    বকেয়া বাকি
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-2">
                <div className="max-h-[580px] overflow-y-auto space-y-1.5 pr-1">
                  {filteredParties.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#8ca89d]">কোনো পার্টি পাওয়া যায়নি।</div>
                  ) : (
                    filteredParties.map((party) => {
                      const isSelected = activeParty?.name === party.name;
                      const net = party.outstandingReceivable - party.outstandingDebt;

                      return (
                        <div
                          key={party.name}
                          onClick={() => setSelectedPartyName(party.name)}
                          className={`p-3 rounded-xl cursor-pointer transition border ${
                            isSelected
                              ? "bg-[#ebf5ef] border-[#1b7340] shadow-sm ring-1 ring-[#1b7340]"
                              : "bg-white border-[#e6eee8] hover:bg-[#f7faf8]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-sm text-[#113a30] truncate">{party.name}</h4>
                              {party.phone && (
                                <p className="text-xs text-[#5a786d] flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" />
                                  {party.phone}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div
                                className={`text-sm font-bold ${
                                  net > 0 ? "text-[#1b7340]" : net < 0 ? "text-[#b91c1c]" : "text-[#5a786d]"
                                }`}
                              >
                                {bdt(Math.abs(net))}
                              </div>
                              <span
                                className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 ${
                                  net > 0
                                    ? "bg-[#dcfce7] text-[#15803d]"
                                    : net < 0
                                    ? "bg-[#fee2e2] text-[#b91c1c]"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {net > 0 ? "পাওনা বাকি" : net < 0 ? "দেনা বাকি" : "পরিশোধিত"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Detailed Party Ledger & Running Balance */}
          <div className="lg:col-span-8 space-y-4">
            {activeParty ? (
              <Card className="border-[#dde7df] bg-white shadow-sm">
                <CardHeader className="border-b border-[#e6eee8] pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <Building2 className="h-5 w-5 text-[#1b7340]" />
                        <CardTitle className="text-xl font-bold text-[#113a30]">
                          {activeParty.name} — খতিয়ান বিবরণী
                        </CardTitle>
                      </div>
                      <p className="text-xs text-[#5a786d] mt-1 flex items-center gap-3">
                        {activeParty.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {activeParty.phone}
                          </span>
                        )}
                        <span>মোট লেনদেন এন্ট্রি: {ledgerEntries.length} টি</span>
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendWhatsApp}
                        className="border-[#25D366] text-[#128C7E] hover:bg-[#DCF8C6] text-xs h-8.5 font-medium"
                      >
                        <Share2 className="h-3.5 w-3.5 mr-1.5 text-[#25D366]" />
                        হোয়াটসঅ্যাপে পাঠান
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDownloadPdf}
                        className="bg-[#113a30] hover:bg-[#1b5042] text-white text-xs h-8.5 font-medium"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        খতিয়ান PDF
                      </Button>
                    </div>
                  </div>

                  {/* Active Party Financial Pill Summary */}
                  <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-[#edf3ee]">
                    <div className="p-2.5 rounded-lg bg-[#f4f8f5] border border-[#d8e6db]">
                      <span className="text-[11px] text-[#5a786d] font-medium block">মোট পাওনা সৃষ্টি</span>
                      <span className="text-sm font-bold text-[#1b7340]">{bdt(activeParty.totalReceivable)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#fef5f5] border border-[#f5d8d8]">
                      <span className="text-[11px] text-[#5a786d] font-medium block">মোট দেনা সৃষ্টি</span>
                      <span className="text-sm font-bold text-[#b91c1c]">{bdt(activeParty.totalDebt)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#ebf5ef] border border-[#c5e2ce]">
                      <span className="text-[11px] text-[#5a786d] font-medium block">বর্তমান নিট স্থিতি</span>
                      <span
                        className={`text-sm font-bold ${
                          activeParty.outstandingReceivable - activeParty.outstandingDebt >= 0
                            ? "text-[#1b7340]"
                            : "text-[#b91c1c]"
                        }`}
                      >
                        {bdt(Math.abs(activeParty.outstandingReceivable - activeParty.outstandingDebt))} (
                        {activeParty.outstandingReceivable - activeParty.outstandingDebt >= 0 ? "পাওনা" : "দেনা"})
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {/* Ledger Statement Table */}
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#f2f7f4] text-[#113a30] font-semibold border-b border-[#dde7df]">
                          <th className="py-3 px-4">তারিখ</th>
                          <th className="py-3 px-4">বিবরণ ও রেফারেন্স</th>
                          <th className="py-3 px-4 text-right text-[#1b7340]">ডেবিট (+)</th>
                          <th className="py-3 px-4 text-right text-[#b91c1c]">ক্রেডিট (-)</th>
                          <th className="py-3 px-4 text-right">ব্যালেন্স (৳)</th>
                          <th className="py-3 px-4 text-center">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eaf0eb]">
                        {ledgerEntries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-[#8ca89d]">
                              এই পার্টির জন্য কোনো লেনদেন পাওয়া যায়নি।
                            </td>
                          </tr>
                        ) : (
                          ledgerEntries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-[#f9fbf9] transition">
                              <td className="py-3 px-4 whitespace-nowrap text-[#5a786d]">
                                {new Intl.DateTimeFormat("bn-BD", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                }).format(entry.date)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-[#113a30]">{entry.title}</div>
                                {entry.voucherNo && (
                                  <span className="inline-block text-[10px] text-[#5a786d] bg-[#f0f4f1] px-1.5 py-0.2 rounded mt-0.5 mr-2">
                                    ভাউচার: {entry.voucherNo}
                                  </span>
                                )}
                                {entry.note && (
                                  <span className="text-[11px] text-[#7a9489] italic">{entry.note}</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-[#1b7340]">
                                {entry.debit > 0 ? bdt(entry.debit) : "-"}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-[#b91c1c]">
                                {entry.credit > 0 ? bdt(entry.credit) : "-"}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-[#113a30]">
                                {bdt(entry.runningBalance)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {entry.dueId ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openSettlement(entry.dueId!, entry.debit || entry.credit)}
                                    className="h-7 text-[11px] text-[#1b7340] hover:bg-[#dcfce7] px-2"
                                  >
                                    <HandCoins className="h-3.5 w-3.5 mr-1" />
                                    সমন্বয়
                                  </Button>
                                ) : (
                                  <span className="text-[#8ca89d] text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-[#dde7df] bg-white shadow-sm p-12 text-center text-[#8ca89d]">
                বাম পাশের তালিকা থেকে একটি পার্টি নির্বাচন করুন।
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Settle Due Dialog */}
      <Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#113a30]">
              বকেয়া সমন্বয় / পেমেন্ট এন্ট্রি
            </DialogTitle>
            <DialogDescription className="text-xs text-[#5a786d]">
              গ্রাহক বা সরবরাহকারীর সাথে লেনদেনের টাকা গ্রহণ বা পরিশোধ রেকর্ড করুন
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSettleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount" className="text-xs font-semibold text-[#113a30]">
                পরিশোধিত / প্রাপ্ত টাকার পরিমাণ (৳)
              </Label>
              <Input
                id="settle-amount"
                type="number"
                step="0.01"
                required
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
                placeholder="0.00"
                className="border-[#c9ddd0]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-account" className="text-xs font-semibold text-[#113a30]">
                কোন অ্যাকাউন্টে লেনদেন হলো?
              </Label>
              <Select value={settlementAccountId} onValueChange={setSettlementAccountId}>
                <SelectTrigger className="border-[#c9ddd0] text-xs">
                  <SelectValue placeholder="অ্যাকাউন্ট নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)} className="text-xs">
                      {acc.name} ({acc.type === "cash" ? "ক্যাশ" : acc.type === "bank" ? "ব্যাংক" : "মোবাইল ব্যাংকিং"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-note" className="text-xs font-semibold text-[#113a30]">
                মন্তব্য / রসিদ বিবরণ (ঐচ্ছিক)
              </Label>
              <Input
                id="settle-note"
                value={settlementNote}
                onChange={(e) => setSettlementNote(e.target.value)}
                placeholder="যেমন: চেক নং / বিকাশ ট্রানজেকশন আইডি"
                className="border-[#c9ddd0]"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSettlementDialogOpen(false)}
                className="border-[#c9ddd0] text-xs"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={settleMutation.isPending}
                className="bg-[#113a30] hover:bg-[#1b5042] text-white text-xs"
              >
                {settleMutation.isPending ? "সংরক্ষণ হচ্ছে..." : "সমন্বয় সম্পন্ন করুন"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
