import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadFresh() {
  return await import("./currencyConverter");
}

function stubFetchToFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    })
  );
}

describe("currencyConverter offline fallback", () => {
  it("falls back to default rates without network or storage", async () => {
    stubFetchToFail();
    const { getCurrencyRates, convertCurrency } = await loadFresh();
    const rates = await getCurrencyRates();
    expect(rates.USD.rateToBdt).toBe(118.5);
    expect(rates.BDT.rateToBdt).toBe(1);
    expect(await convertCurrency(100, "USD", "BDT")).toBe(11850);
  });

  it("falls back to BDT for unknown codes", async () => {
    stubFetchToFail();
    const { convertCurrency, formatCurrencyValue } = await loadFresh();
    expect(await convertCurrency(100, "XXX", "BDT")).toBe(100);
    expect(await formatCurrencyValue(100, "XXX")).toBe(
      await formatCurrencyValue(100, "BDT")
    );
  });

  it("formats values and dual display", async () => {
    stubFetchToFail();
    const { formatCurrencyValue, formatDualCurrency } = await loadFresh();
    expect(await formatCurrencyValue(100, "USD")).toBe("$ 100.00");
    expect(await formatDualCurrency(100, "USD")).toBe("$ 100.00 (৳ 11,850.00)");
    expect(await formatDualCurrency(50, "BDT")).toBe("৳ 50.00");
  });

  it("adopts live rates when the API responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rates: { USD: 100, BDT: 1 } }),
      }))
    );
    const { convertCurrency } = await loadFresh();
    expect(await convertCurrency(2, "USD", "BDT")).toBe(200);
  });
});
