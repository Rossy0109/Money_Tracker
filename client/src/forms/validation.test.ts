import { describe, expect, it } from "vitest";
import { z } from "zod";

// Form validation schemas and cross-field logic
export const transactionFormSchema = z
  .object({
    amount: z.string().trim().min(1, "পরিমাণ লিখুন"),
    categoryId: z.string().trim().min(1, "ক্যাটাগরি নির্বাচন করুন"),
    accountId: z.string().default("none"),
    paymentMethod: z.string().trim().min(1, "পেমেন্ট মাধ্যম নির্বাচন করুন"),
    occurredAt: z.string().trim().min(1, "তারিখ দিন"),
    note: z.string().max(500, "নোট ৫০০ অক্ষরের বেশি হতে পারবে না").optional(),
  })
  .superRefine((values, ctx) => {
    const parsedAmount = Number(values.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "সঠিক পরিমাণ প্রদান করুন (০-এর বেশি হতে হবে)",
      });
    }

    if (values.categoryId === "" || values.categoryId === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "একটি ক্যাটাগরি বেছে নিন",
      });
    }
  });

export const dateRangeFilterSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && new Date(data.from) > new Date(data.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "শেষের তারিখ শুরুর তারিখের আগে হতে পারে না",
      });
    }

    if (
      data.minAmount !== undefined &&
      data.maxAmount !== undefined &&
      data.minAmount > data.maxAmount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxAmount"],
        message: "সর্বোচ্চ পরিমাণ সর্বনিম্ন পরিমাণের চেয়ে কম হতে পারে না",
      });
    }
  });

export function transformFormForSubmission(
  formData: z.infer<typeof transactionFormSchema>,
  type: "income" | "expense",
  projectId: number
) {
  const validation = transactionFormSchema.safeParse(formData);
  if (!validation.success) {
    throw new Error(validation.error.issues[0]?.message || "Invalid form data");
  }

  return {
    projectId,
    categoryId: Number(formData.categoryId),
    accountId: formData.accountId !== "none" ? Number(formData.accountId) : undefined,
    type,
    amount: Number(formData.amount),
    paymentMethod: formData.paymentMethod,
    note: formData.note?.trim() || undefined,
    occurredAt: new Date(formData.occurredAt),
  };
}

describe("client/src/forms/validation.test.ts - Field, Cross-field, Form submission", () => {
  describe("Field-level Validation", () => {
    it("fails when required fields are empty", () => {
      const invalid = {
        amount: "",
        categoryId: "",
        accountId: "none",
        paymentMethod: "",
        occurredAt: "",
      };
      const result = transactionFormSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric and negative amounts", () => {
      const negative = {
        amount: "-500",
        categoryId: "1",
        accountId: "none",
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
      };
      expect(transactionFormSchema.safeParse(negative).success).toBe(false);

      const text = {
        amount: "five-hundred",
        categoryId: "1",
        accountId: "none",
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
      };
      expect(transactionFormSchema.safeParse(text).success).toBe(false);
    });

    it("rejects note exceeding 500 characters", () => {
      const longNote = {
        amount: "500",
        categoryId: "1",
        accountId: "none",
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
        note: "A".repeat(501),
      };
      expect(transactionFormSchema.safeParse(longNote).success).toBe(false);
    });
  });

  describe("Cross-field Validation", () => {
    it("flags error when 'from' date is after 'to' date", () => {
      const invalidRange = {
        from: "2026-10-01",
        to: "2026-09-01",
      };
      const result = dateRangeFilterSchema.safeParse(invalidRange);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("শেষের তারিখ");
      }
    });

    it("allows valid date range where 'from' is before or equal to 'to'", () => {
      const validRange = {
        from: "2026-09-01",
        to: "2026-09-30",
      };
      expect(dateRangeFilterSchema.safeParse(validRange).success).toBe(true);

      const sameDay = {
        from: "2026-09-12",
        to: "2026-09-12",
      };
      expect(dateRangeFilterSchema.safeParse(sameDay).success).toBe(true);
    });

    it("flags error when minAmount is greater than maxAmount", () => {
      const invalidAmounts = {
        minAmount: 1000,
        maxAmount: 500,
      };
      const result = dateRangeFilterSchema.safeParse(invalidAmounts);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("সর্বোচ্চ পরিমাণ");
      }
    });
  });

  describe("Form Submission & Payload Transformation", () => {
    it("successfully validates and formats valid form data for API submission", () => {
      const validForm = {
        amount: "1500.50",
        categoryId: "4",
        accountId: "7",
        paymentMethod: "bKash",
        occurredAt: "2026-09-12",
        note: "Monthly internet bill",
      };

      const payload = transformFormForSubmission(validForm, "expense", 42);

      expect(payload).toEqual({
        projectId: 42,
        categoryId: 4,
        accountId: 7,
        type: "expense",
        amount: 1500.5,
        paymentMethod: "bKash",
        note: "Monthly internet bill",
        occurredAt: new Date("2026-09-12"),
      });
    });

    it("handles optional accountId='none' gracefully as undefined", () => {
      const validWithoutAccount = {
        amount: "300",
        categoryId: "2",
        accountId: "none",
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
        note: "",
      };

      const payload = transformFormForSubmission(validWithoutAccount, "expense", 1);
      expect(payload.accountId).toBeUndefined();
      expect(payload.note).toBeUndefined();
    });

    it("throws error on submission if required data is missing", () => {
      const badForm = {
        amount: "",
        categoryId: "none",
        accountId: "none",
        paymentMethod: "Cash",
        occurredAt: "2026-09-12",
      };

      expect(() => transformFormForSubmission(badForm, "expense", 1)).toThrow();
    });
  });
});
