import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  Receipt,
  Search,
  Filter,
  MessageCircle,
} from "lucide-react";
import { generateInvoiceReminderMessage, getWhatsAppShareUrl } from "@/lib/dueReminder";

interface InvoiceItemState {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export default function Invoices() {
  const { activeProjectId } = useActiveProject();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form State
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientBinTin, setClientBinTin] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [discountAmount, setDiscountAmount] = useState("0");
  const [notesTerms, setNotesTerms] = useState("");
  const [items, setItems] = useState<InvoiceItemState[]>([
    { description: "", quantity: 1, unitPrice: 0, vatRate: 15 },
  ]);

  const utils = trpc.useUtils();

  const inventoryQuery = trpc.finance.inventoryList.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );
  const inventoryItems = inventoryQuery.data || [];

  const invoicesQuery = trpc.finance.invoices.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );

  const createInvoiceMutation = trpc.finance.createInvoice.useMutation({
    onSuccess: () => {
      toast.success("নতুন চালান সফলভাবে তৈরি হয়েছে");
      setIsCreateOpen(false);
      resetForm();
      utils.finance.invoices.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "চালান তৈরি করা যায়নি");
    },
  });

  const updateStatusMutation = trpc.finance.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      toast.success("চালানের অবস্থা আপডেট করা হয়েছে");
      utils.finance.invoices.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "আপডেট করা যায়নি");
    },
  });

  const deleteInvoiceMutation = trpc.finance.deleteInvoice.useMutation({
    onSuccess: () => {
      toast.success("চালান মুছে ফেলা হয়েছে");
      utils.finance.invoices.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "মুছে ফেলা যায়নি");
    },
  });

  const resetForm = () => {
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setClientAddress("");
    setClientBinTin("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setDiscountAmount("0");
    setNotesTerms("");
    setItems([{ description: "", quantity: 1, unitPrice: 0, vatRate: 15 }]);
  };

  const handleAddItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0, vatRate: 15 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItemState, value: any) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    if (field === "description" && typeof value === "string") {
      const match = inventoryItems.find(
        (i) => i.name.toLowerCase() === value.trim().toLowerCase()
      );
      if (match && Number(match.sellingPrice) > 0) {
        next[index].unitPrice = Number(match.sellingPrice);
      }
    }
    setItems(next);
  };

  // Calculations
  const calculatedSubtotal = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const calculatedVat = items.reduce((sum, item) => {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    return sum + itemTotal * ((Number(item.vatRate) || 0) / 100);
  }, 0);
  const discountNum = Number(discountAmount) || 0;
  const calculatedGrandTotal = Math.max(0, calculatedSubtotal + calculatedVat - discountNum);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId) {
      toast.error("প্রথমে একটি প্রজেক্ট নির্বাচন করুন");
      return;
    }
    if (!clientName.trim()) {
      toast.error("গ্রাহকের নাম প্রদান করুন");
      return;
    }

    createInvoiceMutation.mutate({
      projectId: activeProjectId,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      clientAddress: clientAddress.trim() || undefined,
      clientBinTin: clientBinTin.trim() || undefined,
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      discountAmount: discountNum,
      notesTerms: notesTerms.trim() || undefined,
      items: items.map((item) => ({
        description: item.description.trim() || "Item",
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(item.unitPrice) || 0,
        vatRate: Number(item.vatRate) || 0,
      })),
    });
  };

  const handleDownloadPdf = async (invoiceId: number) => {
    if (!activeProjectId) return;
    try {
      toast.info("পিডিএফ তৈরি হচ্ছে...");
      const invoice = await utils.finance.invoiceById.fetch({
        projectId: activeProjectId,
        id: invoiceId,
      });
      const { generateInvoicePdf } = await import("@/lib/invoicePdf");
      await generateInvoicePdf(invoice);
      toast.success("পিডিএফ ডাউনলোড সম্পন্ন হয়েছে");
    } catch (err) {
      toast.error("পিডিএফ তৈরি করা যায়নি");
    }
  };

  const filteredInvoices = (invoicesQuery.data || []).filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.clientPhone && inv.clientPhone.includes(searchTerm));
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-7 rounded-3xl border border-[#dce7df] shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#166534]">
              <Receipt className="h-4 w-4" />
              <span>SME Business Invoicing</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14382f] mt-1">
              ইনভয়েস ও ক্লায়েন্ট বিলিং
            </h1>
            <p className="text-xs sm:text-sm text-[#5a7a6c] mt-1">
              পেশাদার ব্র্যান্ডেড ইনভয়েস, চালান এবং মানি রিসিট তৈরি ও পরিচালনা করুন।
            </p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 rounded-2xl bg-[#166534] hover:bg-[#14532d] text-white font-semibold flex items-center gap-2 shadow-md">
                <Plus className="h-4.5 w-4.5" />
                নতুন ইনভয়েস তৈরি করুন
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-[#14382f]">
                  নতুন ইনভয়েস / বিল তৈরি
                </DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                {/* Client Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#f8faf8] rounded-2xl border border-[#e2ece5]">
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-[#244b3c]">
                      গ্রাহকের নাম (Client Name) *
                    </Label>
                    <Input
                      required
                      placeholder="যেমন: রহিম এন্টারপ্রাইজ / জনাব কামরুল"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="mt-1 h-10 rounded-xl bg-white border-[#cfe0d5]"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">ফোন নম্বর</Label>
                    <Input
                      placeholder="01700-000000"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="mt-1 h-10 rounded-xl bg-white border-[#cfe0d5]"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">ইমেইল এড্রেস</Label>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="mt-1 h-10 rounded-xl bg-white border-[#cfe0d5]"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">BIN / TIN নম্বর</Label>
                    <Input
                      placeholder="ঐচ্ছিক (যদি থাকে)"
                      value={clientBinTin}
                      onChange={(e) => setClientBinTin(e.target.value)}
                      className="mt-1 h-10 rounded-xl bg-white border-[#cfe0d5]"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">ঠিকানা</Label>
                    <Input
                      placeholder="গ্রাহকের ঠিকানা"
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="mt-1 h-10 rounded-xl bg-white border-[#cfe0d5]"
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">ইস্যু তারিখ</Label>
                    <Input
                      type="date"
                      required
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-[#244b3c]">
                      পরিশোধের শেষ তারিখ (Due Date)
                    </Label>
                    <Input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1 h-10 rounded-xl border-[#cfe0d5]"
                    />
                  </div>
                </div>

                {/* Itemized Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-[#14382f]">পণ্য বা সেবার বিবরণ</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddItem}
                      className="h-7 text-xs rounded-lg border-[#c8ded1] text-[#166534]"
                    >
                      <Plus className="h-3 w-3 mr-1" /> আইটেম যোগ করুন
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-52 overflow-y-auto p-1">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center bg-[#fafdfb] p-2.5 rounded-xl border border-[#e4ede7]"
                      >
                        <div className="col-span-5">
                          <Input
                            placeholder="বিবরণ বা পণ্য বাছাই"
                            list="inventory-datalist"
                            required
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            className="h-8.5 text-xs rounded-lg bg-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="1"
                            placeholder="পরিমাণ"
                            required
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className="h-8.5 text-xs rounded-lg bg-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="0"
                            placeholder="একক দর"
                            required
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                            className="h-8.5 text-xs rounded-lg bg-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="0"
                            placeholder="ভ্যাট %"
                            value={item.vatRate}
                            onChange={(e) => handleItemChange(idx, "vatRate", e.target.value)}
                            className="h-8.5 text-xs rounded-lg bg-white"
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <datalist id="inventory-datalist">
                    {inventoryItems.map((inv) => (
                      <option key={inv.id} value={inv.name}>
                        {inv.name} (স্টক: {inv.currentStock} {inv.unit} · বিক্রয়মূল্য: ৳{inv.sellingPrice})
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Totals Summary */}
                <div className="p-3.5 bg-[#f0f7f2] rounded-2xl border border-[#cbe4d3] space-y-1.5 text-xs text-[#204738]">
                  <div className="flex justify-between">
                    <span>সাবটোটাল:</span>
                    <span className="font-semibold">৳ {calculatedSubtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ভ্যাট / কর:</span>
                    <span className="font-semibold">৳ {calculatedVat.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span>ডিসকাউন্ট (টাকা):</span>
                    <Input
                      type="number"
                      min="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="w-28 h-7 text-xs bg-white rounded-lg text-right"
                    />
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#c0dec9] text-sm font-bold text-[#14382f]">
                    <span>সর্বমোট বিল (Grand Total):</span>
                    <span>৳ {calculatedGrandTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs font-semibold text-[#244b3c]">
                    পেমেন্ট নির্দেশনাবলী / শর্তাবলী
                  </Label>
                  <Textarea
                    placeholder="ব্যাংক অ্যাকাউন্ট বিবরণ বা বিকাশ মার্চেন্ট নম্বর..."
                    rows={2}
                    value={notesTerms}
                    onChange={(e) => setNotesTerms(e.target.value)}
                    className="mt-1 rounded-xl text-xs border-[#cfe0d5]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={createInvoiceMutation.isPending}
                  className="w-full h-11 rounded-xl bg-[#166534] hover:bg-[#14532d] text-white font-semibold text-sm shadow-md"
                >
                  {createInvoiceMutation.isPending ? "তৈরি হচ্ছে..." : "ইনভয়েস সংরক্ষণ করুন"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-[#dde8e0]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8ba699]" />
            <Input
              placeholder="ইনভয়েস নম্বর বা ক্লায়েন্টের নাম দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 rounded-xl border-[#d4e4da] text-xs bg-[#f9fcfa]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 h-10 rounded-xl border-[#d4e4da] text-xs">
              <SelectValue placeholder="স্ট্যাটাস ফিল্টার" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">সকল অবস্থা</SelectItem>
              <SelectItem value="unpaid">বকেয়া (Unpaid)</SelectItem>
              <SelectItem value="paid">পরিশোধিত (Paid)</SelectItem>
              <SelectItem value="partially_paid">আংশিক পরিশোধ</SelectItem>
              <SelectItem value="overdue">মেয়াদোত্তীর্ণ</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice List */}
        <div className="space-y-3">
          {invoicesQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-[#5d7d70] bg-white rounded-3xl border border-[#dce7df]">
              ইনভয়েস লোড হচ্ছে...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-[#dce7df] space-y-3">
              <FileText className="h-12 w-12 text-[#9abfb0] mx-auto" />
              <p className="text-base font-semibold text-[#1f473b]">কোনো ইনভয়েস পাওয়া যায়নি</p>
              <p className="text-xs text-[#6e8a7d]">
                আপনার প্রথম ক্লায়েন্ট বিল তৈরি করতে উপরের বাটনে ক্লিক করুন।
              </p>
            </div>
          ) : (
            filteredInvoices.map((invoice) => {
              const isPaid = invoice.status === "paid";
              const grandTotal = Number(invoice.grandTotal);
              const paidAmount = Number(invoice.paidAmount);
              const dueAmount = Math.max(0, grandTotal - paidAmount);

              return (
                <div
                  key={invoice.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-[#dde7e0] shadow-sm hover:border-[#b8dec5] transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-[#14382f] bg-[#eef7f1] px-2.5 py-0.5 rounded-lg border border-[#cce7d5]">
                        {invoice.invoiceNumber}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase ${
                          isPaid
                            ? "bg-green-100 text-green-800"
                            : invoice.status === "unpaid"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {invoice.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-semibold text-[#204b3d]">
                      <Building2 className="h-4 w-4 text-[#166534]" />
                      <span>{invoice.clientName}</span>
                      {invoice.clientPhone && (
                        <span className="text-xs text-[#698a7c] font-normal">
                          ({invoice.clientPhone})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#668779]">
                      <span>
                        ইস্যু: {new Date(invoice.issueDate).toLocaleDateString("en-GB")}
                      </span>
                      <span>
                        মেয়াদ: {new Date(invoice.dueDate).toLocaleDateString("en-GB")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-right">
                      <div className="text-base font-bold text-[#14382f]">
                        ৳ {grandTotal.toLocaleString()}
                      </div>
                      {dueAmount > 0 ? (
                        <div className="text-xs text-red-600 font-semibold">
                          বকেয়া: ৳ {dueAmount.toLocaleString()}
                        </div>
                      ) : (
                        <div className="text-xs text-green-600 font-semibold flex items-center gap-1 justify-end">
                          <CheckCircle2 className="h-3 w-3" /> সম্পূর্ণ পরিশোধিত
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {dueAmount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const msg = generateInvoiceReminderMessage({
                              invoiceNumber: invoice.invoiceNumber,
                              clientName: invoice.clientName,
                              grandTotal: grandTotal,
                              paidAmount: paidAmount,
                              dueDate: invoice.dueDate,
                            });
                            const url = getWhatsAppShareUrl(invoice.clientPhone, msg);
                            window.open(url, "_blank");
                          }}
                          className="h-9 rounded-xl border-[#25d366]/40 hover:bg-[#25d366]/10 text-[#0d7335] font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                          title="WhatsApp এ বকেয়া পরিশোধের তাগাদা মেসেজ পাঠান"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-[#25d366]" />
                          তাগাদা পাঠান
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadPdf(invoice.id)}
                        className="h-9 rounded-xl border-[#c6dfce] hover:bg-[#eef8f2] text-[#166534] font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF চালান
                      </Button>

                      {!isPaid && (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateStatusMutation.mutate({
                              projectId: activeProjectId!,
                              id: invoice.id,
                              status: "paid",
                              paidAmount: grandTotal,
                            })
                          }
                          className="h-9 rounded-xl bg-[#166534] hover:bg-[#14532d] text-white text-xs font-semibold"
                        >
                          পরিশোধিত করুন
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("আপনি কি নিশ্চিতভাবে এই চালানটি মুছে ফেলতে চান?")) {
                            deleteInvoiceMutation.mutate({
                              projectId: activeProjectId!,
                              id: invoice.id,
                            });
                          }
                        }}
                        className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
