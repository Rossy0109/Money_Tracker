export interface CurrencyRate {
  code: string;
  name: string;
  symbol: string;
  rateToBdt: number;
  flag: string;
}

const DEFAULT_RATES: Record<string, CurrencyRate> = {
  BDT: {
    code: "BDT",
    name: "Bangladeshi Taka",
    symbol: "৳",
    rateToBdt: 1.0,
    flag: "🇧🇩",
  },
  USD: {
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    rateToBdt: 118.5,
    flag: "🇺🇸",
  },
  EUR: { code: "EUR", name: "Euro", symbol: "€", rateToBdt: 129.2, flag: "🇪🇺" },
  GBP: {
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    rateToBdt: 153.8,
    flag: "🇬🇧",
  },
  SAR: {
    code: "SAR",
    name: "Saudi Riyal",
    symbol: "﷼",
    rateToBdt: 31.6,
    flag: "🇸🇦",
  },
  AED: {
    code: "AED",
    name: "UAE Dirham",
    symbol: "د.إ",
    rateToBdt: 32.25,
    flag: "🇦🇪",
  },
  CAD: {
    code: "CAD",
    name: "Canadian Dollar",
    symbol: "C$",
    rateToBdt: 87.4,
    flag: "🇨🇦",
  },
  INR: {
    code: "INR",
    name: "Indian Rupee",
    symbol: "₹",
    rateToBdt: 1.41,
    flag: "🇮🇳",
  },
  MYR: {
    code: "MYR",
    name: "Malaysian Ringgit",
    symbol: "RM",
    rateToBdt: 26.8,
    flag: "🇲🇾",
  },
  SGD: {
    code: "SGD",
    name: "Singapore Dollar",
    symbol: "S$",
    rateToBdt: 91.2,
    flag: "🇸🇬",
  },
};

const CACHE_KEY = "currency_rates_cache";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const API_URL = "https://api.exchangerate-api.com/v4/latest/BDT";

let ratesCache: { rates: Record<string, number>; timestamp: number } | null =
  null;

async function loadRatesFromCache(): Promise<Record<string, number> | null> {
  if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_DURATION_MS) {
    return ratesCache.rates;
  }
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
        ratesCache = parsed;
        return parsed.rates;
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return null;
}

async function fetchLiveRates(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(API_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.rates && typeof data.rates === "object") {
      const rates: Record<string, number> = { BDT: 1 };
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === "number" && rate > 0) {
          rates[code] = rate;
        }
      }
      return rates;
    }
  } catch {
    /* network or parsing error */
  }
  return null;
}

export async function getCurrencyRates(): Promise<
  Record<string, CurrencyRate>
> {
  const cached = await loadRatesFromCache();
  if (cached) {
    return Object.entries(cached).reduce(
      (acc, [code, rateToBdt]) => {
        const def = DEFAULT_RATES[code];
        if (def) acc[code] = { ...def, rateToBdt };
        return acc;
      },
      {} as Record<string, CurrencyRate>
    );
  }
  const live = await fetchLiveRates();
  if (live) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ rates: live, timestamp: Date.now() })
      );
      ratesCache = { rates: live, timestamp: Date.now() };
    } catch {
      /* storage quota exceeded */
    }
    return Object.entries(live).reduce(
      (acc, [code, rateToBdt]) => {
        const def = DEFAULT_RATES[code];
        if (def) acc[code] = { ...def, rateToBdt };
        return acc;
      },
      {} as Record<string, CurrencyRate>
    );
  }
  return DEFAULT_RATES;
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string = "BDT"
): Promise<number> {
  const rates = await getCurrencyRates();
  const from = rates[fromCurrency] || rates.BDT;
  const to = rates[toCurrency] || rates.BDT;
  const inBdt = amount * from.rateToBdt;
  return inBdt / to.rateToBdt;
}

export async function formatCurrencyValue(
  amount: number,
  currencyCode: string = "BDT"
): Promise<string> {
  const rates = await getCurrencyRates();
  const curr = rates[currencyCode] || rates.BDT;
  return `${curr.symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function formatDualCurrency(
  amount: number,
  currencyCode: string = "USD"
): Promise<string> {
  if (currencyCode === "BDT") {
    return formatCurrencyValue(amount, "BDT");
  }
  const inBdt = await convertCurrency(amount, currencyCode, "BDT");
  const from = await formatCurrencyValue(amount, currencyCode);
  const to = await formatCurrencyValue(inBdt, "BDT");
  return `${from} (${to})`;
}
