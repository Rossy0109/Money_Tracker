/**
 * Utilities for generating WhatsApp and SMS payment reminder messages in Bengali.
 */

export function formatBdPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+880")) {
    cleaned = cleaned.replace("+", "");
  } else if (cleaned.startsWith("880")) {
    // Already in 880 format
  } else if (cleaned.startsWith("0")) {
    cleaned = "88" + cleaned;
  }
  return cleaned;
}

export function formatBdtAmount(amount: number | string): string {
  const num = Number(amount) || 0;
  return `৳ ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateInvoiceReminderMessage(invoice: {
  invoiceNumber: string;
  clientName: string;
  grandTotal: number | string;
  paidAmount?: number | string;
  dueDate?: string | Date | null;
}): string {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const due = Math.max(0, total - paid);
  const formattedDue = formatBdtAmount(due);

  let dateStr = "";
  if (invoice.dueDate) {
    const d = new Date(invoice.dueDate);
    if (!isNaN(d.getTime())) {
      dateStr = `পরিশোধের শেষ তারিখ: ${d.toISOString().slice(0, 10)}\n`;
    }
  }

  return (
    `আসসালামু আলাইকুম ${invoice.clientName},\n\n` +
    `আপনার ইনভয়েস নং *${invoice.invoiceNumber}* এর বকেয়া বিবরণ:\n` +
    `মোট বিল: ${formatBdtAmount(total)}\n` +
    `পরিশোধিত: ${formatBdtAmount(paid)}\n` +
    `*সর্বমোট বকেয়া: ${formattedDue}*\n` +
    dateStr +
    `\nঅনুগ্রহ করে বকেয়া অর্থ পরিশোধ করে সহযোগিতা করবেন। ধন্যবাদ।\n\n— আহমেদ'স ফাইন্যান্সিয়াল অ্যাকাউন্টিং`
  );
}

export function generateDueReminderMessage(due: {
  counterparty: string;
  outstandingAmount: number | string;
  voucherNo?: string | null;
  dueAt?: string | Date | null;
  reason?: string | null;
}): string {
  const amount = Number(due.outstandingAmount) || 0;
  const formattedAmount = formatBdtAmount(amount);

  let voucherStr = due.voucherNo ? ` (ভাউচার: ${due.voucherNo})` : "";
  let dateStr = "";
  if (due.dueAt) {
    const d = new Date(due.dueAt);
    if (!isNaN(d.getTime())) {
      dateStr = `পরিশোধের সম্ভাব্য তারিখ: ${d.toISOString().slice(0, 10)}\n`;
    }
  }

  return (
    `আসসালামু আলাইকুম ${due.counterparty},\n\n` +
    `আপনার কাছে বকেয়া পাওনার বিবরণ${voucherStr}:\n` +
    `*বকেয়া পরিমাণ: ${formattedAmount}*\n` +
    (due.reason ? `বিবরণ: ${due.reason}\n` : "") +
    dateStr +
    `\nবকেয়া অর্থ পরিশোধের প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য বিনীত অনুরোধ করা হচ্ছে। ধন্যবাদ।\n\n— আমার হিসাব`
  );
}

export function getWhatsAppShareUrl(phone: string | null | undefined, message: string): string {
  const formattedPhone = formatBdPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (formattedPhone) {
    return `https://wa.me/${formattedPhone}?text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

export function getSmsShareUrl(phone: string | null | undefined, message: string): string {
  const formattedPhone = formatBdPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  if (formattedPhone) {
    return `sms:${formattedPhone}?body=${encodedText}`;
  }
  return `sms:?body=${encodedText}`;
}
