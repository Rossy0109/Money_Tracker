import {
  escapeHtml,
  firmHeaderHtml,
  moneyBn,
  noDataHtml,
  numberBn,
  printDate,
  printDateTime,
  reportGeneratedMeta,
  signatureBlockHtml,
  totalsTableHtml,
} from "./layout";
import {
  aggregateByCategory,
  aggregateByDay,
  type CategoryAggregate,
  type RunningRow,
  monthlySummary,
  withRunningBalance,
} from "./statementCalculations";
import type { StatementData, StatementKind } from "./types";

type BuildOptions = {
  kind: StatementKind;
  periodLabel: string;
  title: string;
  filteredBy?: string;
  showRunningBalance?: boolean;
};

function transactionTableHtml(
  rows: RunningRow[],
  options: {
    showIncomeExpenseColumns: boolean;
    showRunningBalance: boolean;
  }
): string {
  const { showIncomeExpenseColumns, showRunningBalance } = options;
  const rowCols = 6 + (showIncomeExpenseColumns ? 2 : 0) + (showRunningBalance ? 1 : 0);
  const rowsHtml = rows
    .map((row, index) => {
      const typeLabel = row.type === "income" ? "আয়" : "ব্যয়";
      const income = row.type === "income" ? moneyBn(row.amount) : "—";
      const expense = row.type === "expense" ? moneyBn(row.amount) : "—";
      return `<tr>
        <td class="ser">${index + 1}</td>
        <td class="date">${printDate(row.occurredAt)}</td>
        <td>${escapeHtml(row.voucherNo || "—")}</td>
        <td>${typeLabel}</td>
        <td>${escapeHtml(row.note?.trim() || "—")}</td>
        <td>${escapeHtml(row.categoryName)}</td>
        ${
          showIncomeExpenseColumns
            ? `<td class="num">${income}</td><td class="num">${expense}</td>`
            : ""
        }
        ${showRunningBalance ? `<td class="num">${moneyBn(row.runningBalance)}</td>` : ""}
      </tr>`;
    })
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th class="date">তারিখ/সময়</th>
        <th>ভাউচার</th>
        <th>ধরন</th>
        <th>বিবরণ</th>
        <th>ক্যাটাগরি/খাত</th>
        ${
          showIncomeExpenseColumns
            ? '<th class="num">আয়/আমানত</th><th class="num">ব্যয়/খরচ</th>'
            : ""
        }
        ${showRunningBalance ? '<th class="num">চলমান জের</th>' : ""}
      </tr>
    </thead>
    <tbody>${
      rowsHtml || `<tr><td colspan="${rowCols}">${noDataHtml()}</td></tr>`
    }</tbody>
  </table>`;
}

function categoryTableHtml(rows: CategoryAggregate[]): string {
  const body = rows
    .map(
      (row, index) => `<tr>
        <td class="ser">${index + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.type === "income" ? "আয়" : "ব্যয়"}</td>
        <td class="num">${numberBn(row.count)} টি</td>
        <td class="num">${moneyBn(row.total)}</td>
      </tr>`
    )
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th>ক্যাটাগরি/খাত</th>
        <th>ধরন</th>
        <th class="num">লেনদেন সংখ্যা</th>
        <th class="num">মোট পরিমাণ</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="5">${noDataHtml()}</td></tr>`}</tbody>
  </table>`;
}

function daySummaryTableHtml(rows: ReturnType<typeof aggregateByDay>): string {
  const body = rows
    .map(
      (row, index) => `<tr>
        <td class="ser">${index + 1}</td>
        <td>${escapeHtml(row.dateLabel)}</td>
        <td class="num">${numberBn(row.count)} টি</td>
        <td class="num">${moneyBn(row.income)}</td>
        <td class="num">${moneyBn(row.expense)}</td>
        <td class="num">${moneyBn(row.net)}</td>
      </tr>`
    )
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th>তারিখ</th>
        <th class="num">লেনদেন</th>
        <th class="num">মোট আয়/আমানত</th>
        <th class="num">মোট ব্যয়/খরচ</th>
        <th class="num">নিট</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="6">${noDataHtml()}</td></tr>`}</tbody>
  </table>`;
}

function monthlySummaryTableHtml(
  rows: ReturnType<typeof monthlySummary>
): string {
  const body = rows
    .map(
      (row, index) => `<tr>
        <td class="ser">${index + 1}</td>
        <td>${escapeHtml(row.monthLabel)}</td>
        <td class="num">${numberBn(row.count)} টি</td>
        <td class="num">${moneyBn(row.income)}</td>
        <td class="num">${moneyBn(row.expense)}</td>
        <td class="num">${moneyBn(row.net)}</td>
      </tr>`
    )
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th>মাস</th>
        <th class="num">লেনদেন</th>
        <th class="num">মোট আয়/আমানত</th>
        <th class="num">মোট ব্যয়/খরচ</th>
        <th class="num">নিট ব্যালেন্স</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="6">${noDataHtml()}</td></tr>`}</tbody>
  </table>`;
}

function cashBookTableHtml(rows: RunningRow[]): string {
  const body = rows
    .map(
      (row, index) => `<tr>
        <td class="ser">${index + 1}</td>
        <td class="date">${printDate(row.occurredAt)}</td>
        <td>${escapeHtml(row.voucherNo || "—")}</td>
        <td>${escapeHtml(row.note?.trim() || row.categoryName)}</td>
        <td class="num">${row.type === "income" ? moneyBn(row.amount) : "—"}</td>
        <td class="num">${row.type === "expense" ? moneyBn(row.amount) : "—"}</td>
        <td class="num">${moneyBn(row.runningBalance)}</td>
      </tr>`
    )
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th class="date">তারিখ</th>
        <th>ভাউচার</th>
        <th>বিবরণ</th>
        <th class="num">প্রাপ্তি (জমা)</th>
        <th class="num">প্রদান (খরচ)</th>
        <th class="num">চলমান জের</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="7">${noDataHtml()}</td></tr>`}</tbody>
  </table>`;
}

function ledgerTableHtml(rows: RunningRow[]): string {
  const body = rows
    .map(
      (row, index) => `<tr>
        <td class="ser">${index + 1}</td>
        <td class="date">${printDate(row.occurredAt)}</td>
        <td>${escapeHtml(row.voucherNo || "—")}</td>
        <td>${escapeHtml(row.note?.trim() || row.categoryName)}</td>
        <td>${escapeHtml(row.categoryName)}</td>
        <td class="num">${row.type === "income" ? moneyBn(row.amount) : "—"}</td>
        <td class="num">${row.type === "expense" ? moneyBn(row.amount) : "—"}</td>
        <td class="num">${moneyBn(row.runningBalance)}</td>
      </tr>`
    )
    .join("");
  return `<table class="report-table">
    <thead>
      <tr>
        <th class="ser">ক্র.</th>
        <th class="date">তারিখ</th>
        <th>ভাউচার</th>
        <th>বিবরণ</th>
        <th>খাত</th>
        <th class="num">ডেবিট (প্রাপ্তি)</th>
        <th class="num">ক্রেডিট (প্রদান)</th>
        <th class="num">জের</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="8">${noDataHtml()}</td></tr>`}</tbody>
  </table>`;
}

export function buildStatementHtml(
  data: StatementData,
  options: BuildOptions
): string {
  const { kind, periodLabel, title, filteredBy, showRunningBalance } = options;
  const totals = data.totals;
  const runningRows = withRunningBalance(data.items, totals.openingBalance);
  const meta = [...reportGeneratedMeta(data.firm, data.project, periodLabel)];
  if (filteredBy) meta.push({ label: "ফিল্টার", value: filteredBy });

  const dailyAgg = aggregateByDay(data.items);
  const categoryAgg = aggregateByCategory(data.items);
  const monthlyAgg = monthlySummary(data.items);

  let bodyHtml = "";
  let totalsHtml = "";

  switch (kind) {
    case "daily":
    case "range":
    case "project":
    case "firm":
      bodyHtml = transactionTableHtml(runningRows, {
        showIncomeExpenseColumns: true,
        showRunningBalance: showRunningBalance ?? true,
      });
      totalsHtml = totalsTableHtml([
        { label: "মোট আয়/আমানত", value: moneyBn(totals.income), tone: "income" },
        { label: "মোট ব্যয়/খরচ", value: moneyBn(totals.expense), tone: "expense" },
        { label: "নিট পরিমাণ", value: moneyBn(totals.netAmount) },
        { label: "শেষ জের (Closing Balance)", value: moneyBn(totals.closingBalance), tone: "grand" },
      ]);
      break;
    case "income":
      bodyHtml = transactionTableHtml(
        runningRows.filter(row => row.type === "income"),
        { showIncomeExpenseColumns: false, showRunningBalance: true }
      );
      totalsHtml = totalsTableHtml([
        { label: "মোট আয়/আমানত", value: moneyBn(totals.income), tone: "grand" },
      ]);
      break;
    case "expense":
      bodyHtml = transactionTableHtml(
        runningRows.filter(row => row.type === "expense"),
        { showIncomeExpenseColumns: false, showRunningBalance: true }
      );
      totalsHtml = totalsTableHtml([
        { label: "মোট ব্যয়/খরচ", value: moneyBn(totals.expense), tone: "grand" },
      ]);
      break;
    case "category": {
      bodyHtml = categoryTableHtml(categoryAgg);
      const categoryTotal = categoryAgg.reduce((sum, row) => sum + row.total, 0);
      totalsHtml = totalsTableHtml([
        {
          label: `মোট ${numberBn(categoryAgg.length)} টি খাত`,
          value: moneyBn(categoryTotal),
          tone: "grand",
        },
      ]);
      break;
    }
    case "cashbook":
      bodyHtml = cashBookTableHtml(runningRows);
      totalsHtml = totalsTableHtml([
        { label: "উদ্বোধনী জের (Opening Balance)", value: moneyBn(totals.openingBalance) },
        { label: "মোট প্রাপ্তি (Receipts)", value: moneyBn(totals.income), tone: "income" },
        { label: "মোট প্রদান (Payments)", value: moneyBn(totals.expense), tone: "expense" },
        { label: "সমাপনী জের (Closing Balance)", value: moneyBn(totals.closingBalance), tone: "grand" },
      ]);
      break;
    case "ledger":
      bodyHtml = ledgerTableHtml(runningRows);
      totalsHtml = totalsTableHtml([
        { label: "উদ্বোধনী জের", value: moneyBn(totals.openingBalance) },
        { label: "মোট ডেবিট (প্রাপ্তি)", value: moneyBn(totals.income), tone: "income" },
        { label: "মোট ক্রেডিট (প্রদান)", value: moneyBn(totals.expense), tone: "expense" },
        { label: "জের (Balance)", value: moneyBn(totals.closingBalance), tone: "grand" },
      ]);
      break;
    case "yearly":
      bodyHtml = [
        '<p class="doc-subtitle">মাসভিত্তিক সারসংক্ষেপ</p>',
        monthlySummaryTableHtml(monthlyAgg),
        '<p class="doc-subtitle" style="margin-top:14px;">খাতভিত্তিক সারসংক্ষেপ</p>',
        categoryTableHtml(categoryAgg),
      ].join("");
      totalsHtml = totalsTableHtml([
        { label: "মোট আয়/আমানত", value: moneyBn(totals.income), tone: "income" },
        { label: "মোট ব্যয়/খরচ", value: moneyBn(totals.expense), tone: "expense" },
        { label: "নিট ব্যালেন্স", value: moneyBn(totals.netAmount) },
        { label: "প্রজেক্টে মোট লেনদেন", value: `${totals.count} টি` },
      ]);
      break;
    default:
      break;
  }

  return `
  ${firmHeaderHtml(data.firm, {
    title,
    meta,
    subtitle:
      kind === "daily"
        ? "দৈনিক আয় ও ব্যয়ের সম্পূর্ণ বিবরণী"
        : undefined,
  })}
  ${bodyHtml}
  ${totalsHtml}
  ${signatureBlockHtml()}
  <p class="notes">এটি সঞ্চিত ডেটা থেকে স্বয়ংক্রিয়ভাবে গণনা করা বিবরণী। কোনো লেনদেন তৈরি, পরিবর্তন বা মুছে ফেলা হয়নি। তৈরি: ${printDateTime(new Date())}</p>`;
}

export function buildDailyAutoSummaryHtml(
  data: StatementData,
  periodLabel: string,
  title: string
): string {
  const rowsHtml = aggregateByDay(data.items)
    .map(
      row => `<div class="meta-row"><span class="meta-label">${escapeHtml(row.dateLabel)}</span><span class="meta-value">${moneyBn(row.income)} / ${moneyBn(row.expense)}</span></div>`
    )
    .join("");
  return `<div class="meta-grid">${rowsHtml}</div>`;
}