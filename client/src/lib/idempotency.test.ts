import { describe, expect, it } from "vitest";
import {
  transactionDeleteKey,
  transactionUpdateKey,
} from "./idempotency";

const basePayload = {
  projectId: 7,
  categoryId: 12,
  accountId: 3,
  type: "expense" as const,
  amount: 250.5,
  paymentMethod: "cash",
  occurredAt: new Date("2026-05-01T12:00:00Z"),
};

describe("transactionUpdateKey", () => {
  it("is stable for an identical payload", () => {
    expect(transactionUpdateKey(41, basePayload)).toBe(
      transactionUpdateKey(41, { ...basePayload })
    );
  });

  it("differs when the transaction id differs", () => {
    expect(transactionUpdateKey(41, basePayload)).not.toBe(
      transactionUpdateKey(42, basePayload)
    );
  });

  it("differs when the payload differs (no false 409 on a real edit)", () => {
    expect(transactionUpdateKey(41, basePayload)).not.toBe(
      transactionUpdateKey(41, { ...basePayload, amount: 251 })
    );
  });

  it("treats equal instants as equal regardless of Date identity", () => {
    expect(transactionUpdateKey(41, basePayload)).toBe(
      transactionUpdateKey(41, {
        ...basePayload,
        occurredAt: new Date("2026-05-01T12:00:00Z"),
      })
    );
  });

  it("normalises optional fields (undefined vs absent)", () => {
    const withUndefinedNote = {
      ...basePayload,
      note: undefined,
    };
    expect(transactionUpdateKey(41, withUndefinedNote)).toBe(
      transactionUpdateKey(41, basePayload)
    );
  });

  it("carries the update: prefix for forensics", () => {
    expect(transactionUpdateKey(41, basePayload).startsWith("update:41:")).toBe(
      true
    );
  });
});

describe("transactionDeleteKey", () => {
  it("is stable and namespaced by project and id", () => {
    expect(transactionDeleteKey(7, 41)).toBe("delete:7:41");
    expect(transactionDeleteKey(7, 41)).toBe(transactionDeleteKey(7, 41));
    expect(transactionDeleteKey(7, 41)).not.toBe(transactionDeleteKey(8, 41));
    expect(transactionDeleteKey(7, 41)).not.toBe(transactionDeleteKey(7, 42));
  });
});
