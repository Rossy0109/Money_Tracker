import { amountToWords, bengali } from "./amountToWords";
import {
  escapeHtml,
  firmHeaderHtml,
  moneyBn,
  printDate,
  printDateTime,
} from "./layout";
import type { VoucherPrintData } from "./types";

/**
 * Master individual transaction voucher. Each saved Income/Deposit or Expense
 * transaction maps to its own voucher; the layout mirrors a standard
 * accounting voucher with the dynamic company/firm header, project, voucher
 * number, date, name/address, transaction head, description, amount, amount in
 * words and the Authority/Payer/Receiver signature lines.
 */
export function voucherBodyHtml(data: VoucherPrintData): string {
  const t = data.transaction;
  const amount = Number(t.amount);
  const words = amountToWords(amount);
  const isIncome = t.type === "income";
  const reason = t.reason?.trim() || "—";
  const description = t.note?.trim() || reason;

  return `
  ${firmHeaderHtml(data.firm, {
    title: isIncome ? "আমানত রসিদ / Voucher" : "ব্যয় ভাউচার / Voucher",
    meta: [
      { label: "প্রজেক্ট", value: data.project.name },
      { label: "ভাউচার নং", value: t.voucherNo || "—" },
      { label: "তারিখ", value: printDate(t.occurredAt) },
      {
        label: "ধরন",
        value: isIncome ? "আয় / আমানত" : "ব্যয় / খরচ",
      },
      {
        label: "তৈরির সময়",
        value: printDateTime(t.createdAt),
      },
    ],
  })}
  <div class="voucher-doc">
    <table class="voucher-table">
      <tr>
        <td class="col-letter"><div class="field-label">প্রাপকের নাম (Name)</div></td>
        <td class="col-value"><div class="field-value">${escapeHtml(reason)}</div></td>
        <td class="col-letter"><div class="field-label">খাত / হেড (Head)</div></td>
        <td class="col-value"><div class="field-value">${escapeHtml(t.categoryName)}</div></td>
      </tr>
      <tr>
        <td><div class="field-label">ঠিকানা (Address)</div></td>
        <td><div class="field-value">—</div></td>
        <td><div class="field-label">অ্যাকাউন্ট</div></td>
        <td><div class="field-value">${escapeHtml(t.accountName ?? "—")}</div></td>
      </tr>
      <tr>
        <td><div class="field-label">বিবরণ (Description)</div></td>
        <td colspan="3"><div class="field-value">${escapeHtml(description)}</div></td>
      </tr>
      <tr>
        <td><div class="field-label">পরিশোধ পদ্ধতি</div></td>
        <td><div class="field-value">${escapeHtml(t.paymentMethod)}</div></td>
        <td><div class="field-label">লেনদেন তারিখ</div></td>
        <td><div class="field-value">${escapeHtml(printDate(t.occurredAt))}</div></td>
      </tr>
      <tr>
        <td colspan="2"><div class="field-label">পরিমাণ (Amount)</div></td>
        <td colspan="2" class="amount-cell">
          <div class="amount-digits">${escapeHtml(moneyBn(amount))}</div>
        </td>
      </tr>
      <tr>
        <td colspan="4">
          <div class="field-label">টাকার অংকে (Amount in Words)</div>
          <div class="field-value" style="font-size:12px;">${escapeHtml(words.bengali)}</div>
          <div style="font-size:9.5px;color:#52665c;">${escapeHtml(words.english)}</div>
          <div style="font-size:9.5px;color:#52665c;margin-top:2px;">(টাকা ${escapeHtml(bengali(amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })))} মাত্র)</div>
        </td>
      </tr>
    </table>
    <div class="voucher-sig">
      <div class="sig-col"><div class="sig-line"></div><div class="sig-label">অনুমোদনকারীর স্বাক্ষর</div><div class="sig-sub">(Authority Signature)</div></div>
      <div class="sig-col"><div class="sig-line"></div><div class="sig-label">প্রদানকারীর স্বাক্ষর</div><div class="sig-sub">(Payer Signature)</div></div>
      <div class="sig-col"><div class="sig-line"></div><div class="sig-label">গ্রহীতার স্বাক্ষর</div><div class="sig-sub">(Receiver Signature)</div></div>
    </div>
    <p class="notes">এটি Money_Tracker সিস্টেম দ্বারা স্বয়ংক্রিয়ভাবে তৈরি হওয়া কম্পিউটার-জেনারেটেড ভাউচার। সিস্টেম কোনো লেনদেন পরিবর্তন করে না এবং পরিমাণ মূল সঞ্চিত তথ্য থেকে হিসাব করা হয়।</p>
  </div>`;
}

export function voucherScreenPreviewHtml(data: VoucherPrintData): string {
  return `<div class="print-root">${voucherBodyHtml(data)}</div>`;
}
