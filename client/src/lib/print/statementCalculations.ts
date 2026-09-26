import type { PrintTransaction, StatementData } from "./types";

export type RunningRow = PrintTransaction & {
  runningBalance: number;
};

export function toNumber(value: number | string): number {
  return Number(value || 0);
}

/** Chronological running balance: opening balance adjusted by each transaction. */
export function withRunningBalance(
  items: PrintTransaction[],
  openingBalance: number
): RunningRow[] {
  let balance = openingBalance;
  return items.map(item => {
    const amount = toNumber(item.amount);
    balance += item.type === "income" ? amount : -amount;
    return { ...item, runningBalance: balance };
  });
}

export type DayAggregate = {
  dateKey: string;
  dateLabel: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

export function aggregateByDay(items: PrintTransaction[]): DayAggregate[] {
  const formatter = new Intl.DateTimeFormat("bn-BD", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const groups = new Map<string, DayAggregate>();
  for (const item of items) {
    const date = new Date(item.occurredAt);
    const dateKey = date.toISOString().slice(0, 10);
    const amount = toNumber(item.amount);
    const group =
      groups.get(dateKey) ??
      ({
        dateKey,
        dateLabel: formatter.format(date),
        income: 0,
        expense: 0,
        net: 0,
        count: 0,
      } as DayAggregate);
    if (item.type === "income") group.income += amount;
    else group.expense += amount;
    group.net = group.income - group.expense;
    group.count += 1;
    groups.set(dateKey, group);
  }
  return Array.from(groups.values());
}

export type CategoryAggregate = {
  name: string;
  type: "income" | "expense";
  count: number;
  total: number;
};

export function aggregateByCategory(
  items: PrintTransaction[]
): CategoryAggregate[] {
  const groups = new Map<string, CategoryAggregate>();
  for (const item of items) {
    const key = `${item.categoryName}|${item.type}`;
    const amount = toNumber(item.amount);
    const group =
      groups.get(key) ??
      ({
        name: item.categoryName,
        type: item.type,
        count: 0,
        total: 0,
      } as CategoryAggregate);
    group.count += 1;
    group.total += amount;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, "bn")
  );
}

export type MonthSummaryRow = {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  net: number;
  count: number;
};

export function monthlySummary(items: PrintTransaction[]): MonthSummaryRow[] {
  const formatter = new Intl.DateTimeFormat("bn-BD", {
    year: "numeric",
    month: "long",
  });
  const groups = new Map<string, MonthSummaryRow>();
  for (const item of items) {
    const date = new Date(item.occurredAt);
    const monthKey = date.toISOString().slice(0, 7);
    const monthLabel = formatter.format(date);
    const amount = toNumber(item.amount);
    const group =
      groups.get(monthKey) ??
      ({
        monthKey,
        monthLabel,
        income: 0,
        expense: 0,
        net: 0,
        count: 0,
      } as MonthSummaryRow);
    if (item.type === "income") group.income += amount;
    else group.expense += amount;
    group.net = group.income - group.expense;
    group.count += 1;
    groups.set(monthKey, group);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

export function periodLabelFor(data: StatementData): string {
  return `${data.project.name} · চলমান`;
}

export const STATEMENT_FILTERS_LABEL = {
  daily: "নির্দিষ্ট দিন",
  range: "তারিখ রেঞ্জ",
  project: "প্রজেক্টভিত্তিক",
  firm: "ফার্মভিত্তিক",
  income: "শুধু আয়/আমানত",
  expense: "শুধু ব্যয়/খরচ",
  category: "ক্যাটাগরি/খাতভিত্তিক",
  cashbook: "ক্যাশ বুক",
  ledger: "লেজার/অ্যাকাউন্ট",
  yearly: "মাসিক/বার্ষিক সারসংক্ষেপ",
} as const;
