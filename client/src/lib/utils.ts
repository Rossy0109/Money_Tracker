import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const bdt = (value: number | string) =>
  `৳ ${new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

export const dateText = (value: Date | string) =>
  new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

export const monthText = (key: string) =>
  new Intl.DateTimeFormat("bn-BD", { month: "short" }).format(
    new Date(`${key}-01T12:00:00Z`)
  );

