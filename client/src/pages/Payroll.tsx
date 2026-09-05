import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  DollarSign,
  Download,
  Trash2,
  Edit,
  CheckCircle2,
  Clock,
  Search,
  Plus,
} from "lucide-react";

const formatBdt = (val: number | string | null | undefined) =>
  "৳ " + Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payroll() {
  const { activeProjectId } = useActiveProject();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchTerm, setSearchTerm] = useState("");

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [isDisburseModalOpen, setIsDisburseModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);

  const [empName, setEmpName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empDesignation, setEmpDesignation] = useState("");
  const [empDepartment, setEmpDepartment] = useState("");
  const [empBaseSalary, setEmpBaseSalary] = useState("");
  const [empPaymentMethod, setEmpPaymentMethod] = useState<"cash" | "bank" | "mobile">("cash");
  const [empStatus, setEmpStatus] = useState<"active" | "inactive" | "terminated">("active");
  const [empNotes, setEmpNotes] = useState("");

  const [disburseEmpId, setDisburseEmpId] = useState<string>("");
  const [disburseBase, setDisburseBase] = useState<string>("");
  const [disburseBonus, setDisburseBonus] = useState<string>("0");
  const [disburseAllowance, setDisburseAllowance] = useState<string>("0");
  const [disburseAdvanceDed, setDisburseAdvanceDed] = useState<string>("0");
  const [disburseOtherDed, setDisburseOtherDed] = useState<string>("0");
  const [disburseAccountId, setDisburseAccountId] = useState<string>("");
  const [disburseNotes, setDisburseNotes] = useState<string>("");

  const [advEmpId, setAdvEmpId] = useState<string>("");
  const [advAmount, setAdvAmount] = useState<string>("");
  const [advAccountId, setAdvAccountId] = useState<string>("");
  const [advNotes, setAdvNotes] = useState<string>("");

  const utils = trpc.useUtils();

  const employeesQuery = trpc.finance.employeesList.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );
  const employees = employeesQuery.data || [];

  const salaryPaymentsQuery = trpc.finance.salaryPaymentsList.useQuery(
    { projectId: activeProjectId!, monthKey: selectedMonth },
    { enabled: !!activeProjectId }
  );
  const salaryPayments = salaryPaymentsQuery.data || [];

  const advancesQuery = trpc.finance.employeeAdvancesList.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );
  const advances = advancesQuery.data || [];

  const overviewQuery = trpc.finance.overview.useQuery(
    { projectId: activeProjectId! },
    { enabled: !!activeProjectId }
  );
  const accounts = overviewQuery.data?.accounts || [];

  const createEmployeeMutation = trpc.finance.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("নতুন কর্মচারী সফলভাবে যোগ করা হয়েছে");
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
      utils.finance.employeesList.invalidate();
    },
    onError: (err) => toast.error(err.message || "কর্মচারী যোগ করা যায়নি"),
  });

  const updateEmployeeMutation = trpc.finance.updateEmployee.useMutation({
    onSuccess: () => {
      toast.success("কর্মচারীর তথ্য আপডেট করা হয়েছে");
      setIsEmployeeModalOpen(false);
      resetEmployeeForm();
      utils.finance.employeesList.invalidate();
    },
    onError: (err) => toast.error(err.message || "আপডেট করা যায়নি"),
  });

  const deleteEmployeeMutation = trpc.finance.deleteEmployee.useMutation({
    onSuccess: () => {
      toast.success("কর্মচারী মুছে ফেলা হয়েছে");
      utils.finance.employeesList.invalidate();
    },
    onError: (err) => toast.error(err.message || "মুছে ফেলা যায়নি"),
  });

  const disburseSalaryMutation = trpc.finance.disburseSalary.useMutation({
    onSuccess: () => {
      toast.success("মাসিক বেতন সফলভাবে পরিশোধ করা হয়েছে");
      setIsDisburseModalOpen(false);
      resetDisburseForm();
      utils.finance.salaryPaymentsList.invalidate();
      utils.finance.employeeAdvancesList.invalidate();
      utils.finance.overview.invalidate();
    },
    onError: (err) => toast.error(err.message || "বেতন প্রদান সম্পন্ন করা যায়নি"),
  });

  const createAdvanceMutation = trpc.finance.createEmployeeAdvance.useMutation({
    onSuccess: () => {
      toast.success("অগ্রিম বেতন সফলভাবে প্রদান করা হয়েছে");
      setIsAdvanceModalOpen(false);
      resetAdvanceForm();
      utils.finance.employeeAdvancesList.invalidate();
      utils.finance.overview.invalidate();
    },
    onError: (err) => toast.error(err.message || "অগ্রিম প্রদান করা যায়নি"),
  });

  const resetEmployeeForm = () => {
    setEditingEmployeeId(null);
    setEmpName("");
    setEmpPhone("");
    setEmpEmail("");
    setEmpDesignation("");
    setEmpDepartment("");
    setEmpBaseSalary("");
    setEmpPaymentMethod("cash");
    setEmpStatus("active");
    setEmpNotes("");
  };

  const handleEditEmployee = (emp: any) => {
    setEditingEmployeeId(emp.id);
    setEmpName(emp.name);
    setEmpPhone(emp.phone || "");
    setEmpEmail(emp.email || "");
    setEmpDesignation(emp.designation || "");
    setEmpDepartment(emp.department || "");
    setEmpBaseSalary(String(emp.baseSalary));
    setEmpPaymentMethod(emp.paymentMethod || "cash");
    setEmpStatus(emp.status || "active");
    setEmpNotes(emp.notes || "");
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId) return;
    if (editingEmployeeId) {
      updateEmployeeMutation.mutate({
        projectId: activeProjectId,
        id: editingEmployeeId,
        name: empName,
        phone: empPhone || undefined,
        email: empEmail || undefined,
        designation: empDesignation || undefined,
        department: empDepartment || undefined,
        baseSalary: Number(empBaseSalary) || 0,
        paymentMethod: empPaymentMethod,
        status: empStatus,
        notes: empNotes || undefined,
      });
    } else {
      createEmployeeMutation.mutate({
        projectId: activeProjectId,
        name: empName,
        phone: empPhone || undefined,
        email: empEmail || undefined,
        designation: empDesignation || undefined,
        department: empDepartment || undefined,
        baseSalary: Number(empBaseSalary) || 0,
        paymentMethod: empPaymentMethod,
        status: empStatus,
        notes: empNotes || undefined,
      });
    }
  };

  const resetDisburseForm = () => {
    setDisburseEmpId("");
    setDisburseBase("");
    setDisburseBonus("0");
    setDisburseAllowance("0");
    setDisburseAdvanceDed("0");
    setDisburseOtherDed("0");
    setDisburseAccountId("");
    setDisburseNotes("");
  };

  const handleSelectDisburseEmployee = (idStr: string) => {
    setDisburseEmpId(idStr);
    const emp = employees.find((e) => String(e.id) === idStr);
    if (emp) {
      setDisburseBase(String(emp.baseSalary));
      const empAdvances = advances.filter((a) => a.employeeId === emp.id && a.status === "open");
      const totalUnpaidAdvance = empAdvances.reduce((sum, a) => sum + (Number(a.amount) - Number(a.repaidAmount)), 0);
      if (totalUnpaidAdvance > 0) {
        setDisburseAdvanceDed(String(Math.min(totalUnpaidAdvance, Number(emp.baseSalary))));
      } else {
        setDisburseAdvanceDed("0");
      }
    }
  };

  const handleSaveDisburse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !disburseEmpId) return;
    disburseSalaryMutation.mutate({
      projectId: activeProjectId,
      employeeId: Number(disburseEmpId),
      monthKey: selectedMonth,
      baseSalary: Number(disburseBase) || 0,
      bonusAmount: Number(disburseBonus) || 0,
      allowanceAmount: Number(disburseAllowance) || 0,
      advanceDeduction: Number(disburseAdvanceDed) || 0,
      otherDeduction: Number(disburseOtherDed) || 0,
      accountId: disburseAccountId ? Number(disburseAccountId) : null,
      notes: disburseNotes || undefined,
    });
  };

  const resetAdvanceForm = () => {
    setAdvEmpId("");
    setAdvAmount("");
    setAdvAccountId("");
    setAdvNotes("");
  };

  const handleSaveAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !advEmpId || !advAmount) return;
    createAdvanceMutation.mutate({
      projectId: activeProjectId,
      employeeId: Number(advEmpId),
      amount: Number(advAmount),
      accountId: advAccountId ? Number(advAccountId) : null,
      notes: advNotes || undefined,
    });
  };

  const totalEmployeesCount = employees.length;
  const activeEmployeesCount = employees.filter((e) => e.status === "active").length;
  const totalBaseSalaryBudget = employees
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + Number(e.baseSalary || 0), 0);
  const totalPaidThisMonth = salaryPayments.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
  const totalOutstandingAdvances = advances
    .filter((a) => a.status === "open")
    .reduce((sum, a) => sum + (Number(a.amount || 0) - Number(a.repaidAmount || 0)), 0);

  const filteredEmployees = employees.filter((e) => {
    const q = searchTerm.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      (e.designation && e.designation.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.phone && e.phone.includes(q))
    );
  });

  const netDisbursePreview = Math.max(
    0,
    (Number(disburseBase) || 0) +
      (Number(disburseBonus) || 0) +
      (Number(disburseAllowance) || 0) -
      (Number(disburseAdvanceDed) || 0) -
      (Number(disburseOtherDed) || 0)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#14382f] flex items-center gap-2.5">
              <Users className="h-7 w-7 text-[#1b5e20]" />
              কর্মচারী ও বেতন ব্যবস্থাপনা (Payroll)
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              কর্মচারীদের তালিকা, মূল বেতন, উৎসব ভাতা, অগ্রিম কর্তন ও পে-স্লিপ প্রিন্ট
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                resetEmployeeForm();
                setIsEmployeeModalOpen(true);
              }}
              className="bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl text-sm font-semibold h-10 gap-2 shadow-sm"
            >
              <UserPlus className="h-4 w-4" />
              নতুন কর্মচারী যোগ
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white border border-[#d6e5db] shadow-xs flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">মোট কর্মচারী</p>
              <h3 className="text-lg sm:text-xl font-bold text-[#14382f]">
                {activeEmployeesCount} <span className="text-xs font-normal text-gray-400">/ {totalEmployeesCount} জন</span>
              </h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#d6e5db] shadow-xs flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">মাসিক মোট বেতন বাজেট</p>
              <h3 className="text-lg sm:text-xl font-bold text-blue-900">{formatBdt(totalBaseSalaryBudget)}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#d6e5db] shadow-xs flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-green-50 text-green-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">চলতি মাসে পরিশোধিত</p>
              <h3 className="text-lg sm:text-xl font-bold text-[#1b5e20]">{formatBdt(totalPaidThisMonth)}</h3>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#d6e5db] shadow-xs flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">বকেয়া অগ্রিম ঋণ</p>
              <h3 className="text-lg sm:text-xl font-bold text-amber-900">{formatBdt(totalOutstandingAdvances)}</h3>
            </div>
          </div>
        </div>

        <Tabs defaultValue="employees" className="w-full">
          <TabsList className="bg-[#eef4f0] p-1 rounded-2xl h-12 grid grid-cols-3 max-w-lg mb-6">
            <TabsTrigger value="employees" className="rounded-xl text-xs sm:text-sm font-semibold">
              কর্মচারীদের তালিকা
            </TabsTrigger>
            <TabsTrigger value="salaries" className="rounded-xl text-xs sm:text-sm font-semibold">
              মাসিক বেতন শীট
            </TabsTrigger>
            <TabsTrigger value="advances" className="rounded-xl text-xs sm:text-sm font-semibold">
              অগ্রিম বেতন
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="নাম, পদবী বা মোবাইল দিয়ে খুঁজুন..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 rounded-xl border-[#c9dcd0] bg-white text-sm"
                />
              </div>

              <Button
                onClick={() => {
                  resetDisburseForm();
                  setIsDisburseModalOpen(true);
                }}
                className="w-full sm:w-auto bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl text-sm font-semibold h-10 gap-2"
              >
                <DollarSign className="h-4 w-4" />
                বেতন পরিশোধ করুন
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-[#d6e5db] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f5f9f6] text-[#2c4e42] border-b border-[#e2ede6] text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">কর্মচারীর নাম</th>
                      <th className="py-3.5 px-4">পদবী ও বিভাগ</th>
                      <th className="py-3.5 px-4">যোগাযোগ</th>
                      <th className="py-3.5 px-4">মূল বেতন</th>
                      <th className="py-3.5 px-4">পেমেন্ট মেথড</th>
                      <th className="py-3.5 px-4">অবস্থা</th>
                      <th className="py-3.5 px-4 text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf5f0]">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          কোন কর্মচারী পাওয়া যায়নি। নতুন কর্মচারী যোগ করুন।
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-[#fafcfb] transition-colors">
                          <td className="py-3.5 px-4 font-bold text-[#14382f]">
                            {emp.name}
                          </td>
                          <td className="py-3.5 px-4 text-gray-600">
                            <div>{emp.designation || "-"}</div>
                            <div className="text-xs text-gray-400">{emp.department || ""}</div>
                          </td>
                          <td className="py-3.5 px-4 text-gray-600 text-xs">
                            <div>{emp.phone || "-"}</div>
                            <div className="text-gray-400">{emp.email || ""}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[#1b5e20]">
                            {formatBdt(emp.baseSalary)}
                          </td>
                          <td className="py-3.5 px-4 capitalize text-gray-600 text-xs">
                            {emp.paymentMethod}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={"px-2.5 py-0.5 rounded-full text-xs font-semibold " +
                                (emp.status === "active"
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : "bg-gray-100 text-gray-600")}
                            >
                              {emp.status === "active" ? "সক্রিয়" : emp.status === "inactive" ? "নিষ্ক্রিয়" : "বহিষ্কৃত"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditEmployee(emp)}
                              className="h-8 w-8 p-0 text-gray-600 hover:text-[#1b5e20]"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("আপনি কি নিশ্চিত " + emp.name + "-কে মুছে ফেলতে চান?")) {
                                  deleteEmployeeMutation.mutate({ projectId: activeProjectId!, id: emp.id });
                                }
                              }}
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="salaries" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Label className="text-xs font-semibold text-gray-600">বেতন মাস:</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-10 w-44 rounded-xl border-[#c9dcd0] bg-white text-sm font-semibold"
                />
              </div>

              <Button
                onClick={() => {
                  resetDisburseForm();
                  setIsDisburseModalOpen(true);
                }}
                className="w-full sm:w-auto bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl text-sm font-semibold h-10 gap-2"
              >
                <DollarSign className="h-4 w-4" />
                বেতন পরিশোধ করুন
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-[#d6e5db] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f5f9f6] text-[#2c4e42] border-b border-[#e2ede6] text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">ভাউচার</th>
                      <th className="py-3.5 px-4">কর্মচারী</th>
                      <th className="py-3.5 px-4">মূল বেতন</th>
                      <th className="py-3.5 px-4">বোনাস / ভাতা</th>
                      <th className="py-3.5 px-4">অগ্রিম কর্তন</th>
                      <th className="py-3.5 px-4">নিট প্রদেয়</th>
                      <th className="py-3.5 px-4">পরিশোধিত</th>
                      <th className="py-3.5 px-4">অবস্থা</th>
                      <th className="py-3.5 px-4 text-right">পে-স্লিপ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf5f0]">
                    {salaryPayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-gray-400">
                          {selectedMonth} মাসের কোনো বেতন রেকর্ড নেই।
                        </td>
                      </tr>
                    ) : (
                      salaryPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-[#fafcfb] transition-colors">
                          <td className="py-3.5 px-4 font-mono text-xs font-bold text-gray-700">
                            {p.voucherNo || "-"}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[#14382f]">
                            <div>{p.employeeName}</div>
                            <div className="text-xs text-gray-400">{p.employeeDesignation || ""}</div>
                          </td>
                          <td className="py-3.5 px-4 text-gray-700">{formatBdt(p.baseSalary)}</td>
                          <td className="py-3.5 px-4 text-green-700 text-xs">
                            + {formatBdt(Number(p.bonusAmount) + Number(p.allowanceAmount))}
                          </td>
                          <td className="py-3.5 px-4 text-red-600 text-xs">
                            - {formatBdt(Number(p.advanceDeduction) + Number(p.otherDeduction))}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[#14382f]">{formatBdt(p.netPayable)}</td>
                          <td className="py-3.5 px-4 font-bold text-[#1b5e20]">{formatBdt(p.paidAmount)}</td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                              {p.status === "paid" ? "পরিশোধিত" : "আংশিক"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  toast.info("পে-স্লিপ তৈরি হচ্ছে...");
                                  const { generatePayslipPdf } = await import("@/lib/payslipPdf");
                                  await generatePayslipPdf({
                                    voucherNo: p.voucherNo,
                                    monthKey: p.monthKey,
                                    paymentDate: p.paymentDate,
                                    employeeName: p.employeeName,
                                    employeeDesignation: p.employeeDesignation,
                                    employeeDepartment: p.employeeDepartment,
                                    employeePhone: p.employeePhone,
                                    baseSalary: p.baseSalary,
                                    bonusAmount: p.bonusAmount,
                                    allowanceAmount: p.allowanceAmount,
                                    advanceDeduction: p.advanceDeduction,
                                    otherDeduction: p.otherDeduction,
                                    netPayable: p.netPayable,
                                    paidAmount: p.paidAmount,
                                    status: p.status,
                                    notes: p.notes,
                                  });
                                  toast.success("পে-স্লিপ ডাউনলোড সম্পন্ন হয়েছে");
                                } catch (err) {
                                  toast.error("পে-স্লিপ তৈরি করা যায়নি");
                                }
                              }}
                              className="h-8 rounded-xl border-[#c9dcd0] text-[#1b5e20] hover:bg-[#eaf4ed] text-xs font-semibold gap-1.5"
                            >
                              <Download className="h-3.5 w-3.5" />
                              পে-স্লিপ
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="advances" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">কর্মচারীদের প্রদত্ত অগ্রিম বেতন ও কিস্তি আদায়</p>
              <Button
                onClick={() => {
                  resetAdvanceForm();
                  setIsAdvanceModalOpen(true);
                }}
                className="bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl text-sm font-semibold h-10 gap-2"
              >
                <Plus className="h-4 w-4" />
                অগ্রিম বেতন দিন
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-[#d6e5db] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f5f9f6] text-[#2c4e42] border-b border-[#e2ede6] text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">ভাউচার</th>
                      <th className="py-3.5 px-4">কর্মচারী</th>
                      <th className="py-3.5 px-4">তারিখ</th>
                      <th className="py-3.5 px-4">প্রদত্ত অগ্রিম</th>
                      <th className="py-3.5 px-4">পরিশোধিত/কর্তন</th>
                      <th className="py-3.5 px-4">বকেয়া</th>
                      <th className="py-3.5 px-4">অবস্থা</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf5f0]">
                    {advances.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          কোন অগ্রিম বেতনের রেকর্ড নেই।
                        </td>
                      </tr>
                    ) : (
                      advances.map((a) => {
                        const remaining = Number(a.amount) - Number(a.repaidAmount);
                        return (
                          <tr key={a.id} className="hover:bg-[#fafcfb] transition-colors">
                            <td className="py-3.5 px-4 font-mono text-xs font-bold text-gray-700">
                              {a.voucherNo || "-"}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-[#14382f]">
                              {a.employeeName}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-gray-500">
                              {new Date(a.disbursedDate).toLocaleDateString("en-GB")}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-gray-800">{formatBdt(a.amount)}</td>
                            <td className="py-3.5 px-4 font-semibold text-green-700">{formatBdt(a.repaidAmount)}</td>
                            <td className="py-3.5 px-4 font-bold text-amber-900">{formatBdt(remaining)}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={"px-2.5 py-0.5 rounded-full text-xs font-semibold " +
                                  (a.status === "settled"
                                    ? "bg-green-50 text-green-700 border border-green-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200")}
                              >
                                {a.status === "settled" ? "সম্পূর্ণ পরিশোধিত" : "চলমান (বকেয়া)"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
          <DialogContent className="max-w-md bg-white rounded-3xl p-6 sm:p-7">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#14382f]">
                {editingEmployeeId ? "কর্মচারীর তথ্য পরিবর্তন" : "নতুন কর্মচারী যোগ করুন"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveEmployee} className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">নাম *</Label>
                <Input
                  required
                  placeholder="যেমন: মোঃ কামরুল হাসান"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">পদবী</Label>
                  <Input
                    placeholder="হিসাবরক্ষক / ম্যানেজার"
                    value={empDesignation}
                    onChange={(e) => setEmpDesignation(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">বিভাগ</Label>
                  <Input
                    placeholder="অ্যাকাউন্টিং / সেলস"
                    value={empDepartment}
                    onChange={(e) => setEmpDepartment(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">মোবাইল</Label>
                  <Input
                    placeholder="01700-000000"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">মাসিক মূল বেতন (৳) *</Label>
                  <Input
                    type="number"
                    required
                    min="0"
                    placeholder="25000"
                    value={empBaseSalary}
                    onChange={(e) => setEmpBaseSalary(e.target.value)}
                    className="rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">পেমেন্ট মেথড</Label>
                  <Select
                    value={empPaymentMethod}
                    onValueChange={(v: "cash" | "bank" | "mobile") => setEmpPaymentMethod(v)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">নগদ (Cash)</SelectItem>
                      <SelectItem value="bank">ব্যাংক (Bank)</SelectItem>
                      <SelectItem value="mobile">মোবাইল ব্যাংকিং (bKash/Nagad)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">কাজের অবস্থা</Label>
                  <Select
                    value={empStatus}
                    onValueChange={(v: "active" | "inactive" | "terminated") => setEmpStatus(v)}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">সক্রিয় (Active)</SelectItem>
                      <SelectItem value="inactive">নিষ্ক্রিয় (Inactive)</SelectItem>
                      <SelectItem value="terminated">বহিষ্কৃত (Terminated)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">মন্তব্য / নোট</Label>
                <Textarea
                  placeholder="অন্যান্য তথ্য..."
                  value={empNotes}
                  onChange={(e) => setEmpNotes(e.target.value)}
                  className="rounded-xl"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="flex-1 rounded-xl"
                >
                  বাতিল
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl font-semibold"
                >
                  সংরক্ষণ করুন
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDisburseModalOpen} onOpenChange={setIsDisburseModalOpen}>
          <DialogContent className="max-w-lg bg-white rounded-3xl p-6 sm:p-7">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#14382f]">
                মাসিক বেতন পরিশোধ ও পে-স্লিপ জেনারেট
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveDisburse} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">কর্মচারী নির্বাচন করুন *</Label>
                  <Select value={disburseEmpId} onValueChange={handleSelectDisburseEmployee}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="কর্মচারী বাছাই করুন" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={String(emp.id)}>
                          {emp.name} ({emp.designation || "Staff"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">বেতন মাস *</Label>
                  <Input
                    type="month"
                    required
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="rounded-xl font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">মূল বেতন (৳) *</Label>
                  <Input
                    type="number"
                    required
                    min="0"
                    value={disburseBase}
                    onChange={(e) => setDisburseBase(e.target.value)}
                    className="rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">বোনাস (৳)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={disburseBonus}
                    onChange={(e) => setDisburseBonus(e.target.value)}
                    className="rounded-xl text-green-700 font-semibold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">ভাতা (৳)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={disburseAllowance}
                    onChange={(e) => setDisburseAllowance(e.target.value)}
                    className="rounded-xl text-green-700 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">অগ্রিম কর্তন (৳)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={disburseAdvanceDed}
                    onChange={(e) => setDisburseAdvanceDed(e.target.value)}
                    className="rounded-xl text-red-600 font-semibold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-700 mb-1 block">অন্যান্য কর্তন / জরিমানা (৳)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={disburseOtherDed}
                    onChange={(e) => setDisburseOtherDed(e.target.value)}
                    className="rounded-xl text-red-600 font-semibold"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">পরিশোধের অ্যাকাউন্ট</Label>
                <Select value={disburseAccountId} onValueChange={setDisburseAccountId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="ক্যাশ বা ব্যাংক অ্যাকাউন্ট নির্বাচন করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc: { id: number; name: string; currentBalance: string | number }) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.name} (ব্যালেন্স: {formatBdt(acc.currentBalance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-800 font-medium">নিট প্রদেয় বেতন (Net Payable):</p>
                  <p className="text-lg font-bold text-[#14532d]">{formatBdt(netDisbursePreview)}</p>
                </div>
                <span className="text-xs font-semibold text-green-700 bg-white px-2.5 py-1 rounded-lg border border-green-200">
                  অটো খরচ রেকর্ড হবে
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDisburseModalOpen(false)}
                  className="flex-1 rounded-xl"
                >
                  বাতিল
                </Button>
                <Button
                  type="submit"
                  disabled={!disburseEmpId}
                  className="flex-1 bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl font-semibold"
                >
                  বেতন প্রদান নিশ্চিত করুন
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isAdvanceModalOpen} onOpenChange={setIsAdvanceModalOpen}>
          <DialogContent className="max-w-md bg-white rounded-3xl p-6 sm:p-7">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#14382f]">
                কর্মচারীকে অগ্রিম বেতন / ঋণ প্রদান
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSaveAdvance} className="space-y-4 pt-2">
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">কর্মচারী নির্বাচন করুন *</Label>
                <Select value={advEmpId} onValueChange={setAdvEmpId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="কর্মচারী বাছাই করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.name} ({emp.designation || "Staff"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">অগ্রিমের পরিমাণ (৳) *</Label>
                <Input
                  type="number"
                  required
                  min="1"
                  placeholder="5000"
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value)}
                  className="rounded-xl font-semibold text-lg text-[#14382f]"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">প্রদানের অ্যাকাউন্ট</Label>
                <Select value={advAccountId} onValueChange={setAdvAccountId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="অ্যাকাউন্ট নির্বাচন করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc: { id: number; name: string; currentBalance: string | number }) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.name} (ব্যালেন্স: {formatBdt(acc.currentBalance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1 block">মন্তব্য / শর্ত</Label>
                <Textarea
                  placeholder="যেমন: আগামী মাসের বেতন থেকে এককালীন বা কিস্তিতে কর্তন হবে..."
                  value={advNotes}
                  onChange={(e) => setAdvNotes(e.target.value)}
                  className="rounded-xl"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="flex-1 rounded-xl"
                >
                  বাতিল
                </Button>
                <Button
                  type="submit"
                  disabled={!advEmpId || !advAmount}
                  className="flex-1 bg-[#1b5e20] hover:bg-[#144718] text-white rounded-xl font-semibold"
                >
                  অগ্রিম প্রদান করুন
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
