export type PrintFirm = {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
};

export type PrintProject = {
  id: number;
  name: string;
};

export type PrintTransaction = {
  id: number;
  projectId: number;
  accountId: number | null;
  categoryId: number;
  type: "income" | "expense";
  amount: number | string;
  voucherNo: string | null;
  reason: string | null;
  paymentMethod: string;
  note: string | null;
  occurredAt: Date | string;
  createdAt: Date | string;
  categoryName: string;
  accountName: string | null;
};

export type PrintAccount = {
  id: number;
  name: string;
  type: "cash" | "bank" | "mobile";
  openingBalance: number;
  currentBalance: number;
};

export type StatementData = {
  project: PrintProject;
  firm: PrintFirm;
  items: PrintTransaction[];
  accounts: PrintAccount[];
  totals: {
    count: number;
    income: number;
    expense: number;
    netAmount: number;
    openingBalance: number;
    closingBalance: number;
  };
};

export type VoucherPrintData = {
  project: PrintProject;
  firm: PrintFirm;
  transaction: PrintTransaction;
};

export type StatementKind =
  | "daily"
  | "range"
  | "project"
  | "firm"
  | "income"
  | "expense"
  | "category"
  | "cashbook"
  | "ledger"
  | "yearly";

export const STATEMENT_KINDS: Array<{ value: StatementKind; label: string }> = [
  { value: "daily", label: "দৈনিক আয়-ব্যয় বিবরণী" },
  { value: "range", label: "তারিখ রেঞ্জ বিবরণী" },
  { value: "project", label: "প্রজেক্টভিত্তিক বিবরণী" },
  { value: "firm", label: "ফার্মভিত্তিক বিবরণী" },
  { value: "income", label: "আয় (আমানত) বিবরণী" },
  { value: "expense", label: "ব্যয় (খরচ) বিবরণী" },
  { value: "category", label: "ক্যাটাগরি/খাতভিত্তিক বিবরণী" },
  { value: "cashbook", label: "ক্যাশ বুক" },
  { value: "ledger", label: "লেজার / অ্যাকাউন্ট" },
  { value: "yearly", label: "মাসিক/বার্ষিক সারসংক্ষেপ" },
];