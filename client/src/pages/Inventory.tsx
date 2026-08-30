import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Download,
  Pencil,
  Trash2,
  TrendingUp,
  SlidersHorizontal,
  CheckCircle2,
} from "lucide-react";

export default function Inventory() {
  const { activeProjectId } = useActiveProject();
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<"in" | "out">("in");
  const [adjustReason, setAdjustReason] = useState("");

  // Form State
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("পিস");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [sellingPrice, setSellingPrice] = useState("0");
  const [currentStock, setCurrentStock] = useState("0");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();

  const inventoryQuery = trpc.finance.inventoryList.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );

  const createMutation = trpc.finance.createInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("নতুন পণ্য ইনভেন্টরিতে যুক্ত হয়েছে");
      setIsAddOpen(false);
      resetForm();
      utils.finance.inventoryList.invalidate();
    },
    onError: (err) => toast.error(err.message || "পণ্য যুক্ত করা যায়নি"),
  });

  const updateMutation = trpc.finance.updateInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("পণ্য তথ্য আপডেট সম্পন্ন হয়েছে");
      setEditingItem(null);
      resetForm();
      utils.finance.inventoryList.invalidate();
    },
    onError: (err) => toast.error(err.message || "আপডেট করা যায়নি"),
  });

  const adjustStockMutation = trpc.finance.adjustInventoryStock.useMutation({
    onSuccess: () => {
      toast.success("স্টক সফলভাবে সমন্বয় করা হয়েছে");
      setAdjustItem(null);
      setAdjustQty("");
      setAdjustReason("");
      utils.finance.inventoryList.invalidate();
    },
    onError: (err) => toast.error(err.message || "স্টক সমন্বয় করা যায়নি"),
  });

  const deleteMutation = trpc.finance.deleteInventoryItem.useMutation({
    onSuccess: () => {
      toast.success("পণ্য মুছে ফেলা হয়েছে");
      utils.finance.inventoryList.invalidate();
    },
    onError: (err) => toast.error(err.message || "পণ্য মোছা যায়নি"),
  });

  const resetForm = () => {
    setName("");
    setSku("");
    setCategory("");
    setUnit("পিস");
    setPurchasePrice("0");
    setSellingPrice("0");
    setCurrentStock("0");
    setLowStockThreshold("5");
    setNotes("");
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setName(item.name);
    setSku(item.sku || "");
    setCategory(item.category || "");
    setUnit(item.unit || "পিস");
    setPurchasePrice(String(item.purchasePrice));
    setSellingPrice(String(item.sellingPrice));
    setCurrentStock(String(item.currentStock));
    setLowStockThreshold(String(item.lowStockThreshold));
    setNotes(item.notes || "");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !name.trim()) return;

    if (editingItem) {
      updateMutation.mutate({
        projectId: activeProjectId,
        id: editingItem.id,
        name,
        sku: sku || undefined,
        category: category || undefined,
        unit,
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        currentStock: Number(currentStock) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 5,
        notes: notes || undefined,
      });
    } else {
      createMutation.mutate({
        projectId: activeProjectId,
        name,
        sku: sku || undefined,
        category: category || undefined,
        unit,
        purchasePrice: Number(purchasePrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        currentStock: Number(currentStock) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 5,
        notes: notes || undefined,
      });
    }
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !adjustItem || !adjustQty) return;

    const qty = Number(adjustQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("সঠিক পরিমাণ লিখুন");
      return;
    }

    const delta = adjustType === "in" ? qty : -qty;
    adjustStockMutation.mutate({
      projectId: activeProjectId,
      id: adjustItem.id,
      quantityChange: delta,
      reason: adjustReason.trim() || (adjustType === "in" ? "স্টক বৃদ্ধি (ক্রয়/ফেরত)" : "স্টক হ্রাস (বিক্রয়/নষ্ট)"),
    });
  };

  const items = inventoryQuery.data || [];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));

    const isLow = Number(item.currentStock) <= Number(item.lowStockThreshold);
    if (onlyLowStock) return matchesSearch && isLow;
    return matchesSearch;
  });

  // Analytics
  const totalStockValue = items.reduce(
    (sum, item) => sum + (Number(item.currentStock) * Number(item.purchasePrice) || 0),
    0
  );
  const totalPotentialRevenue = items.reduce(
    (sum, item) => sum + (Number(item.currentStock) * Number(item.sellingPrice) || 0),
    0
  );
  const lowStockCount = items.filter(
    (item) => Number(item.currentStock) <= Number(item.lowStockThreshold)
  ).length;

  const handleExportCsv = () => {
    if (!items.length) {
      toast.error("এক্সপোর্ট করার মতো কোনো ডেটা নেই");
      return;
    }
    const headers = ["ID,নাম,SKU,ক্যাটাগরি,একক,বর্তমান স্টক,ক্রয়মূল্য (৳),বিক্রয়মূল্য (৳),মোট স্টক মূল্য (৳)"];
    const rows = items.map(i => {
      const stock = Number(i.currentStock) || 0;
      const buy = Number(i.purchasePrice) || 0;
      const sell = Number(i.sellingPrice) || 0;
      return `"${i.id}","${i.name}","${i.sku || ''}","${i.category || ''}","${i.unit}","${stock}","${buy}","${sell}","${(stock * buy).toFixed(2)}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("ইনভেন্টরি CSV ডাউনলোড সম্পন্ন হয়েছে");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-7 rounded-3xl border border-[#dce7df] shadow-sm">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#166534]">
              <Boxes className="h-4 w-4" />
              <span>Inventory & Stock Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#14382f] mt-1">
              পণ্য ও স্টক ইনভেন্টরি
            </h1>
            <p className="text-xs sm:text-sm text-[#5a7a6c] mt-1">
              পণ্য সামগ্রী, ক্রয়-বিক্রয় মূল্য, স্টক সমন্বয় ও স্টক সতর্কবার্তা ব্যবস্থাপনা।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleExportCsv}
              className="h-11 rounded-2xl border-[#cfe0d5] text-[#166534] hover:bg-[#f0f7f2] font-semibold flex items-center gap-2 shadow-sm text-xs sm:text-sm"
            >
              <Download className="h-4 w-4" />
              CSV ডাউনলোড
            </Button>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    resetForm();
                    setEditingItem(null);
                  }}
                  className="h-11 rounded-2xl bg-[#166534] hover:bg-[#114f29] text-white font-semibold flex items-center gap-2 shadow-sm text-xs sm:text-sm"
                >
                  <Plus className="h-4 w-4" />
                  নতুন পণ্য যোগ করুন
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold text-[#14382f]">
                    নতুন পণ্য যোগ করুন
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSave} className="space-y-4 pt-2">
                  <div>
                    <Label className="text-xs font-semibold text-[#14382f]">পণ্যের নাম *</Label>
                    <Input
                      required
                      placeholder="যেমন: সিমেন্ট / চিনি / প্রিন্টার পেপার"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">SKU / কোড</Label>
                      <Input
                        placeholder="যেমন: PRD-001"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        className="mt-1 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">ক্যাটাগরি</Label>
                      <Input
                        placeholder="যেমন: নির্মাণ সামগ্রী"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="mt-1 rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">পরিমাপের একক</Label>
                      <Input
                        placeholder="পিস / কেজি / বস্তা / লিটার"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="mt-1 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">বর্তমান স্টক</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={currentStock}
                        onChange={(e) => setCurrentStock(e.target.value)}
                        className="mt-1 rounded-xl text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">ক্রয়মূল্য (৳)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value)}
                        className="mt-1 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-[#14382f]">বিক্রয়মূল্য (৳)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(e.target.value)}
                        className="mt-1 rounded-xl text-xs font-semibold text-green-700"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#14382f]">কম স্টক সতর্কতা সীমা (Low Stock Alert)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="mt-1 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-[#14382f]">মন্তব্য / বিবরণ</Label>
                    <Textarea
                      placeholder="পণ্য সম্পর্কে অতিরিক্ত বিবরণ..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 rounded-xl text-xs h-16 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="w-full h-11 rounded-xl bg-[#166534] hover:bg-[#114f29] text-white font-semibold"
                  >
                    {createMutation.isPending ? "সংরক্ষণ হচ্ছে..." : "পণ্য সংরক্ষণ করুন"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-[#dce7df] shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-[#e6f4ea] text-[#166534] grid place-items-center">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-[#628475] font-medium">মোট পণ্য আইটেম</p>
              <p className="text-xl font-bold text-[#14382f] mt-0.5">{items.length} টি</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#dce7df] shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-[#dff3e7] text-[#166534] grid place-items-center">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-[#628475] font-medium">মোট স্টক মূল্যায়ন (ক্রয়মূল্যে)</p>
              <p className="text-xl font-bold text-[#166534] mt-0.5">
                ৳ {totalStockValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-[#dce7df] shadow-sm flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl grid place-items-center ${lowStockCount > 0 ? "bg-amber-100 text-amber-700" : "bg-[#e6f4ea] text-[#166534]"}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-[#628475] font-medium">কম স্টক সতর্কতা</p>
              <p className={`text-xl font-bold mt-0.5 ${lowStockCount > 0 ? "text-amber-700" : "text-[#14382f]"}`}>
                {lowStockCount} টি আইটেম
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#dce7df] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8aa396]" />
            <Input
              placeholder="পণ্য বা SKU খুঁজুন..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 rounded-xl text-xs bg-[#f8faf8]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant={onlyLowStock ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyLowStock(!onlyLowStock)}
              className={`h-9 rounded-xl text-xs font-semibold ${
                onlyLowStock ? "bg-amber-600 text-white hover:bg-amber-700" : "border-[#cce0d2] text-[#2c5344]"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              শুধু কম স্টক ({lowStockCount})
            </Button>
          </div>
        </div>

        {/* Inventory Items List */}
        <div className="bg-white rounded-2xl border border-[#dce7df] shadow-sm overflow-hidden">
          {inventoryQuery.isLoading ? (
            <div className="p-12 text-center text-sm text-[#668577]">লোড হচ্ছে...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-sm text-[#668577]">
              {searchTerm || onlyLowStock ? "কোনো পণ্য পাওয়া যায়নি।" : "ইনভেন্টরিতে এখনও কোনো পণ্য যুক্ত করা হয়নি।"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#f5f8f5] text-[#214c3e] font-semibold border-b border-[#dde8e0]">
                  <tr>
                    <th className="py-3.5 px-4">পণ্যের নাম ও SKU</th>
                    <th className="py-3.5 px-4">ক্যাটাগরি</th>
                    <th className="py-3.5 px-4 text-right">বর্তমান স্টক</th>
                    <th className="py-3.5 px-4 text-right">ক্রয়মূল্য</th>
                    <th className="py-3.5 px-4 text-right">বিক্রয়মূল্য</th>
                    <th className="py-3.5 px-4 text-right">স্টক মূল্য</th>
                    <th className="py-3.5 px-4 text-center">স্ট্যাটাস</th>
                    <th className="py-3.5 px-4 text-right">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf3ee]">
                  {filteredItems.map((item) => {
                    const stock = Number(item.currentStock) || 0;
                    const threshold = Number(item.lowStockThreshold) || 5;
                    const buy = Number(item.purchasePrice) || 0;
                    const sell = Number(item.sellingPrice) || 0;
                    const totalVal = stock * buy;
                    const isOutOfStock = stock <= 0;
                    const isLowStock = !isOutOfStock && stock <= threshold;

                    return (
                      <tr key={item.id} className="hover:bg-[#f9fbf9] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#14382f]">{item.name}</div>
                          {item.sku && <div className="text-[11px] text-[#6f8c7f]">SKU: {item.sku}</div>}
                        </td>
                        <td className="py-3.5 px-4 text-[#4f7062]">
                          {item.category || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-[#14382f]">
                          {stock.toLocaleString()} {item.unit}
                        </td>
                        <td className="py-3.5 px-4 text-right text-[#577769]">
                          ৳ {buy.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-green-700">
                          ৳ {sell.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-semibold text-[#14382f]">
                          ৳ {totalVal.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                              স্টক শেষ
                            </span>
                          ) : isLowStock ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                              কম স্টক
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              পর্যাপ্ত
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAdjustItem(item);
                                setAdjustQty("");
                                setAdjustType("in");
                                setAdjustReason("");
                              }}
                              className="h-8 rounded-lg border-[#cbe2d3] text-[#166534] hover:bg-[#ebf6ee] text-xs font-semibold px-2.5"
                              title="স্টক সমন্বয় করুন"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                              সমন্বয়
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditModal(item)}
                              className="h-8 w-8 p-0 rounded-lg text-[#3b6653] hover:bg-[#eef6f1]"
                              title="সম্পাদনা করুন"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`আপনি কি নিশ্চিতভাবে "${item.name}" মুছে ফেলতে চান?`)) {
                                  deleteMutation.mutate({
                                    projectId: activeProjectId!,
                                    id: item.id,
                                  });
                                }
                              }}
                              className="h-8 w-8 p-0 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#14382f]">
                পণ্য সম্পাদনা করুন
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-semibold text-[#14382f]">পণ্যের নাম *</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">SKU / কোড</Label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">ক্যাটাগরি</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">পরিমাপের একক</Label>
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">বর্তমান স্টক</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    className="mt-1 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">ক্রয়মূল্য (৳)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="mt-1 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-[#14382f]">বিক্রয়মূল্য (৳)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="mt-1 rounded-xl text-xs font-semibold text-green-700"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#14382f]">কম স্টক সতর্কতা সীমা</Label>
                <Input
                  type="number"
                  step="1"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  className="mt-1 rounded-xl text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#14382f]">মন্তব্য</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 rounded-xl text-xs h-16 resize-none"
                />
              </div>

              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="w-full h-11 rounded-xl bg-[#166534] hover:bg-[#114f29] text-white font-semibold"
              >
                {updateMutation.isPending ? "সংরক্ষণ হচ্ছে..." : "আপডেট সংরক্ষণ করুন"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Modal */}
        <Dialog open={!!adjustItem} onOpenChange={(open) => !open && setAdjustItem(null)}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#14382f]">
                স্টক সমন্বয় ({adjustItem?.name})
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdjustSubmit} className="space-y-4 pt-2">
              <div className="p-3 rounded-xl bg-[#f4faf5] border border-[#d6ecdc] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#59786a]">বর্তমান স্টক:</span>
                  <span className="font-bold text-[#14382f]">{adjustItem?.currentStock} {adjustItem?.unit}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => setAdjustType("in")}
                  className={`h-10 rounded-xl text-xs font-semibold ${
                    adjustType === "in" ? "bg-[#166534] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4 mr-1 text-emerald-400" />
                  স্টক বাড়ান (Stock In)
                </Button>
                <Button
                  type="button"
                  onClick={() => setAdjustType("out")}
                  className={`h-10 rounded-xl text-xs font-semibold ${
                    adjustType === "out" ? "bg-red-700 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <ArrowDownRight className="h-4 w-4 mr-1 text-red-300" />
                  স্টক কমান (Stock Out)
                </Button>
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#14382f]">সমন্বয়ের পরিমাণ ({adjustItem?.unit}) *</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  placeholder="যেমন: ১০"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="mt-1 rounded-xl text-sm font-bold"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#14382f]">কারণ / ভাউচার রেফারেন্স</Label>
                <Input
                  placeholder="যেমন: নতুন চালান ক্রয় / ফেরত / ড্যামেজ"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 rounded-xl text-xs"
                />
              </div>

              <Button
                type="submit"
                disabled={adjustStockMutation.isPending}
                className="w-full h-11 rounded-xl bg-[#166534] hover:bg-[#114f29] text-white font-semibold"
              >
                {adjustStockMutation.isPending ? "সমন্বয় হচ্ছে..." : "স্টক সমন্বয় নিশ্চিত করুন"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
