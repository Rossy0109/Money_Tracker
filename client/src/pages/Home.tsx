import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { persistPreferredProjectId, preferredProjectId } from "@/lib/activeProject";
import { canLoadAdminData } from "@/lib/adminAccess";
import { buildAdminAuditFilterInput } from "@/lib/auditFilters";
import { downloadAuditCsv, downloadAuditPdf } from "@/lib/auditLogExports";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Banknote,
  BellRing,
  Building2,
  CalendarClock,
  Check,
  Download,
  Landmark,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DateRange } from "react-day-picker";

const bdt = (value: number | string) =>
  `৳ ${new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthText = (key: string) =>
  new Intl.DateTimeFormat("bn-BD", { month: "short" }).format(
    new Date(`${key}-01T12:00:00Z`)
  );
const dateText = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const auditActionText = (action: string) =>
  action === "create"
    ? "তৈরি"
    : action === "update"
      ? "আপডেট"
      : action === "delete"
        ? "মুছে ফেলা"
        : action;

type TransactionDraft = {
  amount: string;
  categoryId: string;
  accountId: string;
  paymentMethod: string;
  occurredAt: string;
  note: string;
};
type DueDraft = {
  type: "debt" | "receivable";
  counterparty: string;
  amount: string;
  note: string;
  openedAt: string;
};
type SettlementDraft = {
  dueId: number;
  accountId: string;
  amount: string;
  note: string;
  occurredAt: string;
};
const blankTransaction = (): TransactionDraft => ({
  amount: "",
  categoryId: "",
  accountId: "none",
  paymentMethod: "Cash",
  occurredAt: today(),
  note: "",
});
const blankDue = (): DueDraft => ({
  type: "debt",
  counterparty: "",
  amount: "",
  note: "",
  openedAt: today(),
});

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );
  const voucherSettings = trpc.finance.voucherSettings.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );
  const exportData = trpc.finance.exportData.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    "expense"
  );
  const [transactionFilter, setTransactionFilter] = useState<
    "all" | "income" | "expense"
  >("all");
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    number | null
  >(null);
  const [transactionForm, setTransactionForm] =
    useState<TransactionDraft>(blankTransaction());
  const [dueOpen, setDueOpen] = useState(false);
  const [dueForm, setDueForm] = useState<DueDraft>(blankDue());
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementForm, setSettlementForm] = useState<SettlementDraft>({
    dueId: 0,
    accountId: "none",
    amount: "",
    note: "",
    occurredAt: today(),
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "cash" as "cash" | "bank" | "mobile",
    openingBalance: "0",
  });
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ categoryId: "", amount: "" });
  const [billOpen, setBillOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [billForm, setBillForm] = useState({
    title: "",
    amount: "",
    dueAt: today(),
    isPaid: false,
  });
  const [voucherSettingsOpen, setVoucherSettingsOpen] = useState(false);
  const [voucherSettingsForm, setVoucherSettingsForm] = useState({
    prefix: "V",
    startNumber: "1",
    endNumber: "999999",
  });
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [auditDateRange, setAuditDateRange] = useState<DateRange | undefined>(
    undefined
  );
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActorUserId, setAuditActorUserId] = useState("all");
  const [auditActorRole, setAuditActorRole] = useState<
    "all" | "admin" | "user"
  >("all");
  const [auditPage, setAuditPage] = useState(1);
  const [isAuditExporting, setIsAuditExporting] = useState(false);
  const deferredAuditSearch = useDeferredValue(auditSearch);
  const canViewAdminData = canLoadAdminData({
    role: user?.role,
    verified: adminVerified,
    password: adminPassword,
  });

  useEffect(() => {
    if (!activeProjectId && projects.data?.length) {
      const projectId = preferredProjectId(user?.id, projects.data);
      if (projectId) setActiveProjectId(projectId);
    }
  }, [activeProjectId, projects.data, user?.id]);
  function selectActiveProject(projectId: number) {
    setActiveProjectId(projectId);
    persistPreferredProjectId(user?.id, projectId);
  }
  useEffect(() => {
    setAuditPage(1);
  }, [
    auditDateRange?.from?.getTime(),
    auditDateRange?.to?.getTime(),
    auditActorUserId,
    auditActorRole,
    deferredAuditSearch,
  ]);

  const adminAuditFilters = useMemo(
    () =>
      buildAdminAuditFilterInput(adminPassword, {
        from: auditDateRange?.from,
        to: auditDateRange?.to,
        actorUserId: auditActorUserId,
        actorRole: auditActorRole,
        search: deferredAuditSearch,
      }),
    [
      adminPassword,
      auditActorUserId,
      auditActorRole,
      auditDateRange?.from,
      auditDateRange?.to,
      deferredAuditSearch,
    ]
  );
  const adminAuditQuery = useMemo(
    () => ({ ...adminAuditFilters, page: auditPage, pageSize: 25 }),
    [adminAuditFilters, auditPage]
  );
  const adminLogs = trpc.admin.auditLogs.useQuery(adminAuditQuery, {
    enabled: canViewAdminData,
    retry: false,
  });
  const auditLogExport = trpc.admin.auditLogExport.useQuery(adminAuditFilters, {
    enabled: false,
    retry: false,
  });
  const auditActivity = trpc.admin.auditActivity.useQuery(adminAuditFilters, {
    enabled: canViewAdminData,
    retry: false,
  });
  const adminUsers = trpc.admin.users.useQuery(
    { password: adminPassword || "pending" },
    { enabled: canViewAdminData, retry: false }
  );
  const adminProjects = trpc.admin.projects.useQuery(
    { password: adminPassword || "pending" },
    { enabled: canViewAdminData, retry: false }
  );
  const refresh = async () => {
    await Promise.all([
      utils.finance.overview.invalidate(),
      utils.projects.list.invalidate(),
    ]);
  };

  const createProject = trpc.projects.create.useMutation({
    onSuccess: async project => {
      await refresh();
      selectActiveProject(project.id);
      setProjectOpen(false);
      setProjectName("");
      toast.success("নতুন প্রজেক্ট তৈরি হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const addTransaction = trpc.finance.addTransaction.useMutation({
    onSuccess: async () => {
      await refresh();
      resetTransaction();
      toast.success("লেনদেন সংরক্ষণ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const updateTransaction = trpc.finance.updateTransaction.useMutation({
    onSuccess: async () => {
      await refresh();
      resetTransaction();
      toast.success("লেনদেন আপডেট করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const deleteTransaction = trpc.finance.deleteTransaction.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const addDue = trpc.finance.addDue.useMutation({
    onSuccess: async () => {
      await refresh();
      setDueOpen(false);
      setDueForm(blankDue());
      toast.success("দেনা/পাওনার হিসাব সংরক্ষণ হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const saveVoucherSettings = trpc.finance.saveVoucherSettings.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        utils.finance.voucherSettings.invalidate(),
      ]);
      setVoucherSettingsOpen(false);
      toast.success("ভাউচার সেটিংস সংরক্ষণ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const settleDue = trpc.finance.settleDue.useMutation({
    onSuccess: async () => {
      await refresh();
      setSettlementOpen(false);
      toast.success(
        "বকেয়া হিসাব হালনাগাদ হয়েছে; এটি আয়/ব্যয় হিসেবে যোগ হয়নি"
      );
    },
    onError: error => toast.error(error.message),
  });
  const addAccount = trpc.finance.addAccount.useMutation({
    onSuccess: async () => {
      await refresh();
      setAccountOpen(false);
      setAccountForm({ name: "", type: "cash", openingBalance: "0" });
      toast.success("অ্যাকাউন্ট যোগ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const updateAccount = trpc.finance.updateAccount.useMutation({
    onSuccess: async () => {
      await refresh();
      resetAccount();
      toast.success("অ্যাকাউন্ট আপডেট করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const deleteAccount = trpc.finance.deleteAccount.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const saveBudget = trpc.finance.saveBudget.useMutation({
    onSuccess: async () => {
      await refresh();
      setBudgetOpen(false);
      setBudgetForm({ categoryId: "", amount: "" });
      toast.success("বাজেট সংরক্ষণ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const addBill = trpc.finance.addBill.useMutation({
    onSuccess: async () => {
      await refresh();
      resetBill();
      toast.success("বিল রিমাইন্ডার যোগ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const updateBill = trpc.finance.updateBill.useMutation({
    onSuccess: async () => {
      await refresh();
      resetBill();
      toast.success("বিল রিমাইন্ডার আপডেট করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });
  const setBillPaid = trpc.finance.setBillPaid.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const deleteBill = trpc.finance.deleteBill.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const verifyAdmin = trpc.admin.verifyAccess.useMutation({
    onSuccess: () => {
      setAdminVerified(true);
      toast.success("Admin access যাচাই হয়েছে");
    },
    onError: () => {
      setAdminVerified(false);
      toast.error("Admin password সঠিক নয়");
    },
  });

  const data = overview.data;
  const categories = useMemo(
    () =>
      data?.categories.filter(category => category.type === transactionType) ??
      [],
    [data?.categories, transactionType]
  );
  const expenseCategories = useMemo(
    () =>
      data?.categories.filter(category => category.type === "expense") ?? [],
    [data?.categories]
  );
  const visibleTransactions = useMemo(
    () =>
      (data?.transactions ?? []).filter(
        row => transactionFilter === "all" || row.type === transactionFilter
      ),
    [data?.transactions, transactionFilter]
  );

  function resetTransaction() {
    setTransactionOpen(false);
    setEditingTransactionId(null);
    setTransactionType("expense");
    setTransactionForm(blankTransaction());
  }
  function resetAccount() {
    setAccountOpen(false);
    setEditingAccountId(null);
    setAccountForm({ name: "", type: "cash", openingBalance: "0" });
  }
  function resetBill() {
    setBillOpen(false);
    setEditingBillId(null);
    setBillForm({ title: "", amount: "", dueAt: today(), isPaid: false });
  }
  function requireProject() {
    if (!activeProjectId) {
      toast.error("আগে একটি প্রজেক্ট নির্বাচন করুন");
      return false;
    }
    return true;
  }
  function openNewTransaction() {
    if (!requireProject()) return;
    resetTransaction();
    setTransactionOpen(true);
  }
  function openVoucherSettings() {
    if (!requireProject()) return;
    const settings = voucherSettings.data ?? data?.voucherSettings;
    setVoucherSettingsForm({
      prefix: settings?.prefix ?? "V",
      startNumber: String(settings?.startNumber ?? 1),
      endNumber: String(settings?.endNumber ?? 999999),
    });
    setVoucherSettingsOpen(true);
  }
  function submitVoucherSettings(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    const startNumber = Number(voucherSettingsForm.startNumber);
    const endNumber = Number(voucherSettingsForm.endNumber);
    if (
      !Number.isInteger(startNumber) ||
      !Number.isInteger(endNumber) ||
      startNumber < 1 ||
      endNumber < startNumber
    )
      return toast.error("শুরু ও শেষ নম্বরের একটি সঠিক রেঞ্জ দিন");
    saveVoucherSettings.mutate({
      projectId: activeProjectId!,
      prefix: voucherSettingsForm.prefix.trim(),
      startNumber,
      endNumber,
    });
  }
  function submitTransaction(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    const categoryId = Number(transactionForm.categoryId || categories[0]?.id);
    if (!categoryId || Number(transactionForm.amount) <= 0)
      return toast.error("সঠিক অঙ্ক ও ক্যাটাগরি নির্বাচন করুন");
    const payload = {
      projectId: activeProjectId!,
      categoryId,
      accountId:
        transactionForm.accountId === "none"
          ? undefined
          : Number(transactionForm.accountId),
      type: transactionType,
      amount: Number(transactionForm.amount),
      paymentMethod: transactionForm.paymentMethod,
      note: transactionForm.note || undefined,
      occurredAt: new Date(`${transactionForm.occurredAt}T12:00:00Z`),
    };
    if (editingTransactionId)
      updateTransaction.mutate({ id: editingTransactionId, ...payload });
    else addTransaction.mutate(payload);
  }
  function submitAccount(event: FormEvent) {
    event.preventDefault();
    if (!requireProject() || !accountForm.name.trim())
      return toast.error("অ্যাকাউন্টের নাম দিন");
    const payload = {
      projectId: activeProjectId!,
      ...accountForm,
      openingBalance: Number(accountForm.openingBalance || 0),
    };
    if (editingAccountId)
      updateAccount.mutate({ id: editingAccountId, ...payload });
    else addAccount.mutate(payload);
  }
  function submitBudget(event: FormEvent) {
    event.preventDefault();
    if (
      !requireProject() ||
      !budgetForm.categoryId ||
      Number(budgetForm.amount) <= 0
    )
      return toast.error("ক্যাটাগরি ও বাজেটের অঙ্ক দিন");
    saveBudget.mutate({
      projectId: activeProjectId!,
      categoryId: Number(budgetForm.categoryId),
      monthKey: data?.monthKey ?? new Date().toISOString().slice(0, 7),
      amount: Number(budgetForm.amount),
    });
  }
  function submitBill(event: FormEvent) {
    event.preventDefault();
    if (
      !requireProject() ||
      !billForm.title.trim() ||
      Number(billForm.amount) <= 0
    )
      return toast.error("বিলের নাম ও অঙ্ক দিন");
    const payload = {
      projectId: activeProjectId!,
      title: billForm.title,
      amount: Number(billForm.amount),
      dueAt: new Date(`${billForm.dueAt}T12:00:00Z`),
    };
    if (editingBillId)
      updateBill.mutate({
        id: editingBillId,
        ...payload,
        isPaid: billForm.isPaid,
      });
    else addBill.mutate(payload);
  }
  function submitDue(event: FormEvent) {
    event.preventDefault();
    if (
      !requireProject() ||
      !dueForm.counterparty.trim() ||
      Number(dueForm.amount) <= 0
    )
      return toast.error("নাম ও সঠিক টাকার পরিমাণ দিন");
    addDue.mutate({
      projectId: activeProjectId!,
      type: dueForm.type,
      counterparty: dueForm.counterparty,
      amount: Number(dueForm.amount),
      note: dueForm.note || undefined,
      openedAt: new Date(`${dueForm.openedAt}T12:00:00Z`),
    });
  }
  function openSettlement(due: NonNullable<typeof data>["dues"][number]) {
    setSettlementForm({
      dueId: due.id,
      accountId: "none",
      amount: String(due.outstandingAmount),
      note: "",
      occurredAt: today(),
    });
    setSettlementOpen(true);
  }
  function submitSettlement(event: FormEvent) {
    event.preventDefault();
    if (!requireProject() || Number(settlementForm.amount) <= 0)
      return toast.error("সঠিক পরিমাণ দিন");
    settleDue.mutate({
      projectId: activeProjectId!,
      dueId: settlementForm.dueId,
      accountId:
        settlementForm.accountId === "none"
          ? undefined
          : Number(settlementForm.accountId),
      amount: Number(settlementForm.amount),
      note: settlementForm.note || undefined,
      occurredAt: new Date(`${settlementForm.occurredAt}T12:00:00Z`),
    });
  }
  function openTransactionEditor(
    row: NonNullable<typeof data>["transactions"][number]
  ) {
    setEditingTransactionId(row.id);
    setTransactionType(row.type);
    setTransactionForm({
      amount: String(row.amount),
      categoryId: String(row.categoryId),
      accountId: row.accountId ? String(row.accountId) : "none",
      paymentMethod: row.paymentMethod,
      occurredAt: new Date(row.occurredAt).toISOString().slice(0, 10),
      note: row.note ?? "",
    });
    setTransactionOpen(true);
  }
  function openAccountEditor(
    account: NonNullable<typeof data>["accounts"][number]
  ) {
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      type: account.type,
      openingBalance: String(account.openingBalance),
    });
    setAccountOpen(true);
  }
  function openBillEditor(row: NonNullable<typeof data>["bills"][number]) {
    setEditingBillId(row.id);
    setBillForm({
      title: row.title,
      amount: String(row.amount),
      dueAt: new Date(row.dueAt).toISOString().slice(0, 10),
      isPaid: row.isPaid,
    });
    setBillOpen(true);
  }
  async function downloadAuditLogs(format: "csv" | "pdf") {
    try {
      setIsAuditExporting(true);
      const result = await auditLogExport.refetch();
      if (!result.data?.length)
        throw new Error("এই ফিল্টারে কোনো audit record নেই");
      if (format === "csv") downloadAuditCsv(result.data);
      else await downloadAuditPdf(result.data);
      toast.success(
        `${result.data.length}টি audit record ${format.toUpperCase()} ফাইলে ডাউনলোড হয়েছে`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Audit log এক্সপোর্ট করা যায়নি"
      );
    } finally {
      setIsAuditExporting(false);
    }
  }
  async function downloadExport() {
    try {
      const result = await exportData.refetch();
      if (!result.data) throw new Error("ডেটা পাওয়া যায়নি");
      const blob = new Blob(
        [
          JSON.stringify(
            {
              formatVersion: 2,
              exportedAt: new Date().toISOString(),
              data: result.data,
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-hisab-export-${today()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(
        "নিজের ডেটা ডাউনলোড হয়েছে। চাইলে private Drive backup folder-এ আপলোড করুন।",
        { duration: 6000 }
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ডেটা এক্সপোর্ট করা যায়নি"
      );
    }
  }

  if (!isAuthenticated)
    return (
      <DashboardLayout>
        <EmptySignIn />
      </DashboardLayout>
    );
  if (projects.isLoading || (activeProjectId !== null && overview.isLoading))
    return (
      <DashboardLayout>
        <LoadingState />
      </DashboardLayout>
    );
  if (projects.error || overview.error)
    return (
      <DashboardLayout>
        <ErrorState
          message={projects.error?.message ?? overview.error?.message}
        />
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <main id="overview" className="space-y-7 pb-12">
        <section className="flex flex-col justify-between gap-5 rounded-3xl bg-[#edf5ee] p-5 sm:p-7 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-[#4f7b67]">
              আমার হিসাব
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#163c32] sm:text-4xl">
              প্রোফাইল
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#5d776b]">
              {user?.name ?? "আপনার"} প্রোফাইল থেকে প্রকল্প ও ব্যক্তিগত হিসাব
              পরিচালনা করুন।
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#d9e7da] bg-white/80 p-3">
            <label className="grid gap-1 text-xs font-semibold text-[#4f6f61]">
              <span>প্রোফাইলের প্রজেক্ট</span>
              <select
                aria-label="প্রোফাইলের প্রজেক্ট নির্বাচন"
                className="finance-input h-11 min-w-44 bg-white"
                value={activeProjectId ?? ""}
                onChange={event =>
                  selectActiveProject(Number(event.target.value))
                }
              >
                {projects.data?.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={openNewTransaction}
              className="h-11 rounded-xl bg-[#173f36] font-semibold hover:bg-[#0f3028]"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              লেনদেন যোগ করুন
            </Button>
            <Button
              onClick={openVoucherSettings}
              variant="outline"
              className="h-11 rounded-xl border-[#b9d1be] bg-white text-[#173f36]"
            >
              <ReceiptText className="mr-1.5 h-4 w-4" />
              ভাউচার সেটিংস
            </Button>
            <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-[#b9d1be] bg-white text-[#173f36]"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  প্রজেক্ট যোগ করুন
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>নতুন আলাদা প্রজেক্ট</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    if (!projectName.trim())
                      return toast.error("প্রজেক্টের নাম দিন");
                    createProject.mutate({ name: projectName });
                  }}
                  className="grid gap-4"
                >
                  <Field label="প্রজেক্টের নাম">
                    <Input
                      value={projectName}
                      onChange={event => setProjectName(event.target.value)}
                      placeholder="যেমন: নতুন ব্যবসা"
                    />
                  </Field>
                  <Button
                    type="submit"
                    disabled={createProject.isPending}
                    className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
                  >
                    তৈরি করুন
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              onClick={downloadExport}
              disabled={exportData.isFetching}
              variant="outline"
              className="h-11 rounded-xl border-[#b9d1be] bg-white text-[#173f36]"
            >
              <Download className="mr-1.5 h-4 w-4" />
              নিজের ডেটা
            </Button>
            {user?.role === "admin" && (
              <Button
                onClick={() => setAdminOpen(true)}
                variant="outline"
                className="h-11 rounded-xl border-[#d7c48d] bg-[#fffdf3] text-[#765a14]"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Admin
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#d9e7da] bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="section-kicker">দ্রুত ডেটা এন্ট্রি</p>
            <h2 className="section-title">হিসাব লেখা শুরু করুন</h2>
            <p className="mt-1 text-sm text-[#668076]">
              আয় বা ব্যয় লিখতে <strong>লেনদেন যোগ করুন</strong> চাপুন।
              অ্যাকাউন্ট, বাজেট ও বিল যোগ করার বাটন নিচের সংশ্লিষ্ট সেকশনে আছে।
            </p>
          </div>
          <Button
            onClick={openNewTransaction}
            className="mt-3 w-full rounded-xl bg-[#173f36] hover:bg-[#0f3028] sm:mt-0 sm:w-auto"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            এখনই লেনদেন যোগ করুন
          </Button>
        </section>

        {data && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={WalletCards}
                tone="green"
                label="মোট ব্যালেন্স"
                value={bdt(data.totals.totalBalance)}
              />
              <Metric
                icon={TrendingUp}
                tone="mint"
                label="মোট আয়"
                value={bdt(data.totals.totalIncome)}
              />
              <Metric
                icon={TrendingDown}
                tone="rose"
                label="মোট ব্যয়"
                value={bdt(data.totals.totalExpense)}
              />
              <Metric
                icon={Banknote}
                tone="sand"
                label="নিট পরিমাণ"
                value={bdt(data.totals.netAmount)}
              />
            </section>
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.85fr)]">
              <article className="finance-card p-5 sm:p-6">
                <p className="section-kicker">মাসিক প্রবণতা</p>
                <h2 className="section-title">গত ৬ মাসের আয় ও ব্যয়</h2>
                <div className="mt-5 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trend}>
                      <CartesianGrid vertical={false} stroke="#e3ebe5" />
                      <XAxis
                        dataKey="monthKey"
                        tickFormatter={monthText}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={value => `৳${value}`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => bdt(value)}
                        labelFormatter={label =>
                          `${monthText(String(label))} মাস`
                        }
                      />
                      <Bar
                        dataKey="income"
                        name="আয়"
                        fill="#1c7c54"
                        radius={[7, 7, 0, 0]}
                      />
                      <Bar
                        dataKey="expense"
                        name="ব্যয়"
                        fill="#ec8c7f"
                        radius={[7, 7, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <BillsPanel
                bills={data.bills}
                onAdd={() => {
                  resetBill();
                  setBillOpen(true);
                }}
                onEdit={openBillEditor}
                onPay={(id, isPaid) =>
                  setBillPaid.mutate({
                    projectId: activeProjectId!,
                    id,
                    isPaid,
                  })
                }
                onDelete={id => {
                  if (window.confirm("এই বিলটি মুছে ফেলবেন?"))
                    deleteBill.mutate({ projectId: activeProjectId!, id });
                }}
              />
            </section>
            <section id="transactions" className="scroll-mt-20 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
              <TransactionsPanel
                rows={visibleTransactions}
                filter={transactionFilter}
                setFilter={setTransactionFilter}
                onAdd={openNewTransaction}
                onEdit={openTransactionEditor}
                onDelete={id => {
                  if (window.confirm("এই লেনদেনটি মুছে ফেলবেন?"))
                    deleteTransaction.mutate({
                      projectId: activeProjectId!,
                      id,
                    });
                }}
              />
              <aside className="space-y-6">
                <article id="accounts" className="scroll-mt-20 finance-card p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="section-kicker">অ্যাকাউন্ট</p>
                      <h2 className="section-title">টাকার উৎস</h2>
                    </div>
                    <Button
                      size="icon"
                      onClick={() => {
                        resetAccount();
                        setAccountOpen(true);
                      }}
                      variant="outline"
                      className="rounded-xl"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {data.accounts.length ? (
                      data.accounts.map(account => (
                        <div
                          key={account.id}
                          className="rounded-xl bg-[#f5f8f5] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-[#183d34]">
                                {account.name}
                              </p>
                              <p className="mt-1 text-sm text-[#668076]">
                                {account.type === "cash"
                                  ? "নগদ"
                                  : account.type === "bank"
                                    ? "ব্যাংক"
                                    : "মোবাইল ব্যাংকিং"}{" "}
                                · {bdt(account.currentBalance)}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openAccountEditor(account)}
                              >
                                সম্পাদনা
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[#b64040] hover:text-[#8d2b2b]"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "এই অ্যাকাউন্টটি মুছে ফেলবেন?"
                                    )
                                  )
                                    deleteAccount.mutate({
                                      projectId: activeProjectId!,
                                      id: account.id,
                                    });
                                }}
                              >
                                মুছুন
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <Empty text="এখনও কোনো অ্যাকাউন্ট যোগ করা হয়নি" />
                    )}
                  </div>
                </article>
                <article id="budgets" className="scroll-mt-20 finance-card p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="section-kicker">মাসিক বাজেট</p>
                      <h2 className="section-title">খরচের সীমা</h2>
                    </div>
                    <Button
                      size="icon"
                      onClick={() => setBudgetOpen(true)}
                      variant="outline"
                      className="rounded-xl"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-4 space-y-4">
                    {data.budgets.length ? (
                      data.budgets.map(budget => (
                        <div key={budget.id}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="font-medium text-[#294c42]">
                              {budget.categoryName}
                            </span>
                            <span className="text-[#71867c]">
                              {bdt(budget.spent)} / {bdt(budget.amount)}
                            </span>
                          </div>
                          <Progress
                            value={Math.min(
                              100,
                              Number(budget.amount)
                                ? (Number(budget.spent) /
                                    Number(budget.amount)) *
                                    100
                                : 0
                            )}
                            className="mt-2 h-2"
                          />
                        </div>
                      ))
                    ) : (
                      <Empty text="এই মাসে কোনো বাজেট নেই" />
                    )}
                  </div>
                </article>
              </aside>
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <DuesPanel
                title="দেনার খাতা"
                eyebrow="দেনা"
                dues={data.dues.filter(due => due.type === "debt")}
                onAdd={() => {
                  setDueForm({ ...blankDue(), type: "debt" });
                  setDueOpen(true);
                }}
                onSettle={openSettlement}
              />
              <DuesPanel
                title="পাওনার খাতা"
                eyebrow="পাওনা"
                dues={data.dues.filter(due => due.type === "receivable")}
                onAdd={() => {
                  setDueForm({ ...blankDue(), type: "receivable" });
                  setDueOpen(true);
                }}
                onSettle={openSettlement}
              />
            </section>
          </>
        )}
      </main>

      <Dialog
        open={voucherSettingsOpen}
        onOpenChange={setVoucherSettingsOpen}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ভাউচার সেটিংস</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitVoucherSettings} className="grid gap-4">
            <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">
              প্রতিটি নতুন লেনদেন, দেনা/পাওনা ও সমন্বয়ের জন্য নির্ধারিত
              রেঞ্জ থেকে পরবর্তী ভাউচার নম্বর স্বয়ংক্রিয়ভাবে দেওয়া হবে।
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ভাউচার প্রিফিক্স">
                <Input
                  required
                  maxLength={20}
                  value={voucherSettingsForm.prefix}
                  onChange={event =>
                    setVoucherSettingsForm({
                      ...voucherSettingsForm,
                      prefix: event.target.value,
                    })
                  }
                  placeholder="V"
                />
              </Field>
              <Field label="পরবর্তী নম্বর">
                <Input
                  readOnly
                  value={
                    voucherSettings.data
                      ? `${voucherSettings.data.prefix}-${String(voucherSettings.data.nextNumber).padStart(6, "0")}`
                      : "লোড হচ্ছে…"
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="শুরুর নম্বর">
                <Input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={voucherSettingsForm.startNumber}
                  onChange={event =>
                    setVoucherSettingsForm({
                      ...voucherSettingsForm,
                      startNumber: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="শেষ নম্বর">
                <Input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={voucherSettingsForm.endNumber}
                  onChange={event =>
                    setVoucherSettingsForm({
                      ...voucherSettingsForm,
                      endNumber: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Button
              type="submit"
              disabled={saveVoucherSettings.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              {saveVoucherSettings.isPending ? "সংরক্ষণ হচ্ছে…" : "সেটিংস সংরক্ষণ করুন"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transactionOpen}
        onOpenChange={open =>
          open ? setTransactionOpen(true) : resetTransaction()
        }
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTransactionId ? "লেনদেন সম্পাদনা করুন" : "নতুন লেনদেন"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitTransaction} className="grid gap-4">
            <Tabs
              value={transactionType}
              onValueChange={value => {
                setTransactionType(value as "income" | "expense");
                setTransactionForm(current => ({ ...current, categoryId: "" }));
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="expense">ব্যয়</TabsTrigger>
                <TabsTrigger value="income">আয়</TabsTrigger>
              </TabsList>
            </Tabs>
            <Field label="টাকার অঙ্ক">
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={transactionForm.amount}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    amount: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="ক্যাটাগরি">
              <select
                required
                className="finance-input"
                value={transactionForm.categoryId}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    categoryId: event.target.value,
                  })
                }
              >
                <option value="">ক্যাটাগরি বাছাই করুন</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং সেটিংসের নির্ধারিত রেঞ্জ থেকে স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="তারিখ">
                <Input
                  required
                  type="date"
                  value={transactionForm.occurredAt}
                  onChange={event =>
                    setTransactionForm({
                      ...transactionForm,
                      occurredAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="পেমেন্ট">
                <select
                  className="finance-input"
                  value={transactionForm.paymentMethod}
                  onChange={event =>
                    setTransactionForm({
                      ...transactionForm,
                      paymentMethod: event.target.value,
                    })
                  }
                >
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>bKash</option>
                  <option>Nagad</option>
                  <option>Card</option>
                </select>
              </Field>
            </div>
            <Field label="অ্যাকাউন্ট">
              <select
                className="finance-input"
                value={transactionForm.accountId}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    accountId: event.target.value,
                  })
                }
              >
                <option value="none">অ্যাকাউন্ট ছাড়া</option>
                {data?.accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} — {bdt(account.currentBalance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="বিবরণ">
              <Textarea
                value={transactionForm.note}
                onChange={event =>
                  setTransactionForm({
                    ...transactionForm,
                    note: event.target.value,
                  })
                }
              />
            </Field>
            <Button
              disabled={addTransaction.isPending || updateTransaction.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              {editingTransactionId ? "আপডেট করুন" : "সংরক্ষণ করুন"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={dueOpen}
        onOpenChange={open => {
          setDueOpen(open);
          if (!open) setDueForm(blankDue());
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dueForm.type === "debt" ? "নতুন দেনা" : "নতুন পাওনা"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitDue} className="grid gap-4">
            <Tabs
              value={dueForm.type}
              onValueChange={value =>
                setDueForm({ ...dueForm, type: value as "debt" | "receivable" })
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="debt">দেনা</TabsTrigger>
                <TabsTrigger value="receivable">পাওনা</TabsTrigger>
              </TabsList>
            </Tabs>
            <Field
              label={
                dueForm.type === "debt" ? "দেনাদারের নাম" : "পাওনাদারের নাম"
              }
            >
              <Input
                required
                value={dueForm.counterparty}
                onChange={event =>
                  setDueForm({ ...dueForm, counterparty: event.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="টাকার অঙ্ক">
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={dueForm.amount}
                  onChange={event =>
                    setDueForm({ ...dueForm, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="তারিখ">
                <Input
                  required
                  type="date"
                  value={dueForm.openedAt}
                  onChange={event =>
                    setDueForm({ ...dueForm, openedAt: event.target.value })
                  }
                />
              </Field>
            </div>
            <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
            <Field label="বিবরণ">
              <Textarea
                value={dueForm.note}
                onChange={event =>
                  setDueForm({ ...dueForm, note: event.target.value })
                }
              />
            </Field>
            <Button
              disabled={addDue.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              সংরক্ষণ করুন
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>দেনা/পাওনা সমন্বয়</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitSettlement} className="grid gap-4">
            <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">
              এই সমন্বয়টি আয় বা ব্যয় নয়; কেবল বকেয়া পরিমাণ কমাবে।
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="পরিশোধ/প্রাপ্তির তারিখ">
                <Input
                  required
                  type="date"
                  value={settlementForm.occurredAt}
                  onChange={event =>
                    setSettlementForm({
                      ...settlementForm,
                      occurredAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="টাকার অঙ্ক">
                <Input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={settlementForm.amount}
                  onChange={event =>
                    setSettlementForm({
                      ...settlementForm,
                      amount: event.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="যে অ্যাকাউন্টে লেনদেন হয়েছে">
              <select
                className="finance-input"
                value={settlementForm.accountId}
                onChange={event =>
                  setSettlementForm({
                    ...settlementForm,
                    accountId: event.target.value,
                  })
                }
              >
                <option value="none">অ্যাকাউন্ট ছাড়া</option>
                {data?.accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="rounded-xl bg-[#edf6ed] p-3 text-sm text-[#28603c]">ভাউচার নং স্বয়ংক্রিয়ভাবে তৈরি হবে।</p>
            <Field label="বিবরণ">
              <Textarea
                value={settlementForm.note}
                onChange={event =>
                  setSettlementForm({
                    ...settlementForm,
                    note: event.target.value,
                  })
                }
              />
            </Field>
            <Button
              disabled={settleDue.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              বকেয়া সমন্বয় করুন
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={accountOpen}
        onOpenChange={open => (open ? setAccountOpen(true) : resetAccount())}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAccountId ? "অ্যাকাউন্ট সম্পাদনা" : "নতুন অ্যাকাউন্ট"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAccount} className="grid gap-4">
            <Field label="নাম">
              <Input
                required
                value={accountForm.name}
                onChange={event =>
                  setAccountForm({ ...accountForm, name: event.target.value })
                }
              />
            </Field>
            <Field label="ধরন">
              <select
                className="finance-input"
                value={accountForm.type}
                onChange={event =>
                  setAccountForm({
                    ...accountForm,
                    type: event.target.value as typeof accountForm.type,
                  })
                }
              >
                <option value="cash">নগদ</option>
                <option value="bank">ব্যাংক</option>
                <option value="mobile">মোবাইল ব্যাংকিং</option>
              </select>
            </Field>
            <Field label="প্রারম্ভিক ব্যালেন্স">
              <Input
                required
                type="number"
                step="0.01"
                value={accountForm.openingBalance}
                onChange={event =>
                  setAccountForm({
                    ...accountForm,
                    openingBalance: event.target.value,
                  })
                }
              />
            </Field>
            <Button
              disabled={addAccount.isPending || updateAccount.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              {editingAccountId ? "আপডেট করুন" : "অ্যাকাউন্ট যোগ করুন"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>মাসিক বাজেট</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitBudget} className="grid gap-4">
            <Field label="ব্যয় ক্যাটাগরি">
              <select
                className="finance-input"
                value={budgetForm.categoryId}
                onChange={event =>
                  setBudgetForm({
                    ...budgetForm,
                    categoryId: event.target.value,
                  })
                }
              >
                <option value="">ক্যাটাগরি বাছাই করুন</option>
                {expenseCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="বাজেটের অঙ্ক">
              <Input
                required
                type="number"
                min="0.01"
                value={budgetForm.amount}
                onChange={event =>
                  setBudgetForm({ ...budgetForm, amount: event.target.value })
                }
              />
            </Field>
            <Button
              disabled={saveBudget.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              বাজেট সংরক্ষণ করুন
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={billOpen}
        onOpenChange={open => (open ? setBillOpen(true) : resetBill())}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingBillId ? "বিল সম্পাদনা" : "নতুন বিল রিমাইন্ডার"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitBill} className="grid gap-4">
            <Field label="বিলের নাম">
              <Input
                required
                value={billForm.title}
                onChange={event =>
                  setBillForm({ ...billForm, title: event.target.value })
                }
              />
            </Field>
            <Field label="টাকার অঙ্ক">
              <Input
                required
                type="number"
                min="0.01"
                value={billForm.amount}
                onChange={event =>
                  setBillForm({ ...billForm, amount: event.target.value })
                }
              />
            </Field>
            <Field label="শেষ তারিখ">
              <Input
                required
                type="date"
                value={billForm.dueAt}
                onChange={event =>
                  setBillForm({ ...billForm, dueAt: event.target.value })
                }
              />
            </Field>
            {editingBillId && (
              <label className="flex items-center gap-2 text-sm text-[#38594d]">
                <input
                  type="checkbox"
                  checked={billForm.isPaid}
                  onChange={event =>
                    setBillForm({ ...billForm, isPaid: event.target.checked })
                  }
                />
                পরিশোধিত
              </label>
            )}
            <Button
              disabled={addBill.isPending || updateBill.isPending}
              className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
            >
              সংরক্ষণ করুন
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={adminOpen}
        onOpenChange={open => {
          setAdminOpen(open);
          if (!open) {
            setAdminVerified(false);
            setAdminPassword("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5 text-[#76601d]" />
              Admin control
            </DialogTitle>
          </DialogHeader>
          {!adminVerified ? (
            <form
              onSubmit={event => {
                event.preventDefault();
                verifyAdmin.mutate({ password: adminPassword });
              }}
              className="grid gap-4"
            >
              <p className="text-sm text-[#667f75]">
                Manus OAuth identity ও server-only password—দুই ধাপে Admin
                নিয়ন্ত্রণ সুরক্ষিত।
              </p>
              <Field label="Admin password">
                <Input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={event => setAdminPassword(event.target.value)}
                />
              </Field>
              <Button
                disabled={verifyAdmin.isPending}
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
                    onClick={() => {
                      setAuditDateRange(undefined);
                      setAuditSearch("");
                      setAuditActorUserId("all");
                      setAuditActorRole("all");
                    }}
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
                            labelFormatter={auditActionText}
                            formatter={(value: number) => [
                              String(value) + "টি কাজ",
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
                      onClick={() => downloadAuditLogs("csv")}
                    >
                      CSV ডাউনলোড
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isAuditExporting}
                      onClick={() => downloadAuditLogs("pdf")}
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
                <h3 className="font-semibold text-[#173f36]">
                  নিবন্ধিত ব্যবহারকারী
                </h3>
                <div className="mt-3 max-h-40 divide-y divide-[#e5eee7] overflow-auto rounded-xl border border-[#e1ebe3]">
                  {adminUsers.data?.map(member => (
                    <div
                      key={member.id}
                      className="flex justify-between gap-3 p-3 text-sm"
                    >
                      <span className="font-medium text-[#25483e]">
                        {member.name ?? member.email ?? `User #${member.id}`}
                      </span>
                      <span className="rounded-full bg-[#eff5ef] px-2 py-0.5 text-xs text-[#477263]">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function DuesPanel({
  title,
  eyebrow,
  dues,
  onAdd,
  onSettle,
}: {
  title: string;
  eyebrow: string;
  dues: any[];
  onAdd: () => void;
  onSettle: (due: any) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">{eyebrow}</p>
          <h2 className="section-title">{title}</h2>
        </div>
        <Button
          size="sm"
          onClick={onAdd}
          className="rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
        >
          <Plus className="mr-1 h-4 w-4" />
          যোগ করুন
        </Button>
      </div>
      <p className="mt-2 text-xs text-[#6d8278]">
        সমন্বয় করলে বকেয়া কমবে; আয় বা ব্যয়ের হিসাবে যোগ হবে না।
      </p>
      <div className="mt-4 divide-y divide-[#e8eee9]">
        {dues.length ? (
          dues.map(due => (
            <div key={due.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#25483e]">
                    {due.counterparty}
                  </p>
                  <p className="mt-1 text-xs text-[#778980]">
                    {due.voucherNo ? `ভাউচার: ${due.voucherNo} · ` : ""}
                    {due.note ?? "কোনো বিবরণ নেই"}
                  </p>
                </div>
                <p className="font-semibold text-[#a56d20]">
                  {bdt(due.outstandingAmount)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-[#778980]">
                  মোট {bdt(due.originalAmount)} · {dateText(due.openedAt)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSettle(due)}
                >
                  সমন্বয়
                </Button>
              </div>
              {due.settlements?.length ? (
                <div className="mt-3 rounded-lg bg-[#f6faf7] p-2">
                  <p className="text-xs font-semibold text-[#587466]">
                    সমন্বয়ের ইতিহাস
                  </p>
                  {due.settlements.map((settlement: any) => (
                    <div
                      key={settlement.id}
                      className="mt-2 grid gap-1 border-t border-[#e5eee7] pt-2 text-xs text-[#667d72] sm:grid-cols-2"
                    >
                      <span>
                        {dateText(settlement.occurredAt)} ·{" "}
                        {settlement.voucherNo
                          ? `ভাউচার: ${settlement.voucherNo}`
                          : "ভাউচার নেই"}
                      </span>
                      <span className="font-medium text-[#25483e] sm:text-right">
                        {bdt(settlement.amount)} ·{" "}
                        {settlement.accountName ?? "অ্যাকাউন্ট ছাড়া"}
                      </span>
                      <span className="sm:col-span-2">
                        {settlement.note ?? "কোনো বিবরণ নেই"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#8a9a92]">
                  এখনও কোনো সমন্বয় হয়নি
                </p>
              )}
            </div>
          ))
        ) : (
          <Empty text={`${eyebrow}র কোনো বকেয়া নেই`} />
        )}
      </div>
    </article>
  );
}

function BillsPanel({
  bills,
  onAdd,
  onEdit,
  onPay,
  onDelete,
}: {
  bills: any[];
  onAdd: () => void;
  onEdit: (bill: any) => void;
  onPay: (id: number, isPaid: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker">বিল রিমাইন্ডার</p>
          <h2 className="section-title">আসন্ন বিল</h2>
        </div>
        <Button
          size="icon"
          onClick={onAdd}
          variant="outline"
          className="rounded-xl"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 divide-y divide-[#e8eee9]">
        {bills.length ? (
          bills.slice(0, 5).map(bill => (
            <div key={bill.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => onPay(bill.id, !bill.isPaid)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${bill.isPaid ? "border-[#2a8d5c] bg-[#eaf7ed] text-[#24834f]" : "border-[#d6e2d8] text-transparent"}`}
                aria-label="বিলের অবস্থা পরিবর্তন"
              >
                <Check className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate font-medium ${bill.isPaid ? "text-[#82948b] line-through" : "text-[#25483e]"}`}
                >
                  {bill.title}
                </p>
                <p className="mt-0.5 text-xs text-[#778980]">
                  {dateText(bill.dueAt)} · {bdt(bill.amount)}
                </p>
              </div>
              <button
                onClick={() => onEdit(bill)}
                aria-label="সম্পাদনা"
                className="text-[#577d6e]"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => onDelete(bill.id)}
                aria-label="মুছুন"
                className="text-[#bd6a63]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <Empty text="এখনও কোনো বিল রিমাইন্ডার নেই" />
        )}
      </div>
    </article>
  );
}

function TransactionsPanel({
  rows,
  filter,
  setFilter,
  onAdd,
  onEdit,
  onDelete,
}: {
  rows: any[];
  filter: "all" | "income" | "expense";
  setFilter: (value: "all" | "income" | "expense") => void;
  onAdd: () => void;
  onEdit: (row: any) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <article className="finance-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">লেনদেন</p>
          <h2 className="section-title">সাম্প্রতিক হিসাব</h2>
        </div>
        <div className="flex gap-2">
          <select
            className="finance-input h-10 text-sm"
            value={filter}
            onChange={event => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">সব</option>
            <option value="income">আয়</option>
            <option value="expense">ব্যয়</option>
          </select>
          <Button
            onClick={onAdd}
            className="h-10 rounded-xl bg-[#173f36] hover:bg-[#0f3028]"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            লেনদেন
          </Button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-y border-[#e8eee9] text-xs text-[#71867c]">
            <tr>
              <th className="px-2 py-3 font-semibold">তারিখ</th>
              <th className="px-2 py-3 font-semibold">বিবরণ</th>
              <th className="px-2 py-3 font-semibold">ক্যাটাগরি</th>
              <th className="px-2 py-3 font-semibold">অ্যাকাউন্ট</th>
              <th className="px-2 py-3 text-right font-semibold">
                টাকার পরিমাণ
              </th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(row => (
                <tr key={row.id} className="border-b border-[#edf1ee]">
                  <td className="px-2 py-3 text-[#647d72]">
                    {dateText(row.occurredAt)}
                  </td>
                  <td className="px-2 py-3">
                    <p
                      className="max-w-48 truncate font-medium text-[#264a3f]"
                      title={row.note ?? ""}
                    >
                      {row.note ?? "—"}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-[#264a3f]">
                      {row.categoryName}
                    </p>
                    <p className="text-xs text-[#819188]">
                      {row.paymentMethod}
                    </p>
                  </td>
                  <td className="px-2 py-3 text-[#647d72]">
                    {row.accountName ?? "—"}
                  </td>
                  <td
                    className={`px-2 py-3 text-right font-semibold ${row.type === "income" ? "text-[#278050]" : "text-[#c4675d]"}`}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {bdt(row.amount)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEdit(row)}
                        aria-label="সম্পাদনা"
                        className="text-[#577d6e]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(row.id)}
                        aria-label="মুছুন"
                        className="text-[#bd6a63]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <Empty text="এই ফিল্টারে কোনো লেনদেন নেই" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function Metric({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof WalletCards;
  tone: string;
  label: string;
  value: string;
}) {
  const tones: Record<string, string> = {
    green: "bg-[#eaf5ed] text-[#1f7a4c]",
    mint: "bg-[#eaf7f0] text-[#298658]",
    rose: "bg-[#fff0ee] text-[#c66a5f]",
    sand: "bg-[#fff7e9] text-[#a56d20]",
  };
  return (
    <article className="finance-card p-5">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-[#6d8278]">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-[#193e34]">
        {value}
      </p>
    </article>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="py-5 text-center text-sm text-[#7b8d84]">{text}</p>;
}
function LoadingState() {
  return (
    <div className="grid min-h-[45vh] place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#1f7650]" />
    </div>
  );
}
function ErrorState({ message }: { message?: string }) {
  return (
    <div className="finance-card p-8 text-center">
      <p className="font-semibold text-[#9e504d]">তথ্য লোড করা যায়নি</p>
      <p className="mt-2 text-sm text-[#75877e]">
        {message ?? "আবার চেষ্টা করুন"}
      </p>
    </div>
  );
}
function EmptySignIn() {
  return (
    <div className="finance-card p-8 text-center">
      <LockKeyhole className="mx-auto h-8 w-8 text-[#2b7650]" />
      <p className="mt-3 font-semibold text-[#183e34]">
        আপনার হিসাব দেখতে সাইন ইন করুন
      </p>
    </div>
  );
}
