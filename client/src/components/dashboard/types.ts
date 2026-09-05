export type TransactionDraft = {
  amount: string;
  categoryId: string;
  accountId: string;
  paymentMethod: string;
  occurredAt: string;
  note: string;
};

export type DueDraft = {
  type: "debt" | "receivable";
  counterparty: string;
  amount: string;
  note: string;
  openedAt: string;
  dueAt: string;
};

export type SettlementDraft = {
  dueId: number;
  accountId: string;
  amount: string;
  note: string;
  occurredAt: string;
};

export type AccountDraft = {
  name: string;
  type: "cash" | "bank" | "mobile";
  openingBalance: string;
};

export type BudgetDraft = {
  categoryId: string;
  amount: string;
};

export type BillDraft = {
  title: string;
  amount: string;
  dueAt: string;
  isPaid: boolean;
};

export type VoucherSettingsDraft = {
  prefix: string;
  startNumber: string;
  endNumber: string;
};

export const bdt = (value: number | string) =>
  `৳ ${new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

export const today = () => new Date().toISOString().slice(0, 10);

export const monthText = (key: string) =>
  new Intl.DateTimeFormat("bn-BD", { month: "short" }).format(
    new Date(`${key}-01T12:00:00Z`)
  );

export const dateText = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

export const auditActionText = (action: string) =>
  action === "create"
    ? "তৈরি"
    : action === "update"
      ? "আপডেট"
      : action === "delete"
        ? "মুছে ফেলা"
        : action;

export const blankTransaction = (): TransactionDraft => ({
  amount: "",
  categoryId: "",
  accountId: "none",
  paymentMethod: "Cash",
  occurredAt: today(),
  note: "",
});

export const blankDue = (): DueDraft => ({
  type: "debt",
  counterparty: "",
  amount: "",
  note: "",
  openedAt: today(),
  dueAt: "",
});
