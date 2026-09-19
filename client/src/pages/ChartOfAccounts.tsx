import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useActiveProject } from "@/lib/activeProject";
import { Plus, ChevronDown, ChevronRight, FilePlus, Edit2, Trash2, Loader2, Banknote, CreditCard, LandPlot, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useState, useMemo } from "react";

interface CoaAccount {
  id: number;
  code: string;
  name: string;
  nameBn?: string | null;
  accountTypeId: number;
  currentBalance: string;
  isDetail: boolean;
  isActive: boolean;
  parentId: number | null;
  children: CoaAccount[];
}

interface AccountType {
  id: number;
  code: string;
  name: string;
  nameBn?: string | null;
  normalBalance: "debit" | "credit";
  sortOrder: number;
  isSystem: boolean;
  createdAt: Date;
}

const accountTypeColors: Record<string, { label: string; color: string; icon: any }> = {
  ASSET: { label: "Asset", color: "bg-green-100 text-green-800", icon: Banknote },
  LIABILITY: { label: "Liability", color: "bg-red-100 text-red-800", icon: CreditCard },
  EQUITY: { label: "Equity", color: "bg-purple-100 text-purple-800", icon: LandPlot },
  REVENUE: { label: "Revenue", color: "bg-blue-100 text-blue-800", icon: TrendingUp },
  EXPENSE: { label: "Expense", color: "bg-orange-100 text-orange-800", icon: TrendingDown },
};

function AccountTreeNode({
  account,
  accountTypes,
  onEdit,
  onAddChild,
  onDelete,
  onClick,
  level = 0,
}: {
  account: CoaAccount;
  accountTypes: AccountType[];
  onEdit: (acc: CoaAccount) => void;
  onAddChild: (parent: CoaAccount) => void;
  onDelete: (id: number) => void;
  onClick: (acc: CoaAccount) => void;
  level: number;
}) {
  const typeInfo = accountTypes.find(t => t.id === account.accountTypeId);
  const typeMeta = typeInfo ? accountTypeColors[typeInfo.code] : undefined;
  const hasChildren = account.children.length > 0;
  const isLeaf = !hasChildren;

  return (
    <div className="relative">
      <Collapsible open={!isLeaf} className="w-full">
        <CollapsibleTrigger
          onClick={(e) => {
            e.stopPropagation();
            onClick(account);
          }}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#173f36]
            hover:bg-[#eef7f1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8bd5a0]
            transition-colors cursor-pointer select-none
            ${level > 0 ? "pl-8" : ""} ${level > 1 ? "pl-16" : ""} ${level > 2 ? "pl-24" : ""}
          `}
        >
          {hasChildren ? (
            <ChevronDown className="h-4 w-4 text-[#8da69c] transition-transform duration-200 data-[state=open]:rotate-90" />
          ) : (
            <span className="h-4 w-4" />
          )}
          <span className="flex-1 min-w-0 truncate font-mono text-[#3d5a4f]">{account.code}</span>
          <span className="flex-1 min-w-0 truncate">{account.name}</span>
          {account.nameBn && <span className="text-xs text-[#8da69c] hidden sm:inline">({account.nameBn})</span>}
          {typeMeta && (
            <Badge variant="secondary" className={`${typeMeta.color} text-xs`}>
              {typeMeta.label}
            </Badge>
          )}
          <span className={`font-mono tabular-nums ${Number(account.currentBalance) < 0 ? "text-red-600" : "text-[#173f36]"}`}>
            {Number(account.currentBalance).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#5f786d] hover:text-[#173f36] hover:bg-[#eef7f1]"
              onClick={(e) => { e.stopPropagation(); onAddChild(account); }}
              aria-label="Add child account"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#5f786d] hover:text-[#173f36] hover:bg-[#eef7f1]"
              onClick={(e) => { e.stopPropagation(); onEdit(account); }}
              aria-label="Edit account"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#5f786d] hover:text-red-600 hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); onDelete(account.id); }}
              aria-label="Delete account"
              disabled={hasChildren}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="w-full">
          <div className="pl-4 border-l border-[#d8f2dd] mt-1 space-y-1">
            {account.children.map(child => (
              <AccountTreeNode
                key={child.id}
                account={child}
                accountTypes={accountTypes}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onClick={onClick}
                level={level + 1}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function AccountFormDialog({
  open,
  onOpenChange,
  title,
  accountTypes,
  defaultValues,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  accountTypes: { id: number; code: string; name: string }[];
  defaultValues?: Partial<{
    accountTypeId: number;
    parentId: number;
    code: string;
    name: string;
    nameBn: string;
    description: string;
    isDetail: boolean;
    openingBalance: number;
  }>;
  onSubmit: (values: {
    accountTypeId: number;
    parentId?: number | null;
    code: string;
    name: string;
    nameBn?: string;
    description?: string;
    isDetail: boolean;
    openingBalance: number;
  }) => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {"*"} fields are required
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(defaultValues as any); }} className="space-y-4">
          <div className="grid gap-4">
            <div>
              <Label htmlFor="accountTypeId">Account Type *</Label>
              <Select
                value={defaultValues?.accountTypeId?.toString() || ""}
                onValueChange={() => {}}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map(t => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.name} ({t.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="parentId">Parent Account</Label>
              <Select value={defaultValues?.parentId?.toString() || ""} onValueChange={() => {}}>
                <SelectTrigger>
                  <SelectValue placeholder="None (root level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None (root level)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="code">Code *</Label>
              <Input id="code" placeholder="e.g., 1110" value={defaultValues?.code || ""} required />
            </div>
            <div>
              <Label htmlFor="name">Name (EN) *</Label>
              <Input id="name" placeholder="e.g., Cash in Hand" value={defaultValues?.name || ""} required />
            </div>
            <div>
              <Label htmlFor="nameBn">Name (BN)</Label>
              <Input id="nameBn" placeholder="e.g., হাতে নগদ" value={defaultValues?.nameBn || ""} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input id="description" placeholder="Optional description" value={defaultValues?.description || ""} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDetail"
                checked={defaultValues?.isDetail ?? true}
                className="h-4 w-4 rounded border-[#c9dcd0] text-[#166534] focus:ring-[#8bd5a0]"
              />
              <Label htmlFor="isDetail" className="text-sm font-normal cursor-pointer">
                Is Detail Account (can post entries)
              </Label>
            </div>
            <div>
              <Label htmlFor="openingBalance">Opening Balance</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={defaultValues?.openingBalance?.toString() || "0"}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ChartOfAccounts() {
  const { isAuthenticated, user } = useAuth();
  const { activeProjectId, projects, isLoading: projectsLoading, selectProject } = useActiveProject();

  const utils = trpc.useUtils();

  const overview = trpc.finance.overview.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const accountTypesQuery = trpc.finance.getAccountTypes.useQuery({ projectId: activeProjectId ?? 0 }, { enabled: isAuthenticated && activeProjectId !== null });
  const coaTreeQuery = trpc.finance.getChartOfAccountsTree.useQuery(
    { projectId: activeProjectId ?? 0 },
    { enabled: isAuthenticated && activeProjectId !== null }
  );

  const createAccountMutation = trpc.finance.createChartOfAccount.useMutation({
    onSuccess: () => {
      toast.success("অ্যাকাউন্ট তৈরি করা হয়েছে");
      utils.finance.getChartOfAccountsTree.invalidate({ projectId: activeProjectId! });
      utils.finance.getAccountTypes.invalidate();
    },
    onError: (err) => toast.error(err.message || "তিনে তৈরি করা যায়নি"),
  });

  const updateAccountMutation = trpc.finance.updateChartOfAccount.useMutation({
    onSuccess: () => {
      toast.success("অ্যাকাউন্ট আপডেট করা হয়েছে");
      utils.finance.getChartOfAccountsTree.invalidate({ projectId: activeProjectId! });
    },
    onError: (err) => toast.error(err.message || "আপডেট করা যায়নি"),
  });

  const deleteAccountMutation = trpc.finance.deleteChartOfAccount.useMutation({
    onSuccess: () => {
      toast.success("অ্যাকাউন্ট মুছে ফেলা হয়েছে");
      utils.finance.getChartOfAccountsTree.invalidate({ projectId: activeProjectId! });
    },
    onError: (err) => toast.error(err.message || "মুছে ফেলা যায়নি"),
  });

  const seedCoAMutation = trpc.finance.seedChartOfAccounts.useMutation({
    onSuccess: () => {
      toast.success("ডিফল্ট চার্ট অফ অ্যাকাউন্টস তৈরি করা হয়েছে");
      utils.finance.getChartOfAccountsTree.invalidate({ projectId: activeProjectId! });
    },
    onError: (err) => toast.error(err.message || "তিনে তৈরি করা যায়নি"),
  });

  const [editingAccount, setEditingAccount] = useState<CoaAccount | null>(null);
  const [addingChildTo, setAddingChildTo] = useState<CoaAccount | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleEdit = (acc: CoaAccount) => setEditingAccount(acc);
  const handleAddChild = (acc: CoaAccount) => setAddingChildTo(acc);
  const handleDelete = (id: number) => setDeleteConfirmId(id);
  const handleClick = (acc: CoaAccount) => { /* could show detail drawer */ };

  const accountTypesData = accountTypesQuery.data ?? [];
  const accountTypes = accountTypesData.map(t => ({ id: t.id, code: t.code, name: t.name }));

  const buildAccountTree = (accounts: any[]): CoaAccount[] => {
    const accountMap = new Map<number, CoaAccount>();
    accounts.forEach(a => {
      accountMap.set(a.id, {
        id: a.id,
        code: a.code,
        name: a.name,
        nameBn: a.nameBn ?? null,
        accountTypeId: a.accountTypeId,
        currentBalance: a.currentBalance,
        isDetail: a.isDetail,
        isActive: a.isActive,
        parentId: a.parentId,
        children: [],
      });
    });

    const roots: CoaAccount[] = [];
    accounts.forEach(acc => {
      const withChildren = accountMap.get(acc.id)!;
      if (acc.parentId && accountMap.has(acc.parentId)) {
        accountMap.get(acc.parentId)!.children.push(withChildren);
      } else {
        roots.push(withChildren);
      }
    });
    return roots;
  };

  const coaTree = useMemo(() => buildAccountTree(coaTreeQuery.data ?? []), [coaTreeQuery.data]);

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

if (overview.isLoading || projectsLoading || coaTreeQuery.isLoading || accountTypesQuery.isLoading) {
    return (
      <DashboardLayout>
        <main className="mx-auto w-full max-w-6xl space-y-7 pb-12">
          <div className="finance-card p-8 text-center text-sm text-[#668076]">চার্ট অফ অ্যাকাউন্টস লোড হচ্ছে…</div>
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
              <RefreshCw className="h-4 w-4" />
              ড্যাশবোর্ডে ফিরুন
            </a>
          </div>
          <p className="section-kicker">অ্যাকাউন্টিং</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#173f36]">চার্ট অফ অ্যাকাউন্টস</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f786d]">
            আপনার হিসাবের কোড, নাম ও ব্যালেন্সসহ ক্যাটাগরি-ভিত্তিক হিয়ারার্কিক্যাল অ্যাকাউন্ট স্ট্রাকচার।
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {projectSelector}
            <Button
              variant="outline"
              onClick={() => seedCoAMutation.mutate({ projectId: activeProjectId! })}
              disabled={seedCoAMutation.isPending}
              className="gap-2"
            >
              {seedCoAMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FilePlus className="h-4 w-4 mr-2" />}
              ডিফল্ট CoA তৈরি করুন
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>অ্যাকাউন্ট ট্রি</CardTitle>
              <CardDescription>ক্লিক করুন বিস্তারিত দেখতে, হভার করুন অ্যাকশন দেখতে</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> নতুন অ্যাকাউন্ট
                </Button>
              </DialogTrigger>
              <AccountFormDialog
                open={!!addingChildTo || !!editingAccount}
                onOpenChange={(open) => { if (!open) { setAddingChildTo(null); setEditingAccount(null); } }}
                title={addingChildTo ? `চাইল্ড অ্যাকাউন্ট যোগ করুন: ${addingChildTo.code} - ${addingChildTo.name}` : editingAccount ? "অ্যাকাউন্ট সম্পাদনা করুন" : "নতুন অ্যাকাউন্ট তৈরি করুন"}
                accountTypes={accountTypes}
                defaultValues={{
                  accountTypeId: addingChildTo?.accountTypeId || editingAccount?.accountTypeId,
                  parentId: addingChildTo?.id ?? editingAccount?.parentId ?? undefined,
                  code: "",
                  name: "",
                  nameBn: "",
                  description: "",
                  isDetail: true,
                  openingBalance: 0,
                }}
                onSubmit={async (values) => {
                  if (editingAccount) {
                    updateAccountMutation.mutate({
                      projectId: activeProjectId!,
                      accountId: editingAccount.id,
                      ...values,
                    });
                    setEditingAccount(null);
                  } else {
                    createAccountMutation.mutate({
                      projectId: activeProjectId!,
                      ...values,
                      parentId: addingChildTo?.id ?? (values.parentId ?? undefined),
                    });
                    setAddingChildTo(null);
                  }
                }}
                isSubmitting={createAccountMutation.isPending || updateAccountMutation.isPending}
              />
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            {coaTree.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#668076]">
                কোনো অ্যাকাউন্ট নেই। <Button variant="link" className="p-0" onClick={() => seedCoAMutation.mutate({ projectId: activeProjectId! })}>
                  ডিফল্ট CoA তৈরি করুন
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-[#eef7f1]">
                {coaTree.map(root => (
                  <AccountTreeNode
                    key={root.id}
                    account={root}
                    accountTypes={accountTypesData}
                    onEdit={handleEdit}
                    onAddChild={handleAddChild}
                    onDelete={handleDelete}
                    onClick={handleClick}
                    level={0}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {deleteConfirmId && (
          <Dialog open onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>অ্যাকাউন্ট মুছুন?</DialogTitle>
                <DialogDescription>এই অ্যাকাউন্ট চিরকালের জন্য মুছে যাবে। এটি পূর্বাবস্থায় ফেরানো যাবে না।</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>বাতিল</Button>
                <Button variant="destructive" onClick={() => { deleteAccountMutation.mutate({ projectId: activeProjectId!, accountId: deleteConfirmId! }); setDeleteConfirmId(null); }}>
                  মুছুন
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </DashboardLayout>
  );
}