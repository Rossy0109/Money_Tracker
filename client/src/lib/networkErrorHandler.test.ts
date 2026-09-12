import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyNetworkError,
  shouldRetryQuery,
  getRetryDelay,
  notifyNetworkError,
  resetNotificationThrottleForTest,
} from "./networkErrorHandler";

describe("Network Error Handling - 6 Error Scenarios", () => {
  beforeEach(() => {
    resetNotificationThrottleForTest();
  });

  // Scenario 1: Network Timeout (30+ seconds)
  describe("Scenario 1: Network Timeout", () => {
    it("classifies AbortError as TIMEOUT and marks for retry", () => {
      const abortError = new DOMException("The user aborted a request.", "AbortError");
      const result = classifyNetworkError(abortError, true);

      expect(result.kind).toBe("TIMEOUT");
      expect(result.shouldRetry).toBe(true);
      expect(result.userFacingMessage).toContain("Timeout");
    });

    it("identifies timeout in error message string", () => {
      const timeoutError = new Error("Gateway timeout occurred");
      const result = classifyNetworkError(timeoutError, true);

      expect(result.kind).toBe("TIMEOUT");
      expect(result.shouldRetry).toBe(true);
    });
  });

  // Scenario 2: Server 5xx Errors (500, 502, 503)
  describe("Scenario 2: Server 5xx Errors", () => {
    it("classifies 500, 502, 503 errors and recommends retry with backoff", () => {
      for (const status of [500, 502, 503, 504]) {
        const error = { data: { httpStatus: status } };
        const result = classifyNetworkError(error, true);

        expect(result.kind).toBe("SERVER_5XX");
        expect(result.statusCode).toBe(status);
        expect(result.shouldRetry).toBe(true);
        expect(result.userFacingMessage).toContain(String(status));
      }
    });

    it("shouldRetryQuery allows retry on 500 up to 3 times", () => {
      const err = { data: { httpStatus: 500 } };
      expect(shouldRetryQuery(0, err, true)).toBe(true);
      expect(shouldRetryQuery(1, err, true)).toBe(true);
      expect(shouldRetryQuery(2, err, true)).toBe(true);
      expect(shouldRetryQuery(3, err, true)).toBe(false); // Max 3 retries
    });
  });

  // Scenario 3: 429 Too Many Requests (Rate Limit)
  describe("Scenario 3: 429 Too Many Requests", () => {
    it("classifies 429 as RATE_LIMIT_429 and applies extended backoff delay", () => {
      const rateLimitError = { data: { httpStatus: 429 } };
      const result = classifyNetworkError(rateLimitError, true);

      expect(result.kind).toBe("RATE_LIMIT_429");
      expect(result.statusCode).toBe(429);
      expect(result.shouldRetry).toBe(true);
      expect(result.userFacingMessage).toContain("অপেক্ষা");

      const delay = getRetryDelay(0, rateLimitError, true);
      expect(delay).toBeGreaterThanOrEqual(5000);
    });

    it("classifies rate limit message in tRPC error string", () => {
      const err = new Error("খুব বেশি চেষ্টার কারণে সাময়িকভাবে বন্ধ রাখা হয়েছে");
      const result = classifyNetworkError(err, true);
      expect(result.kind).toBe("RATE_LIMIT_429");
    });
  });

  // Scenario 4: Malformed API Response
  describe("Scenario 4: Malformed API Response", () => {
    it("classifies SyntaxError / invalid JSON and disables blind retries", () => {
      const jsonError = new SyntaxError("Unexpected token < in JSON at position 0");
      const result = classifyNetworkError(jsonError, true);

      expect(result.kind).toBe("MALFORMED_RESPONSE");
      expect(result.shouldRetry).toBe(false);
      expect(result.userFacingMessage).toContain("অপ্রত্যাশিত উত্তর");
      expect(shouldRetryQuery(0, jsonError, true)).toBe(false);
    });
  });

  // Scenario 5: CORS Errors
  describe("Scenario 5: CORS Errors", () => {
    it("classifies 'Failed to fetch' when online as CORS or security error", () => {
      const corsError = new TypeError("Failed to fetch");
      const result = classifyNetworkError(corsError, true);

      expect(result.kind).toBe("CORS_OR_SECURITY");
      expect(result.shouldRetry).toBe(false);
      expect(result.userFacingMessage).toContain("CORS");
    });
  });

  // Scenario 6: Network Connection Lost
  describe("Scenario 6: Network Connection Lost", () => {
    it("detects offline state when navigator.onLine is false", () => {
      const err = new TypeError("Failed to fetch");
      const result = classifyNetworkError(err, false);

      expect(result.kind).toBe("OFFLINE");
      expect(result.shouldRetry).toBe(true);
      expect(result.userFacingMessage).toContain("ইন্টারনেট সংযোগ বিচ্ছিন্ন");
    });
  });

  // Notification deduplication & mapping
  describe("Notification dispatcher", () => {
    it("dispatches error toast for 5xx and warning for 429", () => {
      const mockToast = vi.fn();

      notifyNetworkError({ data: { httpStatus: 500 } }, mockToast, true);
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("500"), "error");

      resetNotificationThrottleForTest();
      notifyNetworkError({ data: { httpStatus: 429 } }, mockToast, true);
      expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("অপেক্ষা"), "warning");
    });
  });
});
