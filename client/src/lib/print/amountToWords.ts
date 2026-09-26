const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const bengali = (value: string | number) =>
  String(value).replace(/[0-9]/g, digit => BENGALI_DIGITS[Number(digit)]);

const BENGALI_BELOW_100 = [
  "",
  "এক",
  "দুই",
  "তিন",
  "চার",
  "পাঁচ",
  "ছয়",
  "সাত",
  "আট",
  "নয়",
  "দশ",
  "এগারো",
  "বারো",
  "তেরো",
  "চৌদ্দ",
  "পনেরো",
  "ষোল",
  "সতেরো",
  "আঠারো",
  "উনিশ",
  "বিশ",
  "একুশ",
  "বাইশ",
  "তেইশ",
  "চব্বিশ",
  "পঁচিশ",
  "ছাব্বিশ",
  "সাতাশ",
  "আটাশ",
  "ঊনত্রিশ",
  "ত্রিশ",
  "একত্রিশ",
  "বত্রিশ",
  "তেত্রিশ",
  "চৌত্রিশ",
  "পঁয়ত্রিশ",
  "ছত্রিশ",
  "সাঁইত্রিশ",
  "আটত্রিশ",
  "ঊনচল্লিশ",
  "চল্লিশ",
  "একচল্লিশ",
  "বিয়াল্লিশ",
  "তেতাল্লিশ",
  "চুয়াল্লিশ",
  "পঁয়তাল্লিশ",
  "ছেচল্লিশ",
  "সাতচল্লিশ",
  "আটচল্লিশ",
  "ঊনপঞ্চাশ",
  "পঞ্চাশ",
  "একান্ন",
  "বাহান্ন",
  "তিপ্পান্ন",
  "চুয়ান্ন",
  "পঞ্চান্ন",
  "ছাপ্পান্ন",
  "সাতান্ন",
  "আটান্ন",
  "ঊনষাট",
  "ষাট",
  "একষট্টি",
  "বাষট্টি",
  "তেষট্টি",
  "চৌষট্টি",
  "পঁয়ষট্টি",
  "ছেষট্টি",
  "সাতষট্টি",
  "আটষট্টি",
  "ঊনসত্তর",
  "সত্তর",
  "একাত্তর",
  "বাহাত্তর",
  "তিয়াত্তর",
  "চুয়াত্তর",
  "পঁচাত্তর",
  "ছিয়াত্তর",
  "সাতাত্তর",
  "আটাত্তর",
  "ঊনআশি",
  "আশি",
  "একাশি",
  "বিরাশি",
  "তিরাশি",
  "চুরাশি",
  "পঁচাশি",
  "ছিয়াশি",
  "সাতাশি",
  "আটাশি",
  "ঊননব্বই",
  "নব্বই",
  "একানব্বই",
  "বিরানব্বই",
  "তিরানব্বই",
  "চুরানব্বই",
  "পঁচানব্বই",
  "ছিয়ানব্বই",
  "সাতানব্বই",
  "আটানব্বই",
  "নিরানব্বই",
];

export function bengaliNumberWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "শূন্য";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;
  if (crore > 0)
    parts.push(
      `${bengaliNumberWords(crore)}${crore === 1 ? " কোটি" : " কোটি"}`
    );
  if (lakh > 0) parts.push(`${bengaliNumberWords(lakh)} লাখ`);
  if (thousand > 0) parts.push(`${bengaliNumberWords(thousand)} হাজার`);
  if (hundred > 0) parts.push(`${bengaliNumberWords(hundred)}শ`);
  if (hundred > 0 && rest > 0) parts.push(BENGALI_BELOW_100[rest]);
  else if (hundred === 0 && rest > 0) parts.push(BENGALI_BELOW_100[rest]);
  return parts.join(" ");
}

const ENGLISH_ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const ENGLISH_TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
const ENGLISH_SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

export function englishNumberWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const chunks: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    chunks.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    if (chunk === 0) continue;
    const chunkWords: string[] = [];
    const hundred = Math.floor(chunk / 100);
    const rest = chunk % 100;
    if (hundred > 0) chunkWords.push(`${ENGLISH_ONES[hundred]} Hundred`);
    if (rest >= 20) {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      chunkWords.push(ENGLISH_TENS[tens]);
      if (ones > 0) chunkWords.push(ENGLISH_ONES[ones]);
    } else if (rest > 0) {
      chunkWords.push(ENGLISH_ONES[rest]);
    }
    words.push(
      [...chunkWords, ENGLISH_SCALES[index]].filter(Boolean).join(" ")
    );
  }
  return words.join(" ");
}

export type AmountInWords = {
  bengali: string;
  english: string;
};

export function amountToWords(amount: number): AmountInWords {
  const taka = Math.floor(Math.abs(amount));
  const poisha = Math.round((Math.abs(amount) - taka) * 100) % 100;
  const sign = amount < 0 ? "ঋণাত্মক " : "";
  const bengaliPoisha =
    poisha > 0 ? ` ও ${bengaliNumberWords(poisha)} পয়সা` : "";
  const englishPoisha =
    poisha > 0 ? ` and ${englishNumberWords(poisha)} Poisha` : "";
  return {
    bengali: `${sign}${bengaliNumberWords(taka)} টাকা${bengaliPoisha} মাত্র`,
    english: `${amount < 0 ? "Negative " : ""}${englishNumberWords(taka)} Taka${englishPoisha} only`,
  };
}

export { bengali };
