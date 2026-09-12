import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  classifyNetworkError,
  shouldRetryQuery,
  getRetryDelay,
  notifyNetworkError,
  resetNotificationThrottleForTest,
  fetchWithTimeout,
} from "./lib/networkErrorHandler";

describe("client/src/main.ts - API error handling, network retry, error messages", () => {
  it("initializes QueryClient with smart retry logic and offlineFirst mode", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: (count, err) => shouldRetryQuery(count, err, true),
          retryDelay: (idx, err) => getRetryDelay(idx, err, true),
          networkMode: "offlineFirst",
        },
      },
    });

    const defaultQueries = queryClient.getDefaultOptions().queries;
    expect(defaultQueries?.networkMode).toBe("offlineFirst");
    expect(typeof defaultQueries?.retry).toBe("function");
    expect(typeof defaultQueries?.retryDelay).toBe("function");
  });

  describe("API Error Handling", () => {
    it("handles 500 server errors and provides clear user message", () => {
      const serverError = { data: { httpStatus: 500 } };
      const classified = classifyNetworkError(serverError, true);
      expect(classified.kind).toBe("SERVER_5XX");
      expect(classified.userFacingMessage).toContain("সার্ভারে সমস্যা");
      expect(classified.shouldRetry).toBe(true);
    });

    it("handles 429 rate limit with wait recommendation", () => {
      const rateLimitError = { data: { httpStatus: 429 } };
      const classified = classifyNetworkError(rateLimitError, true);
      expect(classified.kind).toBe("RATE_LIMIT_429");
      expect(classified.userFacingMessage).toContain("খুব বেশি অনুরোধ");
      expect(classified.shouldRetry).toBe(true);
    });

    it("handles malformed JSON responses without endless retry loops", () => {
      const badJson = new SyntaxError("Unexpected token < in JSON at position 0");
      const classified = classifyNetworkError(badJson, true);
      expect(classified.kind).toBe("MALFORMED_RESPONSE");
      expect(classified.shouldRetry).toBe(false);
      expect(classified.userFacingMessage).toContain("অপ্রত্যাশিত উত্তর");
    });
  });

  describe("Network Retry Logic", () => {
    it("retries transient 5xx errors up to 3 times then stops", () => {
      const err = { data: { httpStatus: 503 } };
      expect(shouldRetryQuery(0, err, true)).toBe(true);
      expect(shouldRetryQuery(1, err, true)).toBe(true);
      expect(shouldRetryQuery(2, err, true)).toBe(true);
      expect(shouldRetryQuery(3, err, true)).toBe(false);
    });

    it("does not retry 4xx client errors like 400 or 401", () => {
      const err400 = { data: { httpStatus: 400 } };
      const err401 = { data: { httpStatus: 401 } };
      expect(shouldRetryQuery(0, err400, true)).toBe(false);
      expect(shouldRetryQuery(0, err401, true)).toBe(false);
    });

    it("calculates exponential backoff delay capped at 10 seconds", () => {
      const err = { data: { httpStatus: 500 } };
      expect(getRetryDelay(0, err, true)).toBe(1000);
      expect(getRetryDelay(1, err, true)).toBe(2000);
      expect(getRetryDelay(2, err, true)).toBe(4000);
      expect(getRetryDelay(5, err, true)).toBe(10000);
    });
  });

  describe("Error Messages & Toast Dispatch", () => {
    it("dispatches error toast for 5xx and warning toast for 429", () => {
      resetNotificationThrottleForTest();
      const toastSpy = vi.fn();

      notifyNetworkError({ data: { httpStatus: 502 } }, toastSpy, true);
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining("502"), "error");

      resetNotificationThrottleForTest();
      notifyNetworkError({ data: { httpStatus: 429 } }, toastSpy, true);
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining("খুব বেশি"), "warning");
    });
  });

  describe("Fetch Timeout Abort", () => {
    it("aborts requests exceeding the timeout limit", async () => {
      const slowFetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Request timed out", "AbortError"));
          });
        });
      });
      vi.stubGlobal("fetch", slowFetch);

      await expect(fetchWithTimeout("https://example.com/api", {}, 50)).rejects.toThrow();
      vi.unstubAllGlobals();
    });
  });
});
