export type ParsedTransaction = {
  amount: number | null;
  type: "income" | "expense" | null;
  provider: "bkash" | "nagad" | "rocket" | "upay" | "bank" | "cash" | "other";
  trxId: string | null;
  party: string | null;
  suggestedNote: string;
};

export function parseTransactionSMS(text: string): ParsedTransaction {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      amount: null,
      type: null,
      provider: "other",
      trxId: null,
      party: null,
      suggestedNote: "",
    };
  }

  const lower = trimmed.toLowerCase();

  // TrxID / TxnID extraction (prioritize TrxID/TxnID before Ref)
  let trxId: string | null = null;
  const trxMatch =
    trimmed.match(/(?:TrxID|TxnID|Txn\s*Id|Trx\s*Id)[:\s]+([A-Za-z0-9]+)/i) ||
    trimmed.match(/(?:Ref|Reference)[:\s]+([A-Za-z0-9]+)/i);
  if (trxMatch && trxMatch[1]) {
    trxId = trxMatch[1].trim();
  }

  // Provider detection
  let provider: ParsedTransaction["provider"] = "other";
  if (lower.includes("bkash") || lower.includes("বিকাশ")) {
    provider = "bkash";
  } else if (lower.includes("nagad") || lower.includes("নগদ") || lower.includes("txnid")) {
    provider = "nagad";
  } else if (lower.includes("rocket") || lower.includes("dbbl") || lower.includes("রকেট")) {
    provider = "rocket";
  } else if (lower.includes("upay") || lower.includes("উপায়")) {
    provider = "upay";
  } else if (lower.includes("a/c") || lower.includes("account") || lower.includes("bank") || lower.includes("credited") || lower.includes("debited")) {
    provider = "bank";
  } else if (lower.includes("trxid")) {
    provider = "bkash";
  }

  // Type detection (Income vs Expense)
  let type: "income" | "expense" | null = null;
  const isIncome =
    lower.includes("received") ||
    lower.includes("cash in") ||
    lower.includes("cash-in") ||
    lower.includes("credited") ||
    lower.includes("deposit");

  const isExpense =
    lower.includes("send money") ||
    lower.includes("payment") ||
    lower.includes("cash out") ||
    lower.includes("cash-out") ||
    lower.includes("debited") ||
    lower.includes("recharge") ||
    lower.includes("transfer to") ||
    lower.includes("paid");

  if (isIncome && !isExpense) {
    type = "income";
  } else if (isExpense && !isIncome) {
    type = "expense";
  } else if (isIncome && isExpense) {
    const incIndex = Math.min(...["received", "cash in", "cash-in", "credited", "deposit"].map((w) => {
      const idx = lower.indexOf(w);
      return idx === -1 ? Infinity : idx;
    }));
    const expIndex = Math.min(...["send money", "payment", "cash out", "cash-out", "debited", "recharge", "transfer"].map((w) => {
      const idx = lower.indexOf(w);
      return idx === -1 ? Infinity : idx;
    }));
    type = incIndex < expIndex ? "income" : "expense";
  }

  // Amount extraction (Tk / BDT / ৳ followed by digits)
  let amount: number | null = null;
  const amountMatch = trimmed.match(/(?:Tk\.?|BDT|৳)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (amountMatch && amountMatch[1]) {
    const cleanNum = amountMatch[1].replace(/,/g, "");
    const parsed = parseFloat(cleanNum);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // Party (sender/receiver/merchant/phone number)
  let party: string | null = null;
  const partyMatch = trimmed.match(/(?:from|to|by|merchant)\s+([0-9A-Za-z\s.\-_]+?)(?:\.|\s+successful|\s+fee|\s+at|\s+balance|\s+on|\s+ref|$)/i);
  if (partyMatch && partyMatch[1]) {
    const rawParty = partyMatch[1].trim();
    if (rawParty.length > 0 && rawParty.length < 50) {
      party = rawParty;
    }
  }

  // Build suggested note
  const noteParts: string[] = [];
  if (provider !== "other") {
    noteParts.push(provider.toUpperCase());
  }
  if (party) {
    noteParts.push(party);
  }
  if (trxId) {
    noteParts.push(`(TrxID: ${trxId})`);
  }

  return {
    amount,
    type,
    provider,
    trxId,
    party,
    suggestedNote: noteParts.join(" "),
  };
}
