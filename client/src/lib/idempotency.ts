/**
 * Deterministic idempotency keys for transaction mutations.
 *
 * A random key generated per render gives no retry protection — a
 * retried request arrives with a different key, so the server executes
 * it twice. A key derived from the mutation target plus its payload
 * replays identically on retry, while a genuinely different edit still
 * produces a different key, so the server can never falsely 409 two
 * legitimate edits of the same row.
 */

/** FNV-1a 32-bit hash — stable across sessions and platforms. */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Stable fingerprint: sorted keys, dates as ISO, undefined omitted. */
function fingerprint(value: unknown): string {
  return hashString(
    JSON.stringify(value, (_key, entry) => {
      if (entry instanceof Date) return entry.toISOString();
      return entry;
    })
  );
}

export interface TransactionUpdatePayload {
  projectId: number;
  categoryId: number;
  accountId?: number;
  type: "income" | "expense";
  amount: number;
  paymentMethod: string;
  note?: string;
  occurredAt: Date;
}

/** Key for finance.updateTransaction — stable per (id, payload). */
export function transactionUpdateKey(
  id: number,
  payload: TransactionUpdatePayload
): string {
  return `update:${id}:${fingerprint(payload)}`;
}

/** Key for finance.deleteTransaction — stable per (projectId, id). */
export function transactionDeleteKey(
  projectId: number,
  id: number
): string {
  return `delete:${projectId}:${id}`;
}
