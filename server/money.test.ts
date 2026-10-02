import { describe, expect, it } from "vitest";
import {
  decimalFromCents,
  fromCents,
  sumCents,
  sumMoney,
  toCents,
} from "./money";

describe("toCents", () => {
  it("converts decimal strings and numbers to integer cents", () => {
    expect(toCents("0.10")).toBe(10);
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents(7)).toBe(700);
    expect(toCents(7.7)).toBe(770);
  });

  it("treats empty and missing values as zero", () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
    expect(toCents("not a number")).toBe(0);
  });

  it("keeps the sign", () => {
    expect(toCents("-12.34")).toBe(-1234);
  });
});

describe("sumMoney", () => {
  it("adds money exactly where naive float addition drifts", () => {
    // 0.1 + 0.2 + 0.3 !== 0.6 in IEEE-754, but always is in cents.
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
    expect(sumMoney(["0.10", "0.20", "0.30"])).toBe(0.6);
  });

  it("stays exact across many small values", () => {
    // Ten thousand additions of 0.01 accumulate visible float error.
    const values = Array.from({ length: 10000 }, () => "0.01");
    const naive = values.reduce((sum, v) => sum + Number(v), 0);
    expect(naive).not.toBe(100);
    expect(sumMoney(values)).toBe(100);
  });

  it("sums mixed string and number sources", () => {
    expect(sumMoney(["10.55", 2, null, "0.45"])).toBe(13);
  });

  it("returns a plain number for API responses", () => {
    expect(sumMoney(["10.00", "5.50"])).toBe(15.5);
  });
});

describe("sumCents", () => {
  it("returns integer cents so callers can subtract before converting", () => {
    expect(sumCents(["0.30", "0.10"])).toBe(40);
    expect(fromCents(sumCents(["0.30"]) - sumCents(["0.10"]))).toBe(0.2);
    // The float equivalent is what a naive netAmount would have shipped.
    expect(Number((0.3 - 0.1).toFixed(2))).toBe(0.2);
  });
});

describe("decimalFromCents", () => {
  it("formats integer cents as a decimal(18,2) string", () => {
    expect(decimalFromCents(123456)).toBe("1234.56");
    expect(decimalFromCents(5)).toBe("0.05");
    expect(decimalFromCents(-5)).toBe("-0.05");
    expect(decimalFromCents(0)).toBe("0.00");
  });
});
