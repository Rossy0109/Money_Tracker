import { describe, expect, it } from "vitest";
import { z } from "zod";

// Replicate schema validators from routers.ts for strict validation unit testing
const amount = z.number().finite().positive().max(999999999999.99);

const transactionDate = z.coerce.date().refine(d => {
  const maxAllowedDate = new Date();
  maxAllowedDate.setDate(maxAllowedDate.getDate() + 30);
  return d <= maxAllowedDate;
}, "ভবিষ্যতের ৩০ দিনের বেশি পরের তারিখ ইনপুট করা যাবে না");

const transactionInput = z.object({
  projectId: z.number().int().positive(),
  accountId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  type: z.enum(["income", "expense"]),
  amount,
  paymentMethod: z.string().trim().min(1).max(100),
  note: z.string().max(500).optional(),
  occurredAt: transactionDate,
});

// Helper for detecting duplicate transactions within a time threshold
export function isDuplicateTransaction(
  existing: Array<{ amount: number; categoryId: number; type: string; occurredAt: Date; note?: string }>,
  candidate: { amount: number; categoryId: number; type: string; occurredAt: Date; note?: string },
  windowSeconds = 60
): boolean {
  return existing.some(tx => {
    if (tx.amount !== candidate.amount) return false;
    if (tx.categoryId !== candidate.categoryId) return false;
    if (tx.type !== candidate.type) return false;
    if ((tx.note || "") !== (candidate.note || "")) return false;

    const diffMs = Math.abs(tx.occurredAt.getTime() - candidate.occurredAt.getTime());
    return diffMs <= windowSeconds * 1000;
  });
}

// Balance check helper
export function checkAccountBalance(
  accountBalance: number,
  transactionType: "income" | "expense",
  amount: number
): { isSufficient: boolean; newBalance: number } {
  if (transactionType === "income") {
    return { isSufficient: true, newBalance: accountBalance + amount };
  }
  const newBalance = accountBalance - amount;
  return {
    isSufficient: newBalance >= 0,
    newBalance,
  };
}

describe("server/transaction-validation.test.ts", () => {
  describe("Amount Validation", () => {
    it("accepts valid positive numbers with decimal places", () => {
      expect(amount.safeParse(1500).success).toBe(true);
      expect(amount.safeParse(12.5).success).toBe(true);
      expect(amount.safeParse(0.01).success).toBe(true);
    });

    it("rejects zero and negative amounts", () => {
      expect(amount.safeParse(0).success).toBe(false);
      expect(amount.safeParse(-500).success).toBe(false);
      expect(amount.safeParse(-0.01).success).toBe(false);
    });

    it("rejects non-finite values (Infinity, NaN)", () => {
      expect(amount.safeParse(Infinity).success).toBe(false);
      expect(amount.safeParse(-Infinity).success).toBe(false);
      expect(amount.safeParse(NaN).success).toBe(false);
    });

    it("enforces maximum transaction amount upper bound", () => {
      expect(amount.safeParse(999999999999.99).success).toBe(true);
      expect(amount.safeParse(1000000000000).success).toBe(false);
    });
  });

  describe("Date Validation (Future Boundary)", () => {
    it("accepts current, past, and dates up to 30 days in the future", () => {
      const today = new Date();
      expect(transactionDate.safeParse(today).success).toBe(true);

      const pastDate = new Date("2024-01-01T00:00:00Z");
      expect(transactionDate.safeParse(pastDate).success).toBe(true);

      const twentyDaysAhead = new Date();
      twentyDaysAhead.setDate(twentyDaysAhead.getDate() + 20);
      expect(transactionDate.safeParse(twentyDaysAhead).success).toBe(true);
    });

    it("rejects dates more than 30 days in the future", () => {
      const thirtyFiveDaysAhead = new Date();
      thirtyFiveDaysAhead.setDate(thirtyFiveDaysAhead.getDate() + 35);
      const result = transactionDate.safeParse(thirtyFiveDaysAhead);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("৩০ দিনের বেশি পরের তারিখ");
      }
    });

    it("rejects invalid date strings", () => {
      expect(transactionDate.safeParse("invalid-date-string").success).toBe(false);
    });
  });

  describe("Duplicate Detection", () => {
    const baseTx = {
      amount: 2500,
      categoryId: 4,
      type: "expense",
      occurredAt: new Date("2026-09-12T10:00:00Z"),
      note: "Office supplies",
    };

    it("flags transaction as duplicate if identical entry submitted within 60 seconds", () => {
      const candidateSameTime = { ...baseTx };
      expect(isDuplicateTransaction([baseTx], candidateSameTime, 60)).toBe(true);

      const candidate30sLater = {
        ...baseTx,
        occurredAt: new Date("2026-09-12T10:00:30Z"),
      };
      expect(isDuplicateTransaction([baseTx], candidate30sLater, 60)).toBe(true);
    });

    it("does not flag transaction as duplicate if time difference exceeds window", () => {
      const candidateTenMinsLater = {
        ...baseTx,
        occurredAt: new Date("2026-09-12T10:10:00Z"),
      };
      expect(isDuplicateTransaction([baseTx], candidateTenMinsLater, 60)).toBe(false);
    });

    it("does not flag transaction if amount, note, or category differs", () => {
      expect(isDuplicateTransaction([baseTx], { ...baseTx, amount: 2600 }, 60)).toBe(false);
      expect(isDuplicateTransaction([baseTx], { ...baseTx, categoryId: 5 }, 60)).toBe(false);
      expect(isDuplicateTransaction([baseTx], { ...baseTx, note: "Different note" }, 60)).toBe(false);
      expect(isDuplicateTransaction([baseTx], { ...baseTx, type: "income" }, 60)).toBe(false);
    });
  });

  describe("Balance Checks", () => {
    it("allows income regardless of current balance and increases balance", () => {
      const result = checkAccountBalance(100, "income", 500);
      expect(result.isSufficient).toBe(true);
      expect(result.newBalance).toBe(600);
    });

    it("validates sufficient funds for expense", () => {
      const result = checkAccountBalance(1000, "expense", 450);
      expect(result.isSufficient).toBe(true);
      expect(result.newBalance).toBe(550);
    });

    it("flags insufficient funds when expense exceeds current balance", () => {
      const result = checkAccountBalance(200, "expense", 500);
      expect(result.isSufficient).toBe(false);
      expect(result.newBalance).toBe(-300);
    });
  });

  describe("Full Transaction Schema Validation", () => {
    it("validates complete valid transaction payload", () => {
      const valid = {
        projectId: 1,
        accountId: 2,
        categoryId: 3,
        type: "expense" as const,
        amount: 350.5,
        paymentMethod: "bKash",
        note: "Daily lunch",
        occurredAt: new Date(),
      };
      const parseResult = transactionInput.safeParse(valid);
      expect(parseResult.success).toBe(true);
    });

    it("rejects payload missing required fields like paymentMethod or categoryId", () => {
      const missingFields = {
        projectId: 1,
        type: "expense" as const,
        amount: 350.5,
      };
      expect(transactionInput.safeParse(missingFields).success).toBe(false);
    });
  });
});
