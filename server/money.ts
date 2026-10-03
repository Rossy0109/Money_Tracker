/**
 * Integer-cents money arithmetic shared by the server.
 *
 * `decimal(18,2)` columns come back from MySQL as strings. Parsing each one
 * with `Number()` and adding keeps an IEEE-754 fraction alive across every
 * operand, so a long sum drifts away from the true total — and the drift is
 * invisible until a total is compared for equality or fed back into an
 * accounting decision. Converting each value to integer cents first, adding
 * integers, and dividing exactly once at the end removes that entirely.
 *
 * server/accounting-core.ts documents the same rule at the top of the file and
 * used to keep its own private copy of these two functions; they live here so
 * there is one definition.
 */

/** Multiply a decimal money value by 100 and round to integer cents. */
export function toCents(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Convert integer cents back to a decimal number for API responses. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Format integer cents as a decimal string for a decimal(18,2) column. */
export function decimalFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Exact sum of decimal money values, accumulated as integer cents. */
export function sumCents(
  values: Array<string | number | null | undefined>
): number {
  let total = 0;
  for (const value of values) total += toCents(value);
  return total;
}

/** Sum decimal money values to a decimal number, converting once at the end. */
export function sumMoney(
  values: Array<string | number | null | undefined>
): number {
  return fromCents(sumCents(values));
}
