import { describe, it, expect } from "vitest";

describe("Inventory Management Logic", () => {
  it("calculates stock valuation and profit margins correctly", () => {
    const item = {
      name: "প্রিন্টার পেপার A4",
      purchasePrice: "450.00",
      sellingPrice: "600.00",
      currentStock: "25.00",
      lowStockThreshold: "5.00",
    };

    const stockValuation = Number(item.currentStock) * Number(item.purchasePrice);
    const potentialRevenue = Number(item.currentStock) * Number(item.sellingPrice);
    const profitMargin = potentialRevenue - stockValuation;

    expect(stockValuation).toBe(11250);
    expect(potentialRevenue).toBe(15000);
    expect(profitMargin).toBe(3750);
  });

  it("detects low stock status when stock falls below threshold", () => {
    const isLowStock = (stock: number, threshold: number) => stock > 0 && stock <= threshold;
    const isOutOfStock = (stock: number) => stock <= 0;

    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(10, 5)).toBe(false);
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-1)).toBe(true);
  });

  it("handles stock-in and stock-out adjustments safely", () => {
    let currentStock = 20;

    // Stock in (purchase/return)
    const stockIn = 15;
    currentStock = Math.max(0, currentStock + stockIn);
    expect(currentStock).toBe(35);

    // Stock out (sales/damage)
    const stockOut = 10;
    currentStock = Math.max(0, currentStock - stockOut);
    expect(currentStock).toBe(25);

    // Oversold stock out clamps to 0
    const overStockOut = 30;
    currentStock = Math.max(0, currentStock - overStockOut);
    expect(currentStock).toBe(0);
  });
});
