import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyNetworkError,
  fetchWithTimeout,
  getRetryDelay,
  notifyNetworkError,
  resetNotificationThrottleForTest,
  shouldRetryQuery,
} from "./networkErrorHandler";

describe("Network Resilience Scenarios: 5 Specific Edge Cases", () => {
  beforeEach(() => {
    resetNotificationThrottleForTest();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Scenario 1: Network timeout with exponential backoff
  describe("1. Network timeout with exponential backoff", () => {
    it("aborts when request duration exceeds timeoutMs", async () => {
      const slowFetch = vi.fn((_url: any, options?: any) => {
        return new Promise<Response>((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              reject(new DOMException("The user aborted a request.", "AbortError"));
            });
          }
        });
      });
      globalThis.fetch = slowFetch as any;

      const promise = fetchWithTimeout("https://api.example.com/data", {}, 5000);
      vi.advanceTimersByTime(5001);

      await expect(promise).rejects.toThrow("aborted");
    });

    it("calculates strictly increasing exponential backoff delays across successive retries", () => {
      const timeoutError = new DOMException("Request timed out", "AbortError");

      // Exponential backoff: 1000 * 2^attempt
      const delayAttempt0 = getRetryDelay(0, timeoutError); // 1000ms
      const delayAttempt1 = getRetryDelay(1, timeoutError); // 2000ms
      const delayAttempt2 = getRetryDelay(2, timeoutError); // 4000ms
      const delayAttempt3 = getRetryDelay(3, timeoutError); // 8000ms
      const delayAttempt4 = getRetryDelay(4, timeoutError); // capped at 10000ms

      expect(delayAttempt0).toBe(1000);
      expect(delayAttempt1).toBe(2000);
      expect(delayAttempt2).toBe(4000);
      expect(delayAttempt3).toBe(8000);
      expect(delayAttempt4).toBe(10000);

      expect(delayAttempt1).toBeGreaterThan(delayAttempt0);
      expect(delayAttempt2).toBeGreaterThan(delayAttempt1);
      expect(delayAttempt3).toBeGreaterThan(delayAttempt2);
    });
  });

  // Scenario 2: API 429 rate limit + retry-after header / custom backoff
  describe("2. API 429 rate limit + retry-after / extended backoff", () => {
    it("classifies 429 status and enforces minimum 5-second backoff floor", () => {
      const rateLimitError = {
        data: { httpStatus: 429, message: "Too many requests" },
      };

      const classified = classifyNetworkError(rateLimitError, true);
      expect(classified.kind).toBe("RATE_LIMIT_429");
      expect(classified.statusCode).toBe(429);
      expect(classified.shouldRetry).toBe(true);

      const delay0 = getRetryDelay(0, rateLimitError);
      const delay1 = getRetryDelay(1, rateLimitError);
      const delay2 = getRetryDelay(2, rateLimitError);

      expect(delay0).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeGreaterThanOrEqual(6000);
      expect(delay2).toBeGreaterThanOrEqual(9000);
    });

    it("parses numeric or retry-after formatted messages", () => {
      const retryAfterError = new Error("Rate limit exceeded. Retry after 15 seconds.");
      const classified = classifyNetworkError(retryAfterError, true);

      expect(classified.kind).toBe("RATE_LIMIT_429");
      expect(shouldRetryQuery(0, retryAfterError, true)).toBe(true);
    });
  });

  // Scenario 3: Malformed JSON response handling
  describe("3. Malformed JSON response handling", () => {
    it("handles unexpected non-JSON HTML error page (e.g. 502/Proxy HTML)", () => {
      const syntaxError = new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      const classified = classifyNetworkError(syntaxError, true);

      expect(classified.kind).toBe("MALFORMED_RESPONSE");
      expect(classified.shouldRetry).toBe(false);
      expect(classified.userFacingMessage).toContain("অপ্রত্যাশিত উত্তর");

      // Verify React Query retry is disabled so it doesn't loop forever
      expect(shouldRetryQuery(0, syntaxError, true)).toBe(false);
    });

    it("handles truncated JSON payload error", () => {
      const truncatedError = new SyntaxError("Unexpected end of JSON input");
      const classified = classifyNetworkError(truncatedError, true);

      expect(classified.kind).toBe("MALFORMED_RESPONSE");
      expect(classified.shouldRetry).toBe(false);
    });
  });

  // Scenario 4: CORS error specific handling
  describe("4. CORS error specific handling", () => {
    it("identifies browser CORS block (TypeError: Failed to fetch) while online", () => {
      const corsError = new TypeError("Failed to fetch");
      const isOnline = true; // Browser is online, but fetch failed -> CORS / origin security rejection

      const classified = classifyNetworkError(corsError, isOnline);
      expect(classified.kind).toBe("CORS_OR_SECURITY");
      expect(classified.shouldRetry).toBe(false);
      expect(classified.userFacingMessage).toContain("CORS");
    });

    it("identifies explicit cross-origin restriction message", () => {
      const crossOriginError = new Error("Cross-Origin Request Blocked: The Same Origin Policy disallows reading");
      const classified = classifyNetworkError(crossOriginError, true);

      expect(classified.kind).toBe("CORS_OR_SECURITY");
      expect(shouldRetryQuery(0, crossOriginError, true)).toBe(false);
    });
  });

  // Scenario 5: Connection lost + auto-reconnect
  describe("5. Connection lost + auto-reconnect", () => {
    it("marks query for automatic retry when browser is offline", () => {
      const networkLossError = new TypeError("Failed to fetch");
      const isOnline = false; // Browser is offline

      const classified = classifyNetworkError(networkLossError, isOnline);
      expect(classified.kind).toBe("OFFLINE");
      expect(classified.shouldRetry).toBe(true);
      expect(classified.retryDelayMs).toBe(3000);
      expect(shouldRetryQuery(0, networkLossError, isOnline)).toBe(true);
    });

    it("dispatches warning toast and recovers once connection returns online", () => {
      const mockToast = vi.fn();
      const networkLossError = new TypeError("Failed to fetch");

      // 1. Connection dropped
      notifyNetworkError(networkLossError, mockToast, false);
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining("ইন্টারনেট সংযোগ বিচ্ছিন্ন"),
        "warning"
      );

      // 2. Connection restored
      const onlineState = classifyNetworkError(null, true);
      expect(onlineState.kind).toBe("UNKNOWN");
    });
  });
});
