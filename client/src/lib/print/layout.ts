import type { PrintFirm, PrintProject } from "./types";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const moneyBn = (value: number | string) =>
  `৳ ${Number(value || 0).toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const numberBn = (value: number | string) =>
  Number(value || 0).toLocaleString("bn-BD", {
    maximumFractionDigits: 2,
  });

const dayFormatter = new Intl.DateTimeFormat("bn-BD", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("bn-BD", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const printDate = (value: Date | string) =>
  dayFormatter.format(new Date(value));

export const printDateTime = (value: Date | string) =>
  dateTimeFormatter.format(new Date(value));

export function firmHeaderHtml(
  firm: PrintFirm,
  options: {
    title: string;
    meta: Array<{ label: string; value: string }>;
    subtitle?: string;
  }
): string {
  const contactLines = [
    firm.address,
    [firm.phone, firm.email].filter(Boolean).join("  |  "),
  ]
    .filter(Boolean)
    .join("\n");
  return `
  <div class="firm-header">
    <img src="/logo.png" alt="লোগো" class="firm-logo" onerror="this.style.display='none'" />
    <div class="firm-block">
      <div class="firm-name">${escapeHtml(firm.name)}</div>
      <div class="firm-tagline">${escapeHtml(firm.tagline)}</div>
    </div>
    <div class="firm-contact">${escapeHtml(contactLines || " ")}</div>
  </div>
  <h1 class="doc-title">${escapeHtml(options.title)}</h1>
  ${options.subtitle ? `<p class="doc-subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
  <div class="meta-grid">
    ${options.meta
      .map(
        row =>
          `<div class="meta-row"><span class="meta-label">${escapeHtml(row.label)}</span><span class="meta-value">${escapeHtml(row.value)}</span></div>`
      )
      .join("")}
  </div>`;
}

export function signatureBlockHtml(): string {
  return `
  <div class="signatures">
    <div class="sig-col"><div class="sig-line"></div><div class="sig-label">প্রস্তুতকারকের স্বাক্ষর</div><div class="sig-sub">(Prepared By)</div></div>
    <div class="sig-col"><div class="sig-line"></div><div class="sig-label">যাচাইকারীর স্বাক্ষর</div><div class="sig-sub">(Checked / Accountant)</div></div>
    <div class="sig-col"><div class="sig-line"></div><div class="sig-label">অনুমোদিত অফিসারের স্বাক্ষর ও সিল</div><div class="sig-sub">(Authorized Signature &amp; Seal)</div></div>
  </div>`;
}

export function reportGeneratedMeta(
  firm: PrintFirm,
  project: PrintProject | { id?: number; name?: string },
  periodLabel: string
): Array<{ label: string; value: string }> {
  return [
    { label: "প্রজেক্ট", value: project.name ?? "—" },
    { label: "সময়কাল", value: periodLabel },
    { label: "ফার্ম", value: firm.name },
    {
      label: "তৈরির সময়",
      value: printDateTime(new Date()),
    },
  ];
}

export function totalsTableHtml(
  rows: Array<{
    label: string;
    value: string;
    tone?: "normal" | "income" | "expense" | "grand";
  }>
): string {
  return `
  <div class="totals">
    <table class="total-table">
      ${rows
        .map(row => {
          const cls =
            row.tone === "grand"
              ? "grand-total"
              : row.tone === "income"
                ? "section-total"
                : row.tone === "expense"
                  ? "section-total"
                  : "";
          return `<tr class="${cls}"><td style="width:70%">${escapeHtml(row.label)}</td><td class="num">${escapeHtml(row.value)}</td></tr>`;
        })
        .join("")}
    </table>
  </div>`;
}

export function noDataHtml(
  message = "নির্বাচিত সময়সীমায় কোনো লেনদেন পাওয়া যায়নি।"
): string {
  return `<p style="text-align:center;color:#64786e;margin:14px 0;">${escapeHtml(message)}</p>`;
}
