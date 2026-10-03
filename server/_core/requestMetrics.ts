/**
 * Request-latency collection for the shared Express pipeline.
 *
 * `performanceStore` already recorded every response time per route but had no
 * reader, so the numbers never reached anyone. This module keeps the store,
 * adds slow-request logging, and exposes one aggregate summary that the health
 * report can surface.
 */

import logger from "./logger";

export const MAX_SAMPLES_PER_ROUTE = 1000;
/** Requests at or above this are logged as `Slow request`. Override with SLOW_REQUEST_MS. */
export const DEFAULT_SLOW_REQUEST_MS = 1000;

export const performanceStore = {
  routes: new Map<string, number[]>(),
  maxSamples: MAX_SAMPLES_PER_ROUTE,
  record(method: string, url: string, ms: number) {
    const key = `${method} ${url}`;
    const samples = this.routes.get(key);
    if (!samples) {
      this.routes.set(key, [ms]);
    } else {
      samples.push(ms);
      if (samples.length > this.maxSamples) samples.shift();
    }
  },
  getStats(method: string, url: string) {
    const key = `${method} ${url}`;
    const samples = this.routes.get(key);
    if (!samples || samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      p50,
      p95,
      p99,
      avg: Math.round(avg * 100) / 100,
      count: sorted.length,
    };
  },
  reset() {
    this.routes.clear();
  },
};

export function slowRequestThresholdMs(): number {
  const raw = Number(process.env.SLOW_REQUEST_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOW_REQUEST_MS;
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

/**
 * Log requests at or above the threshold so a slow endpoint shows up in the
 * log stream without anyone having to ask for a report first.
 */
export function maybeLogSlowRequest(entry: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}): void {
  if (entry.durationMs < slowRequestThresholdMs()) return;
  logger.warn(
    {
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
    },
    "Slow request"
  );
}

export interface PerformanceSummary {
  totalRequests: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  slowRequests: number;
  slowRequestThresholdMs: number;
  routeCount: number;
  /** The five slowest routes by p95, worst first. */
  slowestRoutes: Array<{
    route: string;
    p50: number;
    p95: number;
    count: number;
  }>;
}

/**
 * One aggregate view across every tracked route. Percentiles are computed over
 * the union of samples so a single fast route cannot hide a slow one.
 */
export function getPerformanceSummary(): PerformanceSummary {
  const all: number[] = [];
  const slowest: PerformanceSummary["slowestRoutes"] = [];

  for (const [route, samples] of performanceStore.routes) {
    if (samples.length === 0) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    for (const sample of samples) all.push(sample);
    slowest.push({
      route,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      count: samples.length,
    });
  }

  if (all.length === 0) {
    return {
      totalRequests: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      slowRequests: 0,
      slowRequestThresholdMs: slowRequestThresholdMs(),
      routeCount: 0,
      slowestRoutes: [],
    };
  }

  all.sort((a, b) => a - b);
  const threshold = slowRequestThresholdMs();
  slowest.sort((a, b) => b.p95 - a.p95);

  return {
    totalRequests: all.length,
    p50: percentile(all, 0.5),
    p95: percentile(all, 0.95),
    p99: percentile(all, 0.99),
    max: all[all.length - 1],
    slowRequests: all.filter(sample => sample >= threshold).length,
    slowRequestThresholdMs: threshold,
    routeCount: performanceStore.routes.size,
    slowestRoutes: slowest.slice(0, 5),
  };
}
