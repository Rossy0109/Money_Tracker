import { afterEach, describe, expect, it, vi } from "vitest";
import logger from "./logger";
import {
  DEFAULT_SLOW_REQUEST_MS,
  getPerformanceSummary,
  maybeLogSlowRequest,
  performanceStore,
  slowRequestThresholdMs,
} from "./requestMetrics";

afterEach(() => {
  delete process.env.SLOW_REQUEST_MS;
  performanceStore.reset();
});

describe("performanceStore", () => {
  it("keeps at most maxSamples entries per route", () => {
    for (let i = 0; i < performanceStore.maxSamples + 50; i += 1) {
      performanceStore.record("GET", "/api/healthz", i);
    }
    const stats = performanceStore.getStats("GET", "/api/healthz");
    expect(stats?.count).toBe(performanceStore.maxSamples);
    expect(stats?.count).toBe(1000);
    // Oldest samples are dropped, so the surviving window ends at the newest.
    expect(stats?.p99).toBeGreaterThan(990);
  });

  it("returns null for an untracked route", () => {
    expect(performanceStore.getStats("GET", "/nope")).toBeNull();
  });
});

describe("slowRequestThresholdMs", () => {
  it("defaults to one second", () => {
    expect(slowRequestThresholdMs()).toBe(DEFAULT_SLOW_REQUEST_MS);
    expect(DEFAULT_SLOW_REQUEST_MS).toBe(1000);
  });

  it("is overridden by SLOW_REQUEST_MS", () => {
    process.env.SLOW_REQUEST_MS = "250";
    expect(slowRequestThresholdMs()).toBe(250);
    process.env.SLOW_REQUEST_MS = "not-a-number";
    expect(slowRequestThresholdMs()).toBe(DEFAULT_SLOW_REQUEST_MS);
  });
});

describe("maybeLogSlowRequest", () => {
  it("warns with the route, status, and duration once the threshold is met", () => {
    process.env.SLOW_REQUEST_MS = "250";
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    maybeLogSlowRequest({
      method: "POST",
      path: "/trpc/finance.createTransaction",
      statusCode: 200,
      durationMs: 250,
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      method: "POST",
      path: "/trpc/finance.createTransaction",
      statusCode: 200,
      durationMs: 250,
    });
    expect(warn.mock.calls[0][1]).toBe("Slow request");
  });

  it("stays quiet for requests under the threshold", () => {
    process.env.SLOW_REQUEST_MS = "1000";
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    maybeLogSlowRequest({
      method: "GET",
      path: "/api/healthz",
      statusCode: 200,
      durationMs: 12,
    });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("getPerformanceSummary", () => {
  it("reports an empty summary before any request is recorded", () => {
    const summary = getPerformanceSummary();
    expect(summary.totalRequests).toBe(0);
    expect(summary.p95).toBe(0);
    expect(summary.routeCount).toBe(0);
    expect(summary.slowestRoutes).toEqual([]);
  });

  it("aggregates percentiles across every route", () => {
    for (let i = 1; i <= 100; i += 1) {
      performanceStore.record("GET", "/fast", 10);
      performanceStore.record("POST", "/slow", 1000);
    }
    performanceStore.record("GET", "/fast", 10);

    const summary = getPerformanceSummary();
    expect(summary.totalRequests).toBe(201);
    expect(summary.routeCount).toBe(2);
    expect(summary.p50).toBe(10);
    expect(summary.p95).toBe(1000);
    expect(summary.max).toBe(1000);
    expect(summary.slowRequests).toBe(100);
    expect(summary.slowRequestThresholdMs).toBe(DEFAULT_SLOW_REQUEST_MS);
  });

  it("ranks the slowest routes by p95", () => {
    for (let i = 0; i < 20; i += 1) {
      performanceStore.record("GET", "/quick", 5);
      performanceStore.record("GET", "/draggy", 400);
    }
    const summary = getPerformanceSummary();
    expect(summary.slowestRoutes.map(route => route.route)).toEqual([
      "GET /draggy",
      "GET /quick",
    ]);
    expect(summary.slowestRoutes[0].p95).toBe(400);
    expect(summary.slowestRoutes[1].count).toBe(20);
  });
});
