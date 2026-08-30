export interface CurrencyRate {
  code: string;
  name: string;
  symbol: string;
  rateToBdt: number; // 1 Unit of Foreign Currency = X BDT
  flag: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyRate> = {
  BDT: { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", rateToBdt: 1.0, flag: "🇧🇩" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", rateToBdt: 118.5, flag: "🇺🇸" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", rateToBdt: 129.2, flag: "🇪🇺" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", rateToBdt: 153.8, flag: "🇬🇧" },
  SAR: { code: "SAR", name: "Saudi Riyal", symbol: "﷼", rateToBdt: 31.6, flag: "🇸🇦" },
  AED: { code: "AED", name: "UAE Dirham", symbol: "د.إ", rateToBdt: 32.25, flag: "🇦🇪" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", rateToBdt: 87.4, flag: "🇨🇦" },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", rateToBdt: 1.41, flag: "🇮🇳" },
  MYR: { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", rateToBdt: 26.8, flag: "🇲🇾" },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", rateToBdt: 91.2, flag: "🇸🇬" },
};

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string = "BDT"): number {
  const from = SUPPORTED_CURRENCIES[fromCurrency] || SUPPORTED_CURRENCIES.BDT;
  const to = SUPPORTED_CURRENCIES[toCurrency] || SUPPORTED_CURRENCIES.BDT;

  // Convert to BDT first, then to target currency
  const inBdt = amount * from.rateToBdt;
  return inBdt / to.rateToBdt;
}

export function formatCurrencyValue(amount: number, currencyCode: string = "BDT"): string {
  const curr = SUPPORTED_CURRENCIES[currencyCode] || SUPPORTED_CURRENCIES.BDT;
  return `${curr.symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDualCurrency(amount: number, currencyCode: string = "USD"): string {
  if (currencyCode === "BDT") {
    return formatCurrencyValue(amount, "BDT");
  }
  const inBdt = convertCurrency(amount, currencyCode, "BDT");
  return `${formatCurrencyValue(amount, currencyCode)} (${formatCurrencyValue(inBdt, "BDT")})`;
}
