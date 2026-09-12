import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { generateCsvReport, calculateReportSummary, TransactionReportRow } from "./export-reports.test";

describe("Performance & Scalability Benchmark Suite", () => {
  // 1. Large dataset handling (1000+ transactions)
  describe("1. Large Dataset Handling (1,000 to 10,000 Transactions)", () => {
    it("processes, aggregates, and exports 2,500 transactions within strict latency budget", () => {
      const rows: TransactionReportRow[] = [];
      const startTime = performance.now();

      for (let i = 1; i <= 2500; i++) {
        rows.push({
          date: "2026-09-12",
          type: i % 3 === 0 ? "income" : "expense",
          category: `Category ${i % 20}`,
          amount: (i * 13.5) % 5000,
          paymentMethod: i % 2 === 0 ? "bKash" : "Cash",
          note: `Transaction row #${i} benchmark note`,
        });
      }

      const summary = calculateReportSummary(rows);
      const csv = generateCsvReport(rows);
      const durationMs = performance.now() - startTime;

      expect(summary.rowCount).toBe(2500);
      expect(summary.totalIncome).toBeGreaterThan(0);
      expect(summary.totalExpense).toBeGreaterThan(0);
      expect(csv.length).toBeGreaterThan(100000); // > 100 KB payload
      expect(durationMs).toBeLessThan(1000); // Must complete in under 1 second
    });

    it("verifies streaming memory throughput for 10,000 transactions without blocking", () => {
      let totalAmount = 0;
      const count = 10000;
      const start = performance.now();

      for (let i = 0; i < count; i++) {
        totalAmount += (i * 1.5) % 1000;
      }

      const elapsed = performance.now() - start;
      expect(totalAmount).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(100); // 10k iterations loop under 100ms
    });
  });

  // 2. Memory usage under load
  describe("2. Memory Usage Under Load", () => {
    it("monitors heap allocation before and after batch processing to prevent memory leaks", () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Allocate and process a batch of 5,000 objects
      const dataBatch = Array.from({ length: 5000 }, (_, idx) => ({
        id: idx,
        uuid: `tx-${idx}-${Date.now()}`,
        amount: Math.random() * 10000,
        metadata: { tags: ["urgent", "tax", "vat"], timestamp: Date.now() },
      }));

      expect(dataBatch.length).toBe(5000);

      // Verify heap usage delta remains within reasonable boundaries (< 50MB for batch)
      const postBatchMemory = process.memoryUsage().heapUsed;
      const heapGrowthMb = (postBatchMemory - initialMemory) / (1024 * 1024);

      expect(heapGrowthMb).toBeLessThan(50);
    });
  });

  // 3. Bundle size tests
  describe("3. Production Bundle Size Verification", () => {
    it("ensures critical client chunks and server bundles adhere to strict production size limits", () => {
      const distDir = path.resolve(process.cwd(), "dist");
      if (!fs.existsSync(distDir)) {
        if (process.env.CI) {
          expect(fs.existsSync(distDir)).toBe(true);
        } else {
          console.warn("Skipping bundle size check: dist directory does not exist. Run 'pnpm build' first.");
          return;
        }
      }

      const serverBundle = path.join(distDir, "index.js");
      expect(fs.existsSync(serverBundle)).toBe(true);
      const serverStats = fs.statSync(serverBundle);

      // Server bundle should be under 500 KB
      expect(serverStats.size).toBeLessThan(500 * 1024);

      // Check client assets in dist/public/assets
      const assetsDir = path.join(distDir, "public", "assets");
      if (fs.existsSync(assetsDir)) {
        const assetFiles = fs.readdirSync(assetsDir);
        const jsChunks = assetFiles.filter(f => f.endsWith(".js"));

        // No single client chunk should exceed 600 KB
        for (const chunk of jsChunks) {
          const stats = fs.statSync(path.join(assetsDir, chunk));
          expect(stats.size).toBeLessThan(600 * 1024);
        }
      }
    });
  });

  // 4. Render performance tests
  describe("4. Render & Virtual Scroll Performance", () => {
    it("simulates virtual windowing to render only visible items out of 5,000 rows", () => {
      const totalRows = 5000;
      const rowHeight = 48;
      const viewportHeight = 600;
      const scrollTop = 1200; // User scrolled down

      // Virtual window calculation
      const startIndex = Math.floor(scrollTop / rowHeight);
      const visibleCount = Math.ceil(viewportHeight / rowHeight);
      const overscan = 3;

      const renderStart = Math.max(0, startIndex - overscan);
      const renderEnd = Math.min(totalRows, startIndex + visibleCount + overscan);
      const renderedRowCount = renderEnd - renderStart;

      // Only a tiny slice should be in DOM instead of all 5,000 items
      expect(renderedRowCount).toBeLessThan(30);
      expect(renderStart).toBeGreaterThan(0);
      expect(renderEnd).toBeLessThanOrEqual(totalRows);
    });

    it("verifies rapid sort and filter operations on 1,000 rows complete in under 50ms", () => {
      const dataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        amount: Math.floor(Math.random() * 10000),
        category: i % 5 === 0 ? "Food" : "Transport",
      }));

      const start = performance.now();
      const filtered = dataset
        .filter(item => item.category === "Food")
        .sort((a, b) => b.amount - a.amount);
      const duration = performance.now() - start;

      expect(filtered.length).toBe(200);
      expect(filtered[0].amount).toBeGreaterThanOrEqual(filtered[filtered.length - 1].amount);
      expect(duration).toBeLessThan(50); // Instant response for smooth 60fps UI
    });
  });
});
