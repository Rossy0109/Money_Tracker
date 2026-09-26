import { describe, expect, it } from "vitest";
import {
  amountToWords,
  bengali,
  bengaliNumberWords,
  englishNumberWords,
} from "./amountToWords";

describe("amount to words", () => {
  it("converts Bengali numbers using crore/lakh/housand groups", () => {
    expect(bengaliNumberWords(0)).toBe("শূন্য");
    expect(bengaliNumberWords(1500).replace(/\s+/g, " ")).toBe(
      "এক হাজার পাঁচশ"
    );
    expect(bengaliNumberWords(100000).replace(/\s+/g, " ")).toBe("এক লাখ");
    expect(bengaliNumberWords(12000000).replace(/\s+/g, " ")).toBe(
      "এক কোটি বিশ লাখ"
    );
    expect(bengaliNumberWords(500).replace(/\s+/g, " ")).toBe("পাঁচশ");
  });

  it("converts English numbers with standard scales", () => {
    expect(englishNumberWords(0)).toBe("Zero");
    expect(englishNumberWords(21)).toBe("Twenty One");
    expect(englishNumberWords(123456)).toBe(
      "One Hundred Twenty Three Thousand Four Hundred Fifty Six"
    );
  });

  it("produces full taka/poisha phrasing", () => {
    const words = amountToWords(1500.5);
    expect(words.bengali).toContain("টাকা");
    expect(words.bengali).toContain("পয়সা");
    expect(words.english).toContain("Taka");
    expect(words.english).toContain("Poisha");
  });

  it("renders Bengali digits for a locale digit string", () => {
    expect(bengali("1234")).toBe("১২৩৪");
  });
});
