import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Metric,
  LoadingState,
  ErrorState,
  EmptySignIn,
} from "@/components/dashboard/DashboardMetrics";
import { BillsPanel } from "@/components/dashboard/BillsPanel";
import { DuesPanel } from "@/components/dashboard/DuesPanel";
import { TransactionsPanel } from "@/components/dashboard/TransactionsPanel";
import { AccountsPanel } from "@/components/dashboard/AccountsPanel";
import { BudgetsPanel } from "@/components/dashboard/BudgetsPanel";
import { MonthlyTrendChart } from "@/components/dashboard/MonthlyTrendChart";
import { AccountingSummarySection } from "@/components/dashboard/AccountingSummarySection";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { QuickDataEntryBanner } from "@/components/dashboard/QuickDataEntryBanner";
import {
  VoucherSettingsDialog,
  TransactionDialog,
  DueDialog,
  SettlementDialog,
  AccountDialog,
  BudgetDialog,
  BillDialog,
  ProjectDialog,
  MonthlyReportDialog,
  AdminDialog,
} from "@/components/dashboard/dialogs";
import {
  bdt,
  today,
  blankTransaction,
  blankDue,
  type TransactionDraft,
  type DueDraft,
  type SettlementDraft,
  type AccountDraft,
  type BudgetDraft,
  type BillDraft,
  type VoucherSettingsDraft,
} from "@/components/dashboard/types";
import { trpc } from "@/lib/trpc";
import { canLoadAdminData } from "@/lib/adminAccess";
import {
  readActiveProjectId,
  resolveActiveProjectId,
  saveActiveProjectId,
} from "@/lib/activeProject";
import { buildAdminAuditFilterInput } from "@/lib/auditFilters";
import {
  accountingReportOptions,
  type AccountingReportType,
} from "@/lib/accountingReportDefinitions";
import { toast } from "sonner";
import {
  Banknote,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useAppLogo } from "@/hooks/useAppLogo";
import { parseTransactionSMS } from "@/lib/smsParser";
import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DateRange } from "react-day-picker";

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

  // Monthly Report
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);
  const [reportMonthKey, setReportMonthKey] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [isReportDownloading, setIsReportDownloading] = useState(false);
  const [isReportSharing, setIsReportSharing] = useState(false);
  const [reportType, setReportType] = useState<AccountingReportType>("full");
  const monthlyReport = trpc.finance.monthlyReport.useQuery(
    { projectId: activeProjectId ?? 0, monthKey: reportMonthKey },
    { enabled: false, retry: false }
  );
  const accountingSummary = trpc.finance.monthlyReport.useQuery(
    { projectId: activeProjectId ?? 0, monthKey: reportMonthKey },
    {
      enabled: isAuthenticated && activeProjectId !== null,
      retry: false,
    }
  );

  // Transactions
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
  const [smsInput, setSmsInput] = useState("");
  const [showSmsHelper, setShowSmsHelper] = useState(false);

  // Dues & Settlements
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

  // Accounts
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState<AccountDraft>({
    name: "",
    type: "cash",
    openingBalance: "0",
  });

  // Budgets & Bills
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetDraft>({ categoryId: "", amount: "" });
  const [billOpen, setBillOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [billForm, setBillForm] = useState<BillDraft>({
    title: "",
    amount: "",
    dueAt: today(),
    isPaid: false,
  });

  // Voucher Settings
  const [voucherSettingsOpen, setVoucherSettingsOpen] = useState(false);
  const [voucherSettingsForm, setVoucherSettingsForm] = useState<VoucherSettingsDraft>({
    prefix: "V",
    startNumber: "1",
    endNumber: "999999",
  });

  // Projects
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  // Admin
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
    const projectIds = projects.data?.map(project => project.id) ?? [];
    const nextProjectId = resolveActiveProjectId(
      projectIds,
      activeProjectId,
      readActiveProjectId()
    );
    if (nextProjectId !== activeProjectId) setActiveProjectId(nextProjectId);
  }, [activeProjectId, projects.data]);

  function selectProject(projectId: number) {
    saveActiveProjectId(projectId);
    setActiveProjectId(projectId);
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

  const showBudgetAlertForTransaction = async (
    projectId: number,
    categoryId: number,
    type: "income" | "expense"
  ): Promise<"exceeded" | "early-warning" | "clear" | "unavailable"> => {
    if (type !== "expense") return "clear";
    try {
      const updatedOverview = await utils.finance.overview.fetch({ projectId });
      const alert = updatedOverview.budgetAlerts.find(
        item => item.categoryId === categoryId
      );
      if (alert) {
        toast.warning(`${alert.categoryName} ক্যাটাগরির বাজেট সীমা অতিক্রম হয়েছে`, {
          description: `${bdt(alert.spent)} খরচ হয়েছে; নির্ধারিত সীমার চেয়ে ${bdt(alert.exceededAmount)} বেশি।`,
          duration: 7000,
        });
        return "exceeded";
      }
      const earlyWarning = updatedOverview.budgetEarlyWarnings.find(
        item => item.categoryId === categoryId
      );
      if (earlyWarning) {
        toast.warning(
          `${earlyWarning.categoryName} ক্যাটাগরির বাজেটের ${earlyWarning.threshold}% খরচ হয়েছে`,
          {
            description: `${bdt(earlyWarning.spent)} খরচ হয়েছে; বাকি আছে ${bdt(earlyWarning.remainingAmount)}।`,
            duration: 7000,
          }
        );
        return "early-warning";
      }
      return "clear";
    } catch {
      toast.warning("বাজেট সতর্কতা যাচাই করা যায়নি", {
        description: "লেনদেনটি সংরক্ষিত হয়েছে। বর্তমান বাজেটের অবস্থা দেখতে ড্যাশবোর্ড রিফ্রেশ করুন।",
        duration: 7000,
      });
      return "unavailable";
    }
  };

  // Mutations
  const createProject = trpc.projects.create.useMutation({
    onSuccess: async project => {
      await refresh();
      setActiveProjectId(project.id);
      setProjectOpen(false);
      setProjectName("");
      toast.success("নতুন প্রজেক্ট তৈরি হয়েছে");
    },
    onError: error => toast.error(error.message),
  });

  const addTransaction = trpc.finance.addTransaction.useMutation({
    onSuccess: async (_transaction, input) => {
      await refresh();
      const budgetAlertStatus = await showBudgetAlertForTransaction(
        input.projectId,
        input.categoryId,
        input.type
      );
      resetTransaction();
      if (budgetAlertStatus === "clear") toast.success("লেনদেন সংরক্ষণ করা হয়েছে");
    },
    onError: error => toast.error(error.message),
  });

  const updateTransaction = trpc.finance.updateTransaction.useMutation({
    onSuccess: async (_transaction, input) => {
      await refresh();
      const budgetAlertStatus = await showBudgetAlertForTransaction(
        input.projectId,
        input.categoryId,
        input.type
      );
      resetTransaction();
      if (budgetAlertStatus === "clear") toast.success("লেনদেন আপডেট করা হয়েছে");
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

  const { logoUrl, uploadLogo, resetLogo, isCustom: isCustomLogo } = useAppLogo();
  const updateUserStatus = trpc.admin.updateUserStatus.useMutation({
    onSuccess: () => {
      toast.success("ব্যবহারকারীর অনুমোদনের অবস্থা আপডেট হয়েছে");
      adminUsers.refetch();
    },
    onError: error => {
      toast.error(error.message || "অবস্থা আপডেট করা যায়নি");
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
    setSmsInput("");
    setShowSmsHelper(false);
  }

  function handleApplySMS() {
    if (!smsInput.trim()) {
      toast.error("অনুগ্রহ করে SMS টেক্সট পেস্ট করুন");
      return;
    }
    const parsed = parseTransactionSMS(smsInput);
    if (parsed.amount) {
      const providerPaymentMap: Record<string, string> = {
        bkash: "bKash",
        nagad: "Nagad",
        rocket: "Rocket",
        bank: "Bank Transfer",
        cash: "Cash",
      };
      setTransactionForm(current => ({
        ...current,
        amount: String(parsed.amount),
        paymentMethod: providerPaymentMap[parsed.provider] || current.paymentMethod,
        note: parsed.suggestedNote || current.note,
      }));
      if (parsed.type) {
        setTransactionType(parsed.type);
      }
      toast.success("SMS থেকে টাকার অঙ্ক ও বিবরণ স্বয়ংক্রিয়ভাবে বসানো হয়েছে!");
      setSmsInput("");
      setShowSmsHelper(false);
    } else {
      toast.error("SMS থেকে টাকার পরিমাণ শনাক্ত করা যায়নি। অনুগ্রহ করে ম্যানুয়ালি ইনপুট দিন।");
    }
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
      dueAt: dueForm.dueAt ? new Date(`${dueForm.dueAt}T12:00:00Z`) : undefined,
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
      const { downloadAuditCsv, downloadAuditPdf } = await import("@/lib/auditLogExports");
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

  async function getMonthlyReportForExport() {
    if (!requireProject()) return;
    const result = await monthlyReport.refetch();
    if (!result.data) throw new Error("মাসিক রিপোর্টের ডেটা পাওয়া যায়নি");
    return result.data;
  }

  async function downloadMonthlyReport() {
    try {
      setIsReportDownloading(true);
      const report = await getMonthlyReportForExport();
      if (!report) return;
      const { downloadMonthlyReportPdf } = await import("@/lib/monthlyReportPdf");
      await downloadMonthlyReportPdf(report, reportType);
      const selectedReport = accountingReportOptions.find(option => option.value === reportType);
      toast.success(`${selectedReport?.label ?? "রিপোর্ট"} PDF ডাউনলোড হয়েছে`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "মাসিক রিপোর্ট তৈরি করা যায়নি"
      );
    } finally {
      setIsReportDownloading(false);
    }
  }

  async function shareMonthlyReport() {
    try {
      setIsReportSharing(true);
      const report = await getMonthlyReportForExport();
      if (!report) return;
      const { downloadMonthlyReportPdf, shareMonthlyReportPdf } = await import("@/lib/monthlyReportPdf");
      const shareResult = await shareMonthlyReportPdf(report, reportType);
      if (shareResult === "unavailable") {
        await downloadMonthlyReportPdf(report, reportType);
        toast.message(
          "এই ব্রাউজারে সরাসরি শেয়ার সমর্থিত নয়। PDF ডাউনলোড হয়েছে—ইমেইল বা WhatsApp-এ ফাইলটি সংযুক্ত করুন।",
          { duration: 7000 }
        );
        return;
      }
      toast.success("ডিভাইসের শেয়ার স্ক্রিন খোলা হয়েছে—ইমেইল বা WhatsApp বেছে নিন।", { duration: 6000 });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(
        error instanceof Error ? error.message : "রিপোর্ট শেয়ার করা যায়নি"
      );
    } finally {
      setIsReportSharing(false);
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
      <main id="overview" className="space-y-5 pb-12 sm:space-y-7">
        <DashboardHeader
          userName={user?.name}
          projects={projects.data}
          activeProjectId={activeProjectId}
          selectProject={selectProject}
          openNewTransaction={openNewTransaction}
          openVoucherSettings={openVoucherSettings}
          onOpenProjectDialog={() => setProjectOpen(true)}
          downloadExport={downloadExport}
          isExportFetching={exportData.isFetching}
          onOpenMonthlyReport={() => setMonthlyReportOpen(true)}
          isAdmin={user?.role === "admin"}
          onOpenAdmin={() => setAdminOpen(true)}
        />

        <QuickDataEntryBanner openNewTransaction={openNewTransaction} />

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

            {accountingSummary.data && (
              <AccountingSummarySection
                summary={accountingSummary.data}
                profitAndLoss={accountingSummary.data.profitAndLoss}
                financialPosition={accountingSummary.data.financialPosition}
                onOpenReport={() => setMonthlyReportOpen(true)}
              />
            )}

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.85fr)]">
              <MonthlyTrendChart trend={data.trend} />
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
                <AccountsPanel
                  accounts={data.accounts}
                  onAdd={() => {
                    resetAccount();
                    setAccountOpen(true);
                  }}
                  onEdit={openAccountEditor}
                  onDelete={id => deleteAccount.mutate({ projectId: activeProjectId!, id })}
                />
                <BudgetsPanel
                  budgets={data.budgets}
                  budgetAlerts={data.budgetAlerts}
                  budgetEarlyWarnings={data.budgetEarlyWarnings}
                  onOpenAddBudget={() => setBudgetOpen(true)}
                />
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

      {/* Dialogs */}
      <VoucherSettingsDialog
        open={voucherSettingsOpen}
        onOpenChange={setVoucherSettingsOpen}
        form={voucherSettingsForm}
        onChange={setVoucherSettingsForm}
        onSubmit={submitVoucherSettings}
        isPending={saveVoucherSettings.isPending}
        activeVoucherData={voucherSettings.data ?? data?.voucherSettings}
      />

      <TransactionDialog
        open={transactionOpen}
        onOpenChange={open => (open ? setTransactionOpen(true) : resetTransaction())}
        editingTransactionId={editingTransactionId}
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        transactionForm={transactionForm}
        setTransactionForm={setTransactionForm}
        categories={categories}
        accounts={data?.accounts}
        showSmsHelper={showSmsHelper}
        setShowSmsHelper={setShowSmsHelper}
        smsInput={smsInput}
        setSmsInput={setSmsInput}
        onApplySMS={handleApplySMS}
        onSubmit={submitTransaction}
        isPending={addTransaction.isPending || updateTransaction.isPending}
      />

      <DueDialog
        open={dueOpen}
        onOpenChange={open => {
          setDueOpen(open);
          if (!open) setDueForm(blankDue());
        }}
        form={dueForm}
        onChange={setDueForm}
        onSubmit={submitDue}
        isPending={addDue.isPending}
      />

      <SettlementDialog
        open={settlementOpen}
        onOpenChange={setSettlementOpen}
        form={settlementForm}
        onChange={setSettlementForm}
        accounts={data?.accounts}
        onSubmit={submitSettlement}
        isPending={settleDue.isPending}
      />

      <AccountDialog
        open={accountOpen}
        onOpenChange={open => (open ? setAccountOpen(true) : resetAccount())}
        editingAccountId={editingAccountId}
        form={accountForm}
        onChange={setAccountForm}
        onSubmit={submitAccount}
        isPending={addAccount.isPending || updateAccount.isPending}
      />

      <BudgetDialog
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        form={budgetForm}
        onChange={setBudgetForm}
        expenseCategories={expenseCategories}
        onSubmit={submitBudget}
        isPending={saveBudget.isPending}
      />

      <BillDialog
        open={billOpen}
        onOpenChange={open => (open ? setBillOpen(true) : resetBill())}
        editingBillId={editingBillId}
        form={billForm}
        onChange={setBillForm}
        onSubmit={submitBill}
        isPending={addBill.isPending || updateBill.isPending}
      />

      <ProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        projectName={projectName}
        setProjectName={setProjectName}
        onSubmit={event => {
          event.preventDefault();
          if (!projectName.trim()) return toast.error("প্রজেক্টের নাম দিন");
          createProject.mutate({ name: projectName });
        }}
        isPending={createProject.isPending}
      />

      <MonthlyReportDialog
        open={monthlyReportOpen}
        onOpenChange={setMonthlyReportOpen}
        reportMonthKey={reportMonthKey}
        setReportMonthKey={setReportMonthKey}
        reportType={reportType}
        setReportType={setReportType}
        onDownload={downloadMonthlyReport}
        onShare={shareMonthlyReport}
        isDownloading={isReportDownloading}
        isSharing={isReportSharing}
        activeProjectId={activeProjectId}
      />

      <AdminDialog
        open={adminOpen}
        onOpenChange={open => {
          setAdminOpen(open);
          if (!open) {
            setAdminVerified(false);
            setAdminPassword("");
          }
        }}
        adminVerified={adminVerified}
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        onVerify={event => {
          event.preventDefault();
          verifyAdmin.mutate({ password: adminPassword });
        }}
        isVerifying={verifyAdmin.isPending}
        auditSearch={auditSearch}
        setAuditSearch={setAuditSearch}
        auditDateRange={auditDateRange}
        setAuditDateRange={setAuditDateRange}
        auditActorRole={auditActorRole}
        setAuditActorRole={setAuditActorRole}
        auditActorUserId={auditActorUserId}
        setAuditActorUserId={setAuditActorUserId}
        onClearFilters={() => {
          setAuditDateRange(undefined);
          setAuditSearch("");
          setAuditActorUserId("all");
          setAuditActorRole("all");
        }}
        adminLogs={adminLogs}
        auditActivity={auditActivity}
        adminUsers={adminUsers}
        adminProjects={adminProjects}
        auditPage={auditPage}
        setAuditPage={setAuditPage}
        onDownloadAuditLogs={downloadAuditLogs}
        isAuditExporting={isAuditExporting}
        onUpdateUserStatus={(targetUserId, status) => {
          updateUserStatus.mutate({
            password: adminPassword || "",
            targetUserId,
            status,
          });
        }}
        isUpdatingUserStatus={updateUserStatus.isPending}
        logoUrl={logoUrl}
        onUploadLogo={async file => {
          try {
            await uploadLogo(file);
            toast.success("নতুন লোগো সফলভাবে আপলোড ও যুক্ত করা হয়েছে!");
          } catch (err: any) {
            toast.error(err.message || "লোগো আপলোড ব্যর্থ হয়েছে");
          }
        }}
        onResetLogo={() => {
          resetLogo();
          toast.success("ডিফল্ট লোগো পুনরুদ্ধার করা হয়েছে");
        }}
        isCustomLogo={isCustomLogo}
      />
    </DashboardLayout>
  );
}
